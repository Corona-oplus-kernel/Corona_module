use std::collections::{BTreeSet, HashMap, HashSet};
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::io::RawFd;
use std::path::{Path, PathBuf};
use std::process::{self, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

unsafe extern "C" {
    fn sched_setaffinity(pid: i32, cpusetsize: usize, mask: *const u8) -> i32;
    fn sched_setscheduler(pid: i32, policy: i32, param: *const SchedParam) -> i32;
    fn setpriority(which: i32, who: u32, priority: i32) -> i32;
    fn inotify_init1(flags: i32) -> i32;
    fn inotify_add_watch(fd: i32, path: *const u8, mask: u32) -> i32;
    fn read(fd: i32, buffer: *mut u8, count: usize) -> isize;
    fn close(fd: i32) -> i32;
    fn signal(signal: i32, handler: extern "C" fn(i32)) -> usize;
    fn syscall(number: i64, ...) -> i64;
}

#[repr(C)]
struct SchedParam {
    sched_priority: i32,
}

static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static RELOAD_REQUESTED: AtomicBool = AtomicBool::new(false);

fn migrate_legacy_runtime_path(module: &Path, config: &Path, name: &str) {
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

extern "C" fn handle_signal(signal_number: i32) {
    match signal_number {
        1 => RELOAD_REQUESTED.store(true, Ordering::Release),
        2 | 15 => STOP_REQUESTED.store(true, Ordering::Release),
        _ => {}
    }
}

#[derive(Clone)]
struct Paths {
    module: PathBuf,
    config: PathBuf,
    pid: PathBuf,
    state: PathBuf,
    reload: PathBuf,
    stop: PathBuf,
    pressure_baseline: PathBuf,
    affinity_state: PathBuf,
}

impl Paths {
    fn detect() -> Self {
        let module = env::var_os("CORONA_MODDIR")
            .map(PathBuf::from)
            .or_else(|| {
                env::current_exe()
                    .ok()
                    .and_then(|path| path.parent()?.parent().map(Path::to_path_buf))
            })
            .unwrap_or_else(|| PathBuf::from("/data/adb/modules/Corona"));
        let config = env::var_os("CORONA_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| module.join("config"));
        for name in [
            ".coronad.pid",
            ".coronad_state",
            ".coronad.reload",
            ".coronad.stop",
            ".memory_pressure.baseline",
            ".memory_pressure.runtime.conf",
            ".memory_pressure.pid",
            ".auto_affinity_state",
            ".app_policy_daemon.pid",
            ".app_policy_state",
            ".app_policy_effective",
        ] {
            migrate_legacy_runtime_path(&module, &config, name);
        }
        Self {
            pid: config.join(".coronad.pid"),
            state: config.join(".coronad_state"),
            reload: config.join(".coronad.reload"),
            stop: config.join(".coronad.stop"),
            pressure_baseline: config.join(".memory_pressure.baseline"),
            affinity_state: config.join(".auto_affinity_state"),
            module,
            config,
        }
    }
}

#[derive(Clone)]
struct Rules {
    monitor_enabled: bool,
    notify_enabled: bool,
    protect_enabled: bool,
}

#[derive(Clone)]
struct PressureConfig {
    enabled: bool,
    moderate: f64,
    critical: f64,
    moderate_target: u32,
    critical_target: u32,
    interval: u64,
}

#[derive(Clone)]
struct AffinityConfig {
    enabled: bool,
    ebpf: bool,
    default_class: String,
    efficiency: Option<String>,
    balanced: Option<String>,
    performance: Option<String>,
    excluded: BTreeSet<String>,
    scan_interval_ms: u64,
    load_learning: bool,
    thermal_control: bool,
    thermal_warm_c: f64,
    thermal_severe_c: f64,
}

#[derive(Clone)]
struct CpuTopology {
    efficiency: Vec<usize>,
    balanced: Vec<usize>,
    performance: Vec<usize>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RuntimeMode {
    Normal,
    Warm,
    Severe,
    Saver,
    ScreenOff,
}

impl RuntimeMode {
    fn name(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Warm => "warm",
            Self::Severe => "severe",
            Self::Saver => "saver",
            Self::ScreenOff => "screen_off",
        }
    }
}

#[derive(Clone, Default)]
struct ManualRule {
    package: String,
    pattern: String,
    priority: usize,
    nice: Option<i32>,
    io_class: Option<u16>,
    io_level: Option<u16>,
    affinity: Option<Vec<usize>>,
    sched_policy: Option<String>,
    rt_priority: i32,
    cpuset_group: Option<String>,
    walt_boost: bool,
    walt_pipeline: bool,
    uclamp_min: Option<String>,
    uclamp_max: Option<String>,
}

#[derive(Clone)]
struct ThreadState {
    start_time: u64,
    cpu_ticks: u64,
    load_score: i8,
    applied_signature: String,
    last_seen_tick: u64,
}

#[derive(Default)]
struct Stats {
    loops: u64,
    foreground_changes: u64,
    threads_seen: u64,
    threads_new: u64,
    affinity_applied: u64,
    affinity_failed: u64,
    manual_applied: u64,
    reloads: u64,
    top_app_hits: u64,
    dumpsys_fallbacks: u64,
    bpf_events: u64,
    bpf_attach_failures: u64,
}

struct ConfigWatcher {
    fd: RawFd,
}

fn inotify_buffer_has_config_change(buffer: &[u8], length: usize) -> bool {
    const HEADER_SIZE: usize = 16;
    const RELEVANT_MASK: u32 = 0x0008 | 0x0040 | 0x0080 | 0x0100 | 0x0200;
    let mut offset = 0;
    let length = length.min(buffer.len());
    while offset + HEADER_SIZE <= length {
        let mask = u32::from_ne_bytes(buffer[offset + 4..offset + 8].try_into().unwrap());
        let name_length = u32::from_ne_bytes(buffer[offset + 12..offset + 16].try_into().unwrap()) as usize;
        let next = offset.saturating_add(HEADER_SIZE).saturating_add(name_length);
        if next > length {
            break;
        }
        if mask & RELEVANT_MASK != 0 {
            if name_length == 0 {
                return true;
            }
            let name = &buffer[offset + HEADER_SIZE..next];
            let name = &name[..name.iter().position(|byte| *byte == 0).unwrap_or(name.len())];
            if !name.is_empty()
                && name[0] != b'.'
                && (name.ends_with(b".conf") || name.ends_with(b".list") || name == b"app_profiles")
            {
                return true;
            }
        }
        offset = next;
    }
    false
}

impl ConfigWatcher {
    fn new(path: &Path) -> Option<Self> {
        const IN_NONBLOCK: i32 = 0x800;
        const IN_CLOEXEC: i32 = 0x80000;
        const MASK: u32 = 0x0008 | 0x0040 | 0x0080 | 0x0100 | 0x0200;
        let mut bytes = path.as_os_str().as_bytes().to_vec();
        bytes.push(0);
        let fd = unsafe { inotify_init1(IN_NONBLOCK | IN_CLOEXEC) };
        if fd < 0 {
            return None;
        }
        if unsafe { inotify_add_watch(fd, bytes.as_ptr(), MASK) } < 0 {
            unsafe { close(fd) };
            return None;
        }
        Some(Self { fd })
    }

    fn changed(&self) -> bool {
        let mut buffer = [0u8; 4096];
        let length = unsafe { read(self.fd, buffer.as_mut_ptr(), buffer.len()) };
        length > 0 && inotify_buffer_has_config_change(&buffer, length as usize)
    }
}

impl Drop for ConfigWatcher {
    fn drop(&mut self) {
        unsafe { close(self.fd) };
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct BpfInsn {
    code: u8,
    regs: u8,
    offset: i16,
    immediate: i32,
}

impl BpfInsn {
    const fn new(code: u8, destination: u8, source: u8, offset: i16, immediate: i32) -> Self {
        Self {
            code,
            regs: destination | (source << 4),
            offset,
            immediate,
        }
    }
}

#[repr(C)]
#[derive(Default)]
struct BpfMapCreateAttr {
    map_type: u32,
    key_size: u32,
    value_size: u32,
    max_entries: u32,
    map_flags: u32,
    inner_map_fd: u32,
    numa_node: u32,
    map_name: [u8; 16],
    map_ifindex: u32,
    btf_fd: u32,
    btf_key_type_id: u32,
    btf_value_type_id: u32,
    btf_vmlinux_value_type_id: u32,
}

#[repr(C)]
#[derive(Default)]
struct BpfProgLoadAttr {
    prog_type: u32,
    instruction_count: u32,
    instructions: u64,
    license: u64,
    verifier_log_level: u32,
    verifier_log_size: u32,
    verifier_log_buffer: u64,
    kernel_version: u32,
    program_flags: u32,
    program_name: [u8; 16],
    program_ifindex: u32,
    expected_attach_type: u32,
}

#[repr(C)]
#[derive(Default)]
struct BpfRawTracepointAttr {
    name: u64,
    program_fd: u32,
    padding: u32,
}

#[repr(C)]
#[derive(Default)]
struct BpfMapElementAttr {
    map_fd: u32,
    padding: u32,
    key: u64,
    value_or_next_key: u64,
    flags: u64,
}

struct BpfMonitor {
    map_fd: RawFd,
    program_fd: RawFd,
    attach_fd: RawFd,
}

#[derive(Clone, Copy)]
struct BpfAttachError {
    stage: &'static str,
    errno: i32,
}

fn current_errno() -> i32 {
    io::Error::last_os_error().raw_os_error().unwrap_or(-1)
}

impl BpfMonitor {
    fn attach() -> Result<Self, BpfAttachError> {
        const SYS_BPF_AARCH64: i64 = 280;
        const BPF_MAP_CREATE: i32 = 0;
        const BPF_PROG_LOAD: i32 = 5;
        const BPF_RAW_TRACEPOINT_OPEN: i32 = 17;
        const BPF_MAP_TYPE_HASH: u32 = 1;
        const BPF_PROG_TYPE_RAW_TRACEPOINT: u32 = 17;
        let mut map_name = [0u8; 16];
        map_name[..11].copy_from_slice(b"corona_exec");
        let map_attr = BpfMapCreateAttr {
            map_type: BPF_MAP_TYPE_HASH,
            key_size: 4,
            value_size: 4,
            max_entries: 1024,
            map_name,
            ..Default::default()
        };
        let map_fd = unsafe {
            syscall(
                SYS_BPF_AARCH64,
                BPF_MAP_CREATE,
                &map_attr as *const BpfMapCreateAttr,
                std::mem::size_of::<BpfMapCreateAttr>(),
            ) as i32
        };
        if map_fd < 0 {
            return Err(BpfAttachError {
                stage: "map_create",
                errno: current_errno(),
            });
        }
        let instructions = [
            BpfInsn::new(0x85, 0, 0, 0, 14),
            BpfInsn::new(0x77, 0, 0, 0, 32),
            BpfInsn::new(0x63, 10, 0, -4, 0),
            BpfInsn::new(0xb7, 1, 0, 0, 1),
            BpfInsn::new(0x63, 10, 1, -8, 0),
            BpfInsn::new(0x18, 1, 1, 0, map_fd),
            BpfInsn::new(0x00, 0, 0, 0, 0),
            BpfInsn::new(0xbf, 2, 10, 0, 0),
            BpfInsn::new(0x07, 2, 0, 0, -4),
            BpfInsn::new(0xbf, 3, 10, 0, 0),
            BpfInsn::new(0x07, 3, 0, 0, -8),
            BpfInsn::new(0xb7, 4, 0, 0, 0),
            BpfInsn::new(0x85, 0, 0, 0, 2),
            BpfInsn::new(0xb7, 0, 0, 0, 0),
            BpfInsn::new(0x95, 0, 0, 0, 0),
        ];
        let license = b"GPL\0";
        let mut program_name = [0u8; 16];
        program_name[..11].copy_from_slice(b"corona_exec");
        let program_attr = BpfProgLoadAttr {
            prog_type: BPF_PROG_TYPE_RAW_TRACEPOINT,
            instruction_count: instructions.len() as u32,
            instructions: instructions.as_ptr() as u64,
            license: license.as_ptr() as u64,
            program_name,
            ..Default::default()
        };
        let program_fd = unsafe {
            syscall(
                SYS_BPF_AARCH64,
                BPF_PROG_LOAD,
                &program_attr as *const BpfProgLoadAttr,
                std::mem::size_of::<BpfProgLoadAttr>(),
            ) as i32
        };
        if program_fd < 0 {
            let errno = current_errno();
            unsafe { close(map_fd) };
            return Err(BpfAttachError {
                stage: "prog_load",
                errno,
            });
        }
        let tracepoint_name = b"sched_process_exec\0";
        let attach_attr = BpfRawTracepointAttr {
            name: tracepoint_name.as_ptr() as u64,
            program_fd: program_fd as u32,
            padding: 0,
        };
        let attach_fd = unsafe {
            syscall(
                SYS_BPF_AARCH64,
                BPF_RAW_TRACEPOINT_OPEN,
                &attach_attr as *const BpfRawTracepointAttr,
                std::mem::size_of::<BpfRawTracepointAttr>(),
            ) as i32
        };
        if attach_fd < 0 {
            let errno = current_errno();
            unsafe {
                close(program_fd);
                close(map_fd);
            }
            return Err(BpfAttachError {
                stage: "raw_tracepoint_open",
                errno,
            });
        }
        Ok(Self {
            map_fd,
            program_fd,
            attach_fd,
        })
    }

    fn read_events(&self) -> Vec<u32> {
        const SYS_BPF_AARCH64: i64 = 280;
        const BPF_MAP_DELETE_ELEM: i32 = 3;
        const BPF_MAP_GET_NEXT_KEY: i32 = 4;
        let mut events = Vec::new();
        let mut current_key = 0u32;
        let mut has_current = false;
        loop {
            let mut next_key = 0u32;
            let attr = BpfMapElementAttr {
                map_fd: self.map_fd as u32,
                key: if has_current {
                    &current_key as *const u32 as u64
                } else {
                    0
                },
                value_or_next_key: &mut next_key as *mut u32 as u64,
                ..Default::default()
            };
            let result = unsafe {
                syscall(
                    SYS_BPF_AARCH64,
                    BPF_MAP_GET_NEXT_KEY,
                    &attr as *const BpfMapElementAttr,
                    std::mem::size_of::<BpfMapElementAttr>(),
                )
            };
            if result != 0 {
                break;
            }
            events.push(next_key);
            current_key = next_key;
            has_current = true;
        }
        events.sort_unstable();
        events.dedup();
        for event in &events {
            let attr = BpfMapElementAttr {
                map_fd: self.map_fd as u32,
                key: event as *const u32 as u64,
                ..Default::default()
            };
            unsafe {
                syscall(
                    SYS_BPF_AARCH64,
                    BPF_MAP_DELETE_ELEM,
                    &attr as *const BpfMapElementAttr,
                    std::mem::size_of::<BpfMapElementAttr>(),
                );
            }
        }
        events
    }
}

impl Drop for BpfMonitor {
    fn drop(&mut self) {
        unsafe {
            close(self.attach_fd);
            close(self.program_fd);
            close(self.map_fd);
        }
    }
}

struct Daemon {
    paths: Paths,
    rules: Rules,
    pressure: PressureConfig,
    affinity: AffinityConfig,
    topology: CpuTopology,
    manual_rules: Vec<ManualRule>,
    manual_packages: HashSet<String>,
    thread_states: HashMap<i32, ThreadState>,
    watcher: Option<ConfigWatcher>,
    bpf: Option<BpfMonitor>,
    bpf_error: Option<BpfAttachError>,
    runtime_mode: RuntimeMode,
    max_temperature_c: f64,
    battery_saver: bool,
    screen_on: bool,
    stats: Stats,
    pressure_baseline: Option<u32>,
    pressure_last_target: Option<u32>,
    last_foreground: String,
    last_profile: String,
    tick: u64,
    pressure_elapsed_ms: u64,
    protect_elapsed_ms: u64,
    environment_elapsed_ms: u64,
    battery_saver_elapsed_ms: u64,
    fallback_reload_elapsed_ms: u64,
}

fn read_text(path: impl AsRef<Path>) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

fn write_text(path: impl AsRef<Path>, value: impl AsRef<[u8]>) -> io::Result<()> {
    fs::write(path, value)
}

fn parse_key_values(path: impl AsRef<Path>) -> HashMap<String, String> {
    read_text(path)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn effective_config_file(paths: &Paths, name: &str) -> PathBuf {
    let effective = paths.config.join(".app_policy_effective").join(name);
    if effective.is_file() {
        effective
    } else {
        paths.config.join(name)
    }
}

fn value_bool(values: &HashMap<String, String>, key: &str, default: bool) -> bool {
    values
        .get(key)
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

fn process_alive(pid: u32) -> bool {
    Path::new("/proc").join(pid.to_string()).is_dir()
}

fn daemon_pid(paths: &Paths) -> Option<u32> {
    let pid = read_text(&paths.pid).trim().parse().ok()?;
    if !process_alive(pid) {
        return None;
    }
    let cmdline = fs::read(format!("/proc/{pid}/cmdline")).ok()?;
    cmdline
        .windows(b"coronad".len())
        .any(|window| window == b"coronad")
        .then_some(pid)
}

fn run_shell(paths: &Paths, script: &Path, args: &[&OsStr]) -> bool {
    Command::new("/system/bin/sh")
        .arg(script)
        .args(args)
        .env("CORONA_MODDIR", &paths.module)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn spawn_daemon(paths: &Paths) -> io::Result<()> {
    if daemon_pid(paths).is_some() {
        write_text(&paths.reload, b"1")?;
        return Ok(());
    }
    Command::new(env::current_exe()?)
        .arg("daemon")
        .env("CORONA_MODDIR", &paths.module)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    Ok(())
}

fn stop_daemon(paths: &Paths) -> io::Result<()> {
    let Some(pid) = daemon_pid(paths) else {
        let _ = fs::remove_file(&paths.pid);
        return Ok(());
    };
    write_text(&paths.stop, b"1")?;
    for _ in 0..30 {
        if !process_alive(pid) {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}

fn command_output(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        .unwrap_or_default()
}

fn package_from_dumpsys(text: &str) -> Option<String> {
    for line in text.lines() {
        if !(line.contains("topResumedActivity=")
            || line.contains("mResumedActivity:")
            || line.contains("mCurrentFocus=")
            || line.contains("mFocusedApp="))
        {
            continue;
        }
        for token in line.split_ascii_whitespace() {
            let token = token.trim_matches(|character: char| {
                matches!(character, '{' | '}' | '[' | ']' | '(' | ')' | ',' | ':')
            });
            let Some((package, _)) = token.split_once('/') else {
                continue;
            };
            let package = package
                .trim_matches(|character: char| {
                    !character.is_ascii_alphanumeric()
                        && character != '.'
                        && character != '_'
                        && character != '-'
                })
                .to_string();
            if package.contains('.')
                && package != "me.weishu.kernelsu"
                && package != "com.android.shell"
            {
                return Some(package);
            }
        }
    }
    None
}

fn package_from_pid(pid: u32) -> Option<String> {
    let package = process_base_from_pid(pid)?;
    if package.contains('.')
        && package != "android"
        && package != "com.android.shell"
        && package != "me.weishu.kernelsu"
    {
        Some(package)
    } else {
        None
    }
}

fn process_base_from_pid(pid: u32) -> Option<String> {
    let cmdline = fs::read(proc_root().join(pid.to_string()).join("cmdline")).ok()?;
    let process_name = String::from_utf8_lossy(cmdline.split(|byte| *byte == 0).next()?).to_string();
    let base = process_name.split(':').next().unwrap_or_default().trim();
    (!base.is_empty()).then(|| base.to_string())
}

fn top_app_package() -> Option<String> {
    let configured = env::var_os("CORONA_TOP_APP_FILES")
        .map(|value| value.to_string_lossy().split(':').map(PathBuf::from).collect::<Vec<_>>());
    let files = configured.unwrap_or_else(|| {
        vec![
            PathBuf::from("/dev/cpuset/top-app/cgroup.procs"),
            PathBuf::from("/dev/cpuset/top-app/tasks"),
            PathBuf::from("/sys/fs/cgroup/top-app/cgroup.procs"),
        ]
    });
    for file in files {
        let mut pids = read_text(file)
            .split_ascii_whitespace()
            .filter_map(|value| value.parse::<u32>().ok())
            .collect::<Vec<_>>();
        pids.reverse();
        for pid in pids {
            if let Some(package) = package_from_pid(pid) {
                return Some(package);
            }
        }
    }
    None
}

fn foreground_package() -> (String, &'static str) {
    if let Some(package) = top_app_package() {
        return (package, "top-app");
    }
    let package = package_from_dumpsys(&command_output(
        "/system/bin/dumpsys",
        &["activity", "activities"],
    ))
    .or_else(|| {
        package_from_dumpsys(&command_output(
            "/system/bin/dumpsys",
            &["window", "windows"],
        ))
    })
    .unwrap_or_default();
    (package, "dumpsys")
}

fn csv_contains(csv: &str, item: &str) -> bool {
    csv.split(',').any(|entry| entry.trim() == item)
}

fn profile_exists(paths: &Paths, package: &str) -> bool {
    let rules = parse_key_values(paths.config.join("app_rules.conf"));
    if rules
        .get("profiles")
        .map(|csv| csv_contains(csv, package))
        .unwrap_or(false)
    {
        return true;
    }
    if read_text(paths.config.join("app_profiles.list"))
        .lines()
        .any(|entry| entry.trim() == package)
    {
        return true;
    }
    fs::read_dir(paths.config.join("app_profiles").join(package))
        .map(|entries| entries.flatten().any(|entry| entry.path().is_file()))
        .unwrap_or(false)
}

fn has_nonempty_lines(path: impl AsRef<Path>) -> bool {
    read_text(path)
        .lines()
        .any(|line| !line.trim().is_empty() && !line.trim().starts_with('#'))
}

fn load_rules(paths: &Paths) -> Rules {
    let values = parse_key_values(paths.config.join("app_rules.conf"));
    Rules {
        monitor_enabled: value_bool(&values, "monitor_enabled", true),
        notify_enabled: value_bool(&values, "notify_enabled", true),
        protect_enabled: has_nonempty_lines(paths.config.join("app_protect.list")),
    }
}

fn load_pressure(paths: &Paths) -> PressureConfig {
    let runtime = paths.config.join(".memory_pressure.runtime.conf");
    let values = if runtime.is_file() {
        parse_key_values(runtime)
    } else {
        parse_key_values(paths.config.join("memory_pressure.conf"))
    };
    let profile = values.get("profile").map(String::as_str).unwrap_or("balanced");
    let (moderate, critical, moderate_target, critical_target, interval) = match profile {
        "sensitive" => (0.50, 2.00, 170, 200, 4),
        "conservative" => (2.00, 8.00, 140, 180, 8),
        _ => (1.00, 5.00, 160, 200, 6),
    };
    PressureConfig {
        enabled: value_bool(&values, "enabled", false),
        moderate,
        critical,
        moderate_target,
        critical_target,
        interval,
    }
}

fn load_affinity(paths: &Paths) -> AffinityConfig {
    let values = parse_key_values(paths.config.join("auto_affinity.conf"));
    let excluded = values
        .get("exclude_packages")
        .map(|value| value.split(',').map(|item| item.trim().to_string()).collect())
        .unwrap_or_default();
    let default_class = values
        .get("default_class")
        .map(String::as_str)
        .filter(|value| matches!(*value, "efficiency" | "balanced" | "performance"))
        .unwrap_or("balanced")
        .to_string();
    AffinityConfig {
        enabled: value_bool(&values, "enabled", false),
        ebpf: value_bool(&values, "ebpf", true),
        default_class,
        efficiency: values.get("efficiency_cpus").filter(|value| !value.is_empty()).cloned(),
        balanced: values.get("balanced_cpus").filter(|value| !value.is_empty()).cloned(),
        performance: values.get("performance_cpus").filter(|value| !value.is_empty()).cloned(),
        excluded,
        scan_interval_ms: values
            .get("scan_interval_ms")
            .and_then(|value| value.parse().ok())
            .unwrap_or(1000)
            .clamp(250, 10_000),
        load_learning: value_bool(&values, "load_learning", true),
        thermal_control: value_bool(&values, "thermal_control", true),
        thermal_warm_c: values
            .get("thermal_warm_c")
            .and_then(|value| value.parse().ok())
            .unwrap_or(75.0),
        thermal_severe_c: values
            .get("thermal_severe_c")
            .and_then(|value| value.parse().ok())
            .unwrap_or(100.0),
    }
}

fn parse_cpu_list(value: &str) -> Vec<usize> {
    let mut cpus = BTreeSet::new();
    for part in value.replace(' ', ",").split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((start, end)) = part.split_once('-') {
            if let (Ok(start), Ok(end)) = (start.parse::<usize>(), end.parse::<usize>()) {
                for cpu in start..=end {
                    cpus.insert(cpu);
                }
            }
        } else if let Ok(cpu) = part.parse::<usize>() {
            cpus.insert(cpu);
        }
    }
    cpus.into_iter().collect()
}

fn detect_topology(config: &AffinityConfig) -> CpuTopology {
    let cpu_root = env::var_os("CORONA_CPU_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/sys/devices/system/cpu"));
    let online = parse_cpu_list(&read_text(cpu_root.join("online")));
    let mut policies = Vec::new();
    if let Ok(entries) = fs::read_dir(cpu_root.join("cpufreq")) {
        for entry in entries.flatten() {
            if !entry.file_name().as_bytes().starts_with(b"policy") {
                continue;
            }
            let path = entry.path();
            let related = read_text(path.join("related_cpus"));
            let cpus = if related.trim().is_empty() {
                parse_cpu_list(&read_text(path.join("affected_cpus")))
            } else {
                parse_cpu_list(&related)
            };
            let frequency = read_text(path.join("cpuinfo_max_freq"))
                .trim()
                .parse::<u64>()
                .or_else(|_| read_text(path.join("scaling_max_freq")).trim().parse())
                .unwrap_or(0);
            if !cpus.is_empty() {
                policies.push((frequency, cpus));
            }
        }
    }
    policies.sort_by_key(|entry| entry.0);
    let efficiency = config
        .efficiency
        .as_deref()
        .map(parse_cpu_list)
        .filter(|cpus| !cpus.is_empty())
        .or_else(|| policies.first().map(|entry| entry.1.clone()))
        .unwrap_or_else(|| online.clone());
    let performance = config
        .performance
        .as_deref()
        .map(parse_cpu_list)
        .filter(|cpus| !cpus.is_empty())
        .or_else(|| policies.last().map(|entry| entry.1.clone()))
        .unwrap_or_else(|| online.clone());
    let balanced = config
        .balanced
        .as_deref()
        .map(parse_cpu_list)
        .filter(|cpus| !cpus.is_empty())
        .unwrap_or(online);
    CpuTopology {
        efficiency,
        balanced,
        performance,
    }
}

fn glob_matches(pattern: &str, text: &str) -> bool {
    let mut row = vec![false; text.len() + 1];
    row[0] = true;
    for token in pattern.bytes() {
        let mut next = vec![false; text.len() + 1];
        if token == b'*' {
            next[0] = row[0];
            for index in 1..=text.len() {
                next[index] = row[index] || next[index - 1];
            }
        } else {
            for index in 1..=text.len() {
                next[index] = row[index - 1]
                    && (token == b'?' || token == text.as_bytes()[index - 1]);
            }
        }
        row = next;
    }
    row[text.len()]
}

fn classify_thread<'a>(package: &str, thread_name: &str, default_class: &'a str) -> &'a str {
    let lower = thread_name.to_ascii_lowercase();
    let package_tail = package.rsplit('.').next().unwrap_or(package);
    if thread_name == package
        || thread_name == package_tail
        || [
            "renderthread",
            "uithread",
            "glthread",
            "gamethread",
            "rhithread",
            "unitymain",
            "ue4",
            "gpu completion",
            "hwuitask",
            "vulkan",
        ]
        .iter()
        .any(|name| lower.contains(name))
    {
        "performance"
    } else if [
        "finalizer",
        "referencequeue",
        "heap task daemon",
        "heaptaskdaemon",
        "profile saver",
        "signal catcher",
        "jdwp",
        "jit thread pool",
    ]
    .iter()
    .any(|name| lower.contains(name))
    {
        "efficiency"
    } else {
        default_class
    }
}

fn adapt_class<'a>(class: &'a str, mode: RuntimeMode) -> &'a str {
    match mode {
        RuntimeMode::Normal => class,
        RuntimeMode::Warm => match class {
            "performance" => "balanced",
            _ => class,
        },
        RuntimeMode::Severe | RuntimeMode::Saver | RuntimeMode::ScreenOff => match class {
            "performance" | "balanced" => "efficiency",
            _ => class,
        },
    }
}

fn next_load_score(current: i8, delta: u64, enabled: bool) -> i8 {
    if !enabled {
        return current;
    }
    if delta >= 20 {
        (current + 1).min(4)
    } else if delta <= 1 {
        (current - 1).max(-4)
    } else if current > 0 {
        current - 1
    } else if current < 0 {
        current + 1
    } else {
        0
    }
}

fn set_affinity(tid: i32, cpus: &[usize]) -> bool {
    let Some(max_cpu) = cpus.iter().max().copied() else {
        return false;
    };
    let mut mask = vec![0u8; max_cpu / 8 + 1];
    for &cpu in cpus {
        mask[cpu / 8] |= 1 << (cpu % 8);
    }
    unsafe { sched_setaffinity(tid, mask.len(), mask.as_ptr()) == 0 }
}

fn parse_affinity(value: &str) -> Option<Vec<usize>> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.contains('-') || value.contains(',') {
        let cpus = parse_cpu_list(value);
        return (!cpus.is_empty()).then_some(cpus);
    }
    if let Some(hex) = value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")) {
        return parse_hex_mask(hex);
    }
    if value.bytes().any(|byte| matches!(byte, b'a'..=b'f' | b'A'..=b'F')) {
        return parse_hex_mask(value);
    }
    value.parse::<usize>().ok().map(|cpu| vec![cpu])
}

fn parse_hex_mask(value: &str) -> Option<Vec<usize>> {
    let mut cpus = Vec::new();
    for (nibble_index, character) in value.chars().rev().enumerate() {
        let nibble = character.to_digit(16)?;
        for bit in 0..4 {
            if nibble & (1 << bit) != 0 {
                cpus.push(nibble_index * 4 + bit as usize);
            }
        }
    }
    (!cpus.is_empty()).then_some(cpus)
}

fn rule_priority(pattern: &str) -> usize {
    if pattern.is_empty() {
        1
    } else if !pattern.contains('*') && !pattern.contains('?') {
        10_000 + pattern.len()
    } else {
        1_000 + pattern.bytes().filter(|byte| *byte != b'*' && *byte != b'?').count()
    }
}

fn load_manual_rules(paths: &Paths) -> Vec<ManualRule> {
    let mut rules = Vec::new();
    for line in read_text(effective_config_file(paths, "thread_priority.conf")).lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((target, values)) = line.split_once('=') else {
            continue;
        };
        let Some((package, pattern)) = target.trim().split_once('|') else {
            continue;
        };
        let fields = values.split('|').map(str::trim).collect::<Vec<_>>();
        let field = |index: usize| fields.get(index).copied().unwrap_or("");
        rules.push(ManualRule {
            package: package.to_string(),
            pattern: pattern.to_string(),
            priority: rule_priority(pattern),
            nice: field(0).parse().ok(),
            io_class: field(1).parse().ok(),
            io_level: field(2).parse().ok(),
            affinity: parse_affinity(field(3)),
            sched_policy: (!field(4).is_empty()).then(|| field(4).to_string()),
            rt_priority: field(5).parse().unwrap_or(1),
            cpuset_group: (!field(6).is_empty()).then(|| field(6).to_string()),
            walt_boost: field(7) == "1",
            walt_pipeline: field(8) == "1",
            uclamp_min: (!field(9).is_empty()).then(|| field(9).to_string()),
            uclamp_max: (!field(10).is_empty()).then(|| field(10).to_string()),
        });
    }
    rules.sort_by(|left, right| right.priority.cmp(&left.priority));
    rules
}

fn matching_manual_rule<'a>(
    rules: &'a [ManualRule],
    package: &str,
    thread_name: &str,
) -> Option<&'a ManualRule> {
    rules.iter().find(|rule| {
        rule.package == package
            && if rule.pattern.contains('*') || rule.pattern.contains('?') {
                glob_matches(&rule.pattern, thread_name)
            } else {
                rule.pattern == thread_name
            }
    })
}

