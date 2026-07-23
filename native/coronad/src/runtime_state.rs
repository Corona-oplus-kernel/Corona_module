use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use super::{read_text, write_text, write_text_atomic};

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
    pub(super) area: String,
    pub(super) action: String,
    pub(super) reason: String,
}

#[derive(Default)]
pub(super) struct DecisionLog {
    pub(super) entries: VecDeque<Decision>,
    last_actions: HashMap<String, String>,
}

const DECISION_LIMIT: usize = 24;

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
    pub(super) fn load(path: &Path) -> Self {
        let mut log = Self::default();
        for line in read_text(path).lines() {
            let mut parts = line.splitn(4, '|');
            let Some(tick) = parts.next().and_then(|value| value.parse::<u64>().ok()) else {
                continue;
            };
            let (Some(area), Some(action), Some(reason)) =
                (parts.next(), parts.next(), parts.next())
            else {
                continue;
            };
            let area = sanitize(area);
            let action = sanitize(action);
            if area.trim().is_empty() || action.trim().is_empty() {
                continue;
            }
            log.entries.push_back(Decision {
                tick,
                area,
                action,
                reason: sanitize(reason),
            });
            while log.entries.len() > DECISION_LIMIT {
                log.entries.pop_front();
            }
        }
        for decision in &log.entries {
            log.last_actions
                .insert(decision.area.clone(), decision.action.clone());
        }
        log
    }

    pub(super) fn save(&self, path: &Path) {
        let content = self
            .entries
            .iter()
            .map(|decision| {
                format!(
                    "{}|{}|{}|{}",
                    decision.tick, decision.area, decision.action, decision.reason
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let _ = write_text_atomic(path, content);
    }

    pub(super) fn record(
        &mut self,
        tick: u64,
        area: &str,
        action: String,
        reason: String,
    ) -> bool {
        let area = sanitize(area);
        let action = sanitize(&action);
        if area.trim().is_empty() || action.trim().is_empty() {
            return false;
        }
        if self.last_actions.get(&area) == Some(&action) {
            return false;
        }
        self.last_actions.insert(area.clone(), action.clone());
        if self.entries.len() >= DECISION_LIMIT {
            self.entries.pop_front();
        }
        let tick = self
            .entries
            .back()
            .map(|decision| decision.tick.saturating_add(1).max(tick))
            .unwrap_or(tick);
        self.entries.push_back(Decision {
            tick,
            area,
            action,
            reason: sanitize(&reason),
        });
        true
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
            let observed = read_text(&path).trim().to_string();
            let target = if observed.is_empty() { value } else { observed };
            self.nodes.insert(
                path,
                ManagedNode {
                    owner,
                    baseline,
                    target,
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
            .filter(|(_, node)| node.owner == owner)
            .map(|(path, _)| path.clone())
            .collect::<Vec<_>>();
        for path in paths {
            self.restore(owner, &path);
        }
    }

    pub(super) fn owner_paths(&self, owner: &'static str, prefix: &Path) -> Vec<PathBuf> {
        self.nodes
            .iter()
            .filter(|(path, node)| node.owner == owner && path.starts_with(prefix))
            .map(|(path, _)| path.clone())
            .collect()
    }

    pub(super) fn baseline(&self, owner: &'static str, path: &Path) -> Option<&str> {
        self.nodes
            .get(path)
            .filter(|node| node.owner == owner)
            .map(|node| node.baseline.as_str())
    }
}
