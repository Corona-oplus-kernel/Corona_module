use std::fs;
use std::path::Path;

use super::{read_text, write_text};

pub(super) fn migrate_legacy_runtime_path(module: &Path, config: &Path, name: &str) {
    let legacy = module.join(name);
    let target = config.join(name);
    if !legacy.exists() {
        return;
    }
    let _ = fs::create_dir_all(config);
    if target.exists() {
        if legacy.is_dir() {
            let _ = fs::remove_dir_all(legacy);
        } else {
            let _ = fs::remove_file(legacy);
        }
        return;
    }
    if fs::rename(&legacy, &target).is_ok() {
        return;
    }
    if legacy.is_file() && fs::copy(&legacy, &target).is_ok() {
        let _ = fs::remove_file(legacy);
    }
}

fn migrate_config_keys(path: &Path, mappings: &[(&str, &str)]) {
    let content = read_text(path);
    if content.is_empty() {
        return;
    }
    let mut changed = false;
    let migrated = content
        .lines()
        .map(|line| {
            let Some((key, value)) = line.split_once('=') else {
                return line.to_string();
            };
            let key = key.trim();
            if let Some((_, replacement)) = mappings.iter().find(|(legacy, _)| *legacy == key) {
                changed = true;
                format!("{replacement}={}", value.trim())
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    if changed {
        let _ = write_text(path, format!("{migrated}\n"));
    }
}

pub(super) fn migrate_v5_configs(module: &Path, config: &Path) {
    for (legacy, current) in [
        ("runtime_optimizer.conf", "auto_affinity.conf"),
        ("daemon.conf", "coronad.conf"),
    ] {
        let legacy = config.join(legacy);
        let current = config.join(current);
        if legacy.is_file() && !current.exists() {
            let _ = fs::rename(legacy, current);
        }
    }
    migrate_config_keys(
        &config.join("auto_affinity.conf"),
        &[
            ("temperature_control", "thermal_control"),
            ("warm_temperature", "thermal_warm_c"),
            ("severe_temperature", "thermal_severe_c"),
        ],
    );
    migrate_config_keys(
        &config.join("hardware_policy.conf"),
        &[
            ("irq", "irq_enabled"),
            ("ufs", "ufs_enabled"),
            ("gpu", "gpu_enabled"),
            ("io", "io_enabled"),
        ],
    );
    migrate_legacy_runtime_path(module, config, ".coronad_state");
}