fn set_nice(tid: i32, value: i32) -> bool {
    unsafe { setpriority(0, tid as u32, value) == 0 }
}

fn set_ioprio(tid: i32, class: u16, level: u16) -> bool {
    const SYS_IOPRIO_SET_AARCH64: i64 = 30;
    let priority = ((class as i32) << 13) | (level.min(7) as i32);
    unsafe { syscall(SYS_IOPRIO_SET_AARCH64, 1i32, tid, priority) == 0 }
}

fn set_scheduler(tid: i32, policy: &str, priority: i32) -> bool {
    let policy_number = match policy {
        "other" => 0,
        "fifo" => 1,
        "rr" => 2,
        "batch" => 3,
        "idle" => 5,
        _ => return false,
    };
    let param = SchedParam {
        sched_priority: if matches!(policy, "fifo" | "rr") {
            priority.clamp(1, 99)
        } else {
            0
        },
    };
    unsafe { sched_setscheduler(tid, policy_number, &param) == 0 }
}

fn add_to_group(root: &str, group: &str, tid: i32) -> bool {
    if group.contains("..") || group.starts_with('/') {
        return false;
    }
    let path = Path::new(root).join(group).join("tasks");
    path.is_file() && write_text(path, tid.to_string()).is_ok()
}

fn apply_uclamp(rule: &ManualRule, tid: i32) {
    if rule.uclamp_min.is_none() && rule.uclamp_max.is_none() {
        return;
    }
    let min = rule.uclamp_min.as_deref().unwrap_or("0");
    let max = rule.uclamp_max.as_deref().unwrap_or("1024");
    let vendor = Path::new("/proc/oplus_qos_sched/qos_task_uclamp");
    if vendor.is_file() && write_text(vendor, format!("{tid} {min} {max}")).is_ok() {
        return;
    }
    let Some(group) = rule.cpuset_group.as_deref() else {
        return;
    };
    let root = Path::new("/dev/cpuctl").join(group);
    if let Some(value) = &rule.uclamp_min {
        let _ = write_text(root.join("cpu.uclamp.min"), value);
    }
    if let Some(value) = &rule.uclamp_max {
        let _ = write_text(root.join("cpu.uclamp.max"), value);
    }
    let _ = write_text(root.join("tasks"), tid.to_string());
}

