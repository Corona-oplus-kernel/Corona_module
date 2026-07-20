# coronad

`coronad` is Corona's optional native scheduler. It runs only when the native daemon switch is enabled in the WebUI. Otherwise Corona uses the shell implementation as a fallback.

It coordinates application profile switching, native manual thread policies, incremental automatic thread affinity, protected-app refresh, and PSI-based swappiness control. It attaches `sched_process_exec` through `BPF_RAW_TRACEPOINT_OPEN` when supported, prefers top-app cgroup detection, watches configuration changes with inotify, learns real thread load, and degrades automatically for thermal, battery-saver, and screen-off states. Every optional path has a polling fallback, and no persistent runtime logs are created.

Daemon selection and reloads are handled by `service.sh`:

```sh
/system/bin/sh /data/adb/modules/Corona/service.sh --sync-daemon
/data/adb/modules/Corona/bin/coronad status
```

Build in the project chroot:

```sh
CARGO_HOME=/root/tmp/cargo RUSTUP_HOME=/root/tmp/rustup native/build-coronad.sh
```
