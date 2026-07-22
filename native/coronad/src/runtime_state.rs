use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use super::{read_text, write_text};

#[derive(Clone)]
struct ManagedNode {
    owner: &'static str,
    baseline: String,
    target: String,
    conflicts: u8,
    suspended: bool,
}

#[derive(Default)]
pub(super) struct NodeManager {
    nodes: HashMap<PathBuf, ManagedNode>,
    pub(super) applied: u64,
    pub(super) failed: u64,
    pub(super) external_changes: u64,
    pub(super) suspended: usize,
}

pub(super) struct Decision {
    pub(super) tick: u64,
    pub(super) area: &'static str,
    pub(super) action: String,
    pub(super) reason: String,
}

#[derive(Default)]
pub(super) struct DecisionLog {
    pub(super) entries: VecDeque<Decision>,
    last_actions: HashMap<&'static str, String>,
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\n' | '\r' | '|' | '=' => ' ',
            _ => character,
        })
        .collect()
}

impl DecisionLog {
    pub(super) fn record(
        &mut self,
        tick: u64,
        area: &'static str,
        action: String,
        reason: String,
    ) {
        if self.last_actions.get(area) == Some(&action) {
            return;
        }
        self.last_actions.insert(area, action.clone());
        if self.entries.len() >= 32 {
            self.entries.pop_front();
        }
        self.entries.push_back(Decision {
            tick,
            area,
            action: sanitize(&action),
            reason: sanitize(&reason),
        });
    }
}

impl NodeManager {
    pub(super) fn managed_len(&self) -> usize {
        self.nodes.len()
    }

    pub(super) fn apply(
        &mut self,
        owner: &'static str,
        path: &Path,
        value: impl Into<String>,
    ) -> bool {
        self.apply_batch(owner, vec![(path.to_path_buf(), value.into())])
    }

    pub(super) fn apply_batch(
        &mut self,
        owner: &'static str,
        writes: Vec<(PathBuf, String)>,
    ) -> bool {
        if writes.is_empty() {
            return true;
        }
        let mut prepared = Vec::with_capacity(writes.len());
        for (path, value) in writes {
            let current = read_text(&path).trim().to_string();
            if current.is_empty() {
                self.failed += 1;
                return false;
            }
            if let Some(node) = self.nodes.get_mut(&path) {
                if node.owner != owner || node.suspended {
                    self.failed += 1;
                    return false;
                }
                if current != node.target && current != value {
                    node.conflicts = node.conflicts.saturating_add(1);
                    self.external_changes += 1;
                    if node.conflicts >= 3 {
                        node.suspended = true;
                        self.suspended += 1;
                        self.failed += 1;
                        return false;
                    }
                } else if current == node.target {
                    node.conflicts = 0;
                }
            }
            prepared.push((path, value, current));
        }

        let mut changed = Vec::new();
        for (path, value, current) in &prepared {
            if current == value {
                continue;
            }
            if write_text(path, value.as_bytes()).is_err() {
                for (changed_path, previous) in changed.into_iter().rev() {
                    let _ = write_text(changed_path, previous);
                }
                self.failed += 1;
                return false;
            }
            changed.push((path.clone(), current.clone()));
        }

        for (path, value, current) in prepared {
            let baseline = self
                .nodes
                .get(&path)
                .map(|node| node.baseline.clone())
                .unwrap_or(current);
            self.nodes.insert(
                path,
                ManagedNode {
                    owner,
                    baseline,
                    target: value,
                    conflicts: 0,
                    suspended: false,
                },
            );
        }
        self.applied += changed.len() as u64;
        true
    }

    pub(super) fn restore(&mut self, owner: &'static str, path: &Path) -> bool {
        let Some(node) = self.nodes.get(path).cloned() else {
            return true;
        };
        if node.owner != owner {
            self.failed += 1;
            return false;
        }
        let current = read_text(path).trim().to_string();
        if current != node.baseline && write_text(path, node.baseline.as_bytes()).is_err() {
            self.failed += 1;
            return false;
        }
        if current != node.baseline {
            self.applied += 1;
        }
        if node.suspended {
            self.suspended = self.suspended.saturating_sub(1);
        }
        self.nodes.remove(path);
        true
    }

    pub(super) fn restore_owner(&mut self, owner: &'static str) {
        let paths = self
            .nodes
            .iter()
            .filter_map(|(path, node)| (node.owner == owner).then(|| path.clone()))
            .collect::<Vec<_>>();
        for path in paths {
            self.restore(owner, &path);
        }
    }

    pub(super) fn owner_paths(&self, owner: &'static str, prefix: &Path) -> Vec<PathBuf> {
        self.nodes
            .iter()
            .filter_map(|(path, node)| {
                (node.owner == owner && path.starts_with(prefix)).then(|| path.clone())
            })
            .collect()
    }

    pub(super) fn baseline(&self, owner: &'static str, path: &Path) -> Option<&str> {
        self.nodes
            .get(path)
            .filter(|node| node.owner == owner)
            .map(|node| node.baseline.as_str())
    }
}