fn apply_manual_rule(rule: &ManualRule, tid: i32) -> bool {
    let mut changed = false;
    if let Some(value) = rule.nice {
        changed |= set_nice(tid, value);
    }
    if let (Some(class), Some(level)) = (rule.io_class, rule.io_level) {
        changed |= set_ioprio(tid, class, level);
    }
    if let Some(cpus) = &rule.affinity {
        changed |= set_affinity(tid, cpus);
    }
    if let Some(policy) = &rule.sched_policy {
        changed |= set_scheduler(tid, policy, rule.rt_priority);
    }
    if let Some(group) = &rule.cpuset_group {
        changed |= add_to_group("/dev/cpuset", group, tid);
    }
    apply_uclamp(rule, tid);
    changed
}

fn apply_walt_hints(rules: &[ManualRule]) {
    if rules.iter().any(|rule| rule.walt_boost) {
        let _ = write_text("/proc/sys/walt/sched_per_task_boost", b"1");
        let _ = write_text("/proc/sys/walt/task_reduce_affinity", b"0");
    }
    if rules.iter().any(|rule| rule.walt_pipeline) {
        let _ = write_text("/proc/sys/walt/sched_pipeline_special", b"1");
    }
}

fn scan_requested_processes(packages: &HashSet<String>) -> HashMap<String, Vec<u32>> {
    let mut found = HashMap::<String, Vec<u32>>::new();
    let root = proc_root();
    let Ok(entries) = fs::read_dir(root) else {
        return found;
    };
    for entry in entries.flatten() {
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
            continue;
        };
        let Ok(cmdline) = fs::read(entry.path().join("cmdline")) else {
            continue;
        };
        let process_name = String::from_utf8_lossy(cmdline.split(|byte| *byte == 0).next().unwrap_or_default());
        let base = process_name.split(':').next().unwrap_or_default();
        if packages.contains(base) {
            found.entry(base.to_string()).or_default().push(pid);
        }
    }
    found
}

fn proc_root() -> PathBuf {
    env::var_os("CORONA_PROC_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/proc"))
}

fn cpu_list_string(cpus: &[usize]) -> String {
    cpus.iter().map(usize::to_string).collect::<Vec<_>>().join(",")
}

fn parse_task_stat(path: &Path) -> Option<(u64, u64)> {
    parse_task_stat_text(&read_text(path))
}

fn parse_task_stat_text(stat: &str) -> Option<(u64, u64)> {
    let close = stat.rfind(") ")?;
    let fields = stat[close + 2..].split_ascii_whitespace().collect::<Vec<_>>();
    let user_ticks = fields.get(11)?.parse::<u64>().ok()?;
    let system_ticks = fields.get(12)?.parse::<u64>().ok()?;
    let start_time = fields.get(19)?.parse::<u64>().ok()?;
    Some((user_ticks + system_ticks, start_time))
}

fn pressure_avg10() -> Option<f64> {
    for line in read_text("/proc/pressure/memory").lines() {
        if !line.starts_with("some ") {
            continue;
        }
        for field in line.split_ascii_whitespace() {
            if let Some(value) = field.strip_prefix("avg10=") {
                return value.parse().ok();
            }
        }
    }
    None
}

fn read_u32(path: impl AsRef<Path>) -> Option<u32> {
    read_text(path).trim().parse().ok()
}

fn write_swappiness(value: u32) {
    for path in [
        Path::new("/proc/sys/vm/swappiness"),
        Path::new("/dev/memcg/apps/memory.swappiness"),
    ] {
        if path.exists() && read_u32(path) != Some(value) {
            let _ = write_text(path, value.to_string());
        }
    }
}

fn pressure_target(config: &PressureConfig, baseline: u32, avg10: f64) -> u32 {
    if avg10 >= config.critical {
        config.critical_target
    } else if avg10 >= config.moderate {
        config.moderate_target
    } else {
        baseline
    }
}

fn notify_profile(package: &str, base: bool) {
    let text = if base {
        "已恢复默认配置".to_string()
    } else {
        format!("已切换到 {package}")
    };
    let _ = Command::new("/system/bin/cmd")
        .args([
            "notification",
            "post",
            "-S",
            "bigtext",
            "-t",
            "Corona 应用预设",
            "corona_app_policy",
            &text,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn max_temperature_c() -> f64 {
    let root = env::var_os("CORONA_THERMAL_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/sys/class/thermal"));
    let mut maximum = 0.0f64;
    let Ok(entries) = fs::read_dir(root) else {
        return maximum;
    };
    for entry in entries.flatten() {
        if !entry.file_name().as_bytes().starts_with(b"thermal_zone") {
            continue;
        }
        let raw = read_text(entry.path().join("temp")).trim().parse::<f64>().ok();
        let Some(mut temperature) = raw else {
            continue;
        };
        if temperature > 1000.0 {
            temperature /= 1000.0;
        }
        if (0.0..150.0).contains(&temperature) {
            maximum = maximum.max(temperature);
        }
    }
    maximum
}

fn screen_is_on() -> bool {
    let root = env::var_os("CORONA_BACKLIGHT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/sys/class/backlight"));
    let Ok(entries) = fs::read_dir(root) else {
        return true;
    };
    let mut found = false;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        found = true;
        if read_u32(entry.path().join("brightness")).unwrap_or(0) > 0 {
            return true;
        }
    }
    !found
}

fn battery_saver_enabled() -> bool {
    command_output("/system/bin/settings", &["get", "global", "low_power"]).trim() == "1"
}

fn runtime_mode(config: &AffinityConfig, temperature: f64, saver: bool, screen_on: bool) -> RuntimeMode {
    if !screen_on {
        RuntimeMode::ScreenOff
    } else if saver {
        RuntimeMode::Saver
    } else if config.thermal_control && temperature >= config.thermal_severe_c {
        RuntimeMode::Severe
    } else if config.thermal_control && temperature >= config.thermal_warm_c {
        RuntimeMode::Warm
    } else {
        RuntimeMode::Normal
    }
}

fn constrain_daemon(topology: &CpuTopology) {
    let pid = process::id() as i32;
    let _ = set_affinity(pid, &topology.efficiency);
    let _ = set_nice(pid, 10);
    let _ = set_ioprio(pid, 3, 7);
    let _ = set_scheduler(pid, "batch", 0);
}

fn bpf_should_attach(config: &AffinityConfig, manual_rules: &[ManualRule]) -> bool {
    config.ebpf && (config.enabled || !manual_rules.is_empty())
}

impl Daemon {
    fn new(paths: Paths) -> Self {
        let affinity = load_affinity(&paths);
        let topology = detect_topology(&affinity);
        let manual_rules = load_manual_rules(&paths);
        let manual_packages = manual_rules
            .iter()
            .map(|rule| rule.package.clone())
            .collect();
        let pressure_baseline = read_u32("/proc/sys/vm/swappiness");
        let bpf_requested = bpf_should_attach(&affinity, &manual_rules);
        let (bpf, bpf_error) = if bpf_requested {
            match BpfMonitor::attach() {
                Ok(monitor) => (Some(monitor), None),
                Err(error) => (None, Some(error)),
            }
        } else {
            (None, None)
        };
        let mut stats = Stats::default();
        if bpf_requested && bpf.is_none() {
            stats.bpf_attach_failures = 1;
        }
        let mut daemon = Self {
            rules: load_rules(&paths),
            pressure: load_pressure(&paths),
            topology,
            manual_rules,
            manual_packages,
            thread_states: HashMap::new(),
            watcher: ConfigWatcher::new(&paths.config),
            bpf,
            bpf_error,
            runtime_mode: RuntimeMode::Normal,
            max_temperature_c: 0.0,
            battery_saver: false,
            screen_on: true,
            stats,
            affinity,
            pressure_baseline,
            pressure_last_target: None,
            last_foreground: String::new(),
            last_profile: String::new(),
            tick: 0,
            pressure_elapsed_ms: 0,
            protect_elapsed_ms: 0,
            environment_elapsed_ms: 10_000,
            battery_saver_elapsed_ms: 30_000,
            fallback_reload_elapsed_ms: 0,
            paths,
        };
        daemon.update_environment();
        constrain_daemon(&daemon.topology);
        apply_walt_hints(&daemon.manual_rules);
        daemon
    }

    fn reload(&mut self) {
        let old_pressure_enabled = self.pressure.enabled;
        let old_ebpf_requested = bpf_should_attach(&self.affinity, &self.manual_rules);
        self.rules = load_rules(&self.paths);
        self.pressure = load_pressure(&self.paths);
        if old_pressure_enabled && !self.pressure.enabled {
            if let Some(baseline) = self.pressure_baseline {
                write_swappiness(baseline);
            }
            let _ = fs::remove_file(&self.paths.pressure_baseline);
        }
        self.affinity = load_affinity(&self.paths);
        self.topology = detect_topology(&self.affinity);
        self.manual_rules = load_manual_rules(&self.paths);
        self.manual_packages = self
            .manual_rules
            .iter()
            .map(|rule| rule.package.clone())
            .collect();
        let new_ebpf_requested = bpf_should_attach(&self.affinity, &self.manual_rules);
        if old_ebpf_requested != new_ebpf_requested || (new_ebpf_requested && self.bpf.is_none()) {
            if new_ebpf_requested {
                match BpfMonitor::attach() {
                    Ok(monitor) => {
                        self.bpf = Some(monitor);
                        self.bpf_error = None;
                    }
                    Err(error) => {
                        self.bpf = None;
                        self.bpf_error = Some(error);
                        self.stats.bpf_attach_failures += 1;
                    }
                }
            } else {
                self.bpf = None;
                self.bpf_error = None;
            }
        }
        self.thread_states.clear();
        apply_walt_hints(&self.manual_rules);
        constrain_daemon(&self.topology);
        self.pressure_elapsed_ms = 0;
        self.pressure_last_target = None;
        self.stats.reloads += 1;
    }

    fn apply_profile(&mut self, foreground: &str) -> bool {
        let target_profile = if self.rules.monitor_enabled
            && !foreground.is_empty()
            && profile_exists(&self.paths, foreground)
        {
            foreground
        } else {
            "base"
        };
        if target_profile == self.last_profile {
            return false;
        }
        let profile_dir = if target_profile == "base" {
            self.paths.config.clone()
        } else {
            self.paths.config.join("app_profiles").join(target_profile)
        };
        let service = self.paths.module.join("service.sh");
        run_shell(
            &self.paths,
            &service,
            &[OsStr::new("--apply-runtime-delta"), profile_dir.as_os_str()],
        );
        self.manual_rules = load_manual_rules(&self.paths);
        self.manual_packages = self
            .manual_rules
            .iter()
            .map(|rule| rule.package.clone())
            .collect();
        self.thread_states.clear();
        apply_walt_hints(&self.manual_rules);
        if self.rules.notify_enabled {
            notify_profile(foreground, target_profile == "base");
        }
        self.last_profile = target_profile.to_string();
        true
    }

    fn update_environment(&mut self) {
        self.max_temperature_c = max_temperature_c();
        self.screen_on = screen_is_on();
        self.battery_saver_elapsed_ms += 10_000;
        if self.battery_saver_elapsed_ms >= 30_000 {
            self.battery_saver_elapsed_ms = 0;
            self.battery_saver = battery_saver_enabled();
        }
        let next = runtime_mode(
            &self.affinity,
            self.max_temperature_c,
            self.battery_saver,
            self.screen_on,
        );
        if next != self.runtime_mode {
            self.runtime_mode = next;
            for state in self.thread_states.values_mut() {
                state.applied_signature.clear();
            }
        }
    }

    fn thread_class(&self, package: &str, thread_name: &str, tid: i32, pid: u32, score: i8) -> &str {
        let base = if tid == pid as i32 {
            "performance"
        } else if self.affinity.load_learning && score >= 2 {
            "performance"
        } else if self.affinity.load_learning && score <= -3 {
            "efficiency"
        } else {
            classify_thread(package, thread_name, &self.affinity.default_class)
        };
        adapt_class(base, self.runtime_mode)
    }

    fn scan_package(&mut self, package: &str, automatic: bool, pids: &[u32]) {
        if package.is_empty() {
            return;
        }
        let auto_enabled = automatic
            && self.affinity.enabled
            && !self.affinity.excluded.contains(package);
        if !auto_enabled && !self.manual_packages.contains(package) {
            return;
        }
        for &pid in pids {
            let task_root = proc_root().join(pid.to_string()).join("task");
            let Ok(tasks) = fs::read_dir(task_root) else {
                continue;
            };
            for task in tasks.flatten() {
                let Ok(tid) = task.file_name().to_string_lossy().parse::<i32>() else {
                    continue;
                };
                let thread_name = read_text(task.path().join("comm")).trim().to_string();
                let Some((cpu_ticks, start_time)) = parse_task_stat(&task.path().join("stat")) else {
                    continue;
                };
                if thread_name.is_empty() {
                    continue;
                }
                self.stats.threads_seen += 1;
                let previous = self.thread_states.get(&tid).cloned();
                let is_new = previous
                    .as_ref()
                    .map(|state| state.start_time != start_time)
                    .unwrap_or(true);
                if is_new {
                    self.stats.threads_new += 1;
                }
                let delta = previous
                    .as_ref()
                    .filter(|state| state.start_time == start_time)
                    .map(|state| cpu_ticks.saturating_sub(state.cpu_ticks))
                    .unwrap_or(0);
                let mut load_score = previous
                    .as_ref()
                    .filter(|state| state.start_time == start_time)
                    .map(|state| state.load_score)
                    .unwrap_or(0);
                load_score = next_load_score(load_score, delta, self.affinity.load_learning);
                let manual = matching_manual_rule(&self.manual_rules, package, &thread_name).cloned();
                let auto_plan = if auto_enabled
                    && manual.as_ref().and_then(|rule| rule.affinity.as_ref()).is_none()
                {
                    let class = self.thread_class(package, &thread_name, tid, pid, load_score);
                    let cpus = match class {
                        "efficiency" => &self.topology.efficiency,
                        "performance" => &self.topology.performance,
                        _ => &self.topology.balanced,
                    };
                    Some((
                        format!("auto:{class}:{}", cpu_list_string(cpus)),
                        cpus.clone(),
                    ))
                } else {
                    None
                };
                let signature = [
                    manual.as_ref().map(|rule| format!("manual:{}", rule.priority)),
                    auto_plan.as_ref().map(|plan| plan.0.clone()),
                ]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join("+");
                let needs_apply = previous
                    .as_ref()
                    .map(|state| state.applied_signature.as_str())
                    != Some(signature.as_str());
                if needs_apply {
                    if let Some(rule) = &manual {
                        if apply_manual_rule(rule, tid) {
                            self.stats.manual_applied += 1;
                        }
                    }
                    if let Some((_, cpus)) = &auto_plan {
                        if set_affinity(tid, cpus) {
                            self.stats.affinity_applied += 1;
                        } else {
                            self.stats.affinity_failed += 1;
                        }
                    }
                }
                self.thread_states.insert(
                    tid,
                    ThreadState {
                        start_time,
                        cpu_ticks,
                        load_score,
                        applied_signature: signature,
                        last_seen_tick: self.tick,
                    },
                );
            }
        }
    }

    fn scan_threads(&mut self, foreground: &str) {
        let mut requested = self.manual_packages.clone();
        if !foreground.is_empty() {
            requested.insert(foreground.to_string());
        }
        let processes = scan_requested_processes(&requested);
        self.scan_package(
            foreground,
            true,
            processes.get(foreground).map(Vec::as_slice).unwrap_or(&[]),
        );
        let packages = self.manual_packages.iter().cloned().collect::<Vec<_>>();
        for package in packages {
            if package != foreground {
                self.scan_package(
                    &package,
                    false,
                    processes.get(&package).map(Vec::as_slice).unwrap_or(&[]),
                );
            }
        }
        let oldest = self.tick.saturating_sub(30);
        self.thread_states
            .retain(|_, state| state.last_seen_tick >= oldest);
    }

    fn process_bpf_events(&mut self, foreground: &str) {
        let events = self
            .bpf
            .as_ref()
            .map(BpfMonitor::read_events)
            .unwrap_or_default();
        self.stats.bpf_events += events.len() as u64;
        for pid in events {
            let Some(package) = process_base_from_pid(pid) else {
                continue;
            };
            let automatic = package == foreground;
            if automatic || self.manual_packages.contains(&package) {
                self.scan_package(&package, automatic, &[pid]);
            }
        }
    }

    fn protect_apps(&self) {
        if self.rules.protect_enabled {
            let app_policy = self.paths.module.join("app_policy.sh");
            run_shell(
                &self.paths,
                &app_policy,
                &[OsStr::new("protect-once")],
            );
        }
    }

    fn update_pressure(&mut self) {
        if !self.pressure.enabled {
            if let Some(baseline) = self.pressure_baseline {
                if self.pressure_last_target.is_some() {
                    write_swappiness(baseline);
                }
            }
            self.pressure_last_target = None;
            let _ = fs::remove_file(&self.paths.pressure_baseline);
            return;
        }
        let Some(baseline) = self.pressure_baseline else {
            return;
        };
        if !self.paths.pressure_baseline.exists() {
            let _ = write_text(&self.paths.pressure_baseline, baseline.to_string());
        }
        let avg10 = pressure_avg10().unwrap_or(0.0);
        let target = pressure_target(&self.pressure, baseline, avg10);
        if self.pressure_last_target != Some(target) {
            write_swappiness(target);
            self.pressure_last_target = Some(target);
        }
    }

    fn write_state(&self, foreground: &str, foreground_source: &str) {
        let state = format!(
            "pid={}\nforeground={}\nforeground_source={}\nprofile={}\nauto_affinity={}\nebpf_requested={}\nebpf_active={}\nebpf_error_stage={}\nebpf_error_errno={}\nmemory_pressure={}\npressure_avg10={}\nruntime_mode={}\nmax_temperature_c={:.1}\nbattery_saver={}\nscreen_on={}\nknown_threads={}\nloops={}\nforeground_changes={}\nthreads_seen={}\nthreads_new={}\naffinity_applied={}\naffinity_failed={}\nmanual_applied={}\nreloads={}\ntop_app_hits={}\ndumpsys_fallbacks={}\nbpf_events={}\nbpf_attach_failures={}\n",
            process::id(),
            foreground,
            foreground_source,
            if self.last_profile.is_empty() {
                "base"
            } else {
                &self.last_profile
            },
            u8::from(self.affinity.enabled),
            u8::from(bpf_should_attach(&self.affinity, &self.manual_rules)),
            u8::from(self.bpf.is_some()),
            self.bpf_error.map(|error| error.stage).unwrap_or(""),
            self.bpf_error.map(|error| error.errno).unwrap_or(0),
            u8::from(self.pressure.enabled),
            pressure_avg10()
                .map(|value| value.to_string())
                .unwrap_or_default(),
            self.runtime_mode.name(),
            self.max_temperature_c,
            u8::from(self.battery_saver),
            u8::from(self.screen_on),
            self.thread_states.len(),
            self.stats.loops,
            self.stats.foreground_changes,
            self.stats.threads_seen,
            self.stats.threads_new,
            self.stats.affinity_applied,
            self.stats.affinity_failed,
            self.stats.manual_applied,
            self.stats.reloads,
            self.stats.top_app_hits,
            self.stats.dumpsys_fallbacks,
            self.stats.bpf_events,
            self.stats.bpf_attach_failures,
        );
        let _ = write_text(&self.paths.state, state);
        let affinity_state = format!(
            "status=active\npackage={}\napplied={}\nfailed={}\nmanual={}\nefficiency={}\nbalanced={}\nperformance={}\nmode={}\n",
            foreground,
            self.stats.affinity_applied,
            self.stats.affinity_failed,
            self.stats.manual_applied,
            cpu_list_string(&self.topology.efficiency),
            cpu_list_string(&self.topology.balanced),
            cpu_list_string(&self.topology.performance),
            self.runtime_mode.name(),
        );
        let _ = write_text(&self.paths.affinity_state, affinity_state);
    }

    fn step(&mut self) -> u64 {
        self.tick += 1;
        self.stats.loops += 1;
        let interval_ms = self.affinity.scan_interval_ms;
        self.pressure_elapsed_ms += interval_ms;
        self.protect_elapsed_ms += interval_ms;
        self.environment_elapsed_ms += interval_ms;
        self.fallback_reload_elapsed_ms += interval_ms;
        let watched_change = self.watcher.as_ref().map(ConfigWatcher::changed).unwrap_or(false);
        if self.paths.reload.exists()
            || RELOAD_REQUESTED.swap(false, Ordering::AcqRel)
            || watched_change
            || self.fallback_reload_elapsed_ms >= 60_000
        {
            let _ = fs::remove_file(&self.paths.reload);
            self.reload();
            self.fallback_reload_elapsed_ms = 0;
        }
        if self.environment_elapsed_ms >= 10_000 {
            self.update_environment();
            self.environment_elapsed_ms = 0;
        }
        let (foreground, foreground_source) = foreground_package();
        if foreground_source == "top-app" {
            self.stats.top_app_hits += 1;
        } else {
            self.stats.dumpsys_fallbacks += 1;
        }
        let profile_changed = self.apply_profile(&foreground);
        let foreground_changed = foreground != self.last_foreground;
        if foreground_changed {
            self.stats.foreground_changes += 1;
            self.last_foreground.clone_from(&foreground);
        }
        self.process_bpf_events(&foreground);
        self.scan_threads(&foreground);
        if self.protect_elapsed_ms >= 30_000 {
            self.protect_apps();
            self.protect_elapsed_ms = 0;
        }
        if self.pressure_elapsed_ms >= self.pressure.interval.max(1) * 1000 {
            self.pressure_elapsed_ms = 0;
            self.update_pressure();
        }
        self.write_state(&foreground, foreground_source);
        let _ = profile_changed;
        interval_ms
    }

    fn cleanup(&self) {
        if self.pressure.enabled {
            if let Some(baseline) = self.pressure_baseline {
                write_swappiness(baseline);
            }
        }
        for path in [
            &self.paths.pid,
            &self.paths.state,
            &self.paths.reload,
            &self.paths.stop,
            &self.paths.pressure_baseline,
        ] {
            let _ = fs::remove_file(path);
        }
    }
}

fn run_daemon(paths: Paths) -> i32 {
    if daemon_pid(&paths).is_some() {
        return 0;
    }
    let _ = fs::remove_file(&paths.stop);
    if write_text(&paths.pid, process::id().to_string()).is_err() {
        return 1;
    }
    unsafe {
        signal(1, handle_signal);
        signal(2, handle_signal);
        signal(15, handle_signal);
    }
    STOP_REQUESTED.store(false, Ordering::Release);
    RELOAD_REQUESTED.store(false, Ordering::Release);
    let mut daemon = Daemon::new(paths.clone());
    loop {
        if paths.stop.exists() || STOP_REQUESTED.load(Ordering::Acquire) {
            break;
        }
        let sleep_ms = daemon.step();
        let slices = sleep_ms.div_ceil(100);
        for _ in 0..slices {
            if paths.stop.exists()
                || paths.reload.exists()
                || STOP_REQUESTED.load(Ordering::Acquire)
                || RELOAD_REQUESTED.load(Ordering::Acquire)
            {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    daemon.cleanup();
    0
}

fn print_status(paths: &Paths) -> i32 {
    if let Some(pid) = daemon_pid(paths) {
        println!("running=1");
        println!("pid={pid}");
        print!("{}", read_text(&paths.state));
        0
    } else {
        println!("running=0");
        1
    }
}

fn main() {
    let paths = Paths::detect();
    let command = env::args().nth(1).unwrap_or_else(|| "status".to_string());
    let result = match command.as_str() {
        "daemon" => run_daemon(paths),
        "start" => spawn_daemon(&paths).map(|_| 0).unwrap_or(1),
        "reload" => {
            if daemon_pid(&paths).is_some() {
                write_text(&paths.reload, b"1").map(|_| 0).unwrap_or(1)
            } else {
                spawn_daemon(&paths).map(|_| 0).unwrap_or(1)
            }
        }
        "stop" => stop_daemon(&paths).map(|_| 0).unwrap_or(1),
        "status" => print_status(&paths),
        "once" => {
            let mut daemon = Daemon::new(paths);
            daemon.step();
            0
        }
        _ => {
            eprintln!("usage: coronad [start|daemon|reload|stop|status|once]");
            2
        }
    };
    process::exit(result);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_foreground_package() {
        let input = "topResumedActivity=ActivityRecord{123 u0 com.example.game/.MainActivity t1}";
        assert_eq!(package_from_dumpsys(input).as_deref(), Some("com.example.game"));
    }

    #[test]
    fn parses_cpu_ranges() {
        assert_eq!(parse_cpu_list("0-2, 4 6"), vec![0, 1, 2, 4, 6]);
    }

    #[test]
    fn matches_manual_rule_globs() {
        assert!(glob_matches("Render*", "RenderThread"));
        assert!(glob_matches("GLThread?", "GLThread1"));
        assert!(!glob_matches("Render*", "UnityMain"));
    }

    #[test]
    fn parses_affinity_formats() {
        assert_eq!(parse_affinity("0-2,4"), Some(vec![0, 1, 2, 4]));
        assert_eq!(parse_affinity("0x13"), Some(vec![0, 1, 4]));
        assert_eq!(parse_affinity("7"), Some(vec![7]));
    }

    #[test]
    fn prioritizes_exact_rules() {
        assert!(rule_priority("RenderThread") > rule_priority("Render*"));
        assert!(rule_priority("Render*") > rule_priority("*"));
    }

    #[test]
    fn parses_task_cpu_and_start_time() {
        let stat = "123 (Render Thread) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21";
        assert_eq!(parse_task_stat_text(stat), Some((23, 19)));
    }

    #[test]
    fn applies_runtime_degradation() {
        assert_eq!(adapt_class("performance", RuntimeMode::Warm), "balanced");
        assert_eq!(adapt_class("balanced", RuntimeMode::Saver), "efficiency");
        assert_eq!(adapt_class("performance", RuntimeMode::Normal), "performance");
    }

    #[test]
    fn learns_thread_load_with_hysteresis() {
        assert_eq!(next_load_score(0, 30, true), 1);
        assert_eq!(next_load_score(1, 30, true), 2);
        assert_eq!(next_load_score(2, 5, true), 1);
        assert_eq!(next_load_score(0, 0, true), -1);
    }

    #[test]
    fn selects_pressure_target() {
        let config = PressureConfig {
            enabled: true,
            moderate: 1.0,
            critical: 5.0,
            moderate_target: 160,
            critical_target: 200,
            interval: 6,
        };
        assert_eq!(pressure_target(&config, 100, 0.5), 100);
        assert_eq!(pressure_target(&config, 100, 2.0), 160);
        assert_eq!(pressure_target(&config, 100, 8.0), 200);
    }

    #[test]
    fn matches_kernel_bpf_uapi_layouts() {
        assert_eq!(std::mem::size_of::<BpfInsn>(), 8);
        assert_eq!(std::mem::size_of::<BpfRawTracepointAttr>(), 16);
        assert_eq!(std::mem::size_of::<BpfMapElementAttr>(), 32);
        let instruction = BpfInsn::new(0xbf, 2, 10, 0, 0);
        assert_eq!(instruction.regs, 0xa2);
    }

    #[test]
    fn filters_inotify_events_to_runtime_configs() {
        fn event(mask: u32, name: &str) -> Vec<u8> {
            let mut bytes = vec![0; 16];
            bytes[4..8].copy_from_slice(&mask.to_ne_bytes());
            let mut name_bytes = name.as_bytes().to_vec();
            name_bytes.push(0);
            while name_bytes.len() % 4 != 0 {
                name_bytes.push(0);
            }
            bytes[12..16].copy_from_slice(&(name_bytes.len() as u32).to_ne_bytes());
            bytes.extend(name_bytes);
            bytes
        }

        let hidden = event(0x0008, ".coronad_state");
        assert!(!inotify_buffer_has_config_change(&hidden, hidden.len()));
        let config = event(0x0080, "auto_affinity.conf");
        assert!(inotify_buffer_has_config_change(&config, config.len()));
        let cache = event(0x0008, "app_meta_cache.b64");
        assert!(!inotify_buffer_has_config_change(&cache, cache.len()));
    }
}
