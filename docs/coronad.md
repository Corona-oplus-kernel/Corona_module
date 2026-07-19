# coronad

`coronad` is Corona's optional native scheduler. When `bin/coronad` is present, it replaces the two shell polling loops with one process while retaining the existing shell implementation as a fallback.

It coordinates application profile switching, native manual thread policies, incremental automatic thread affinity, protected-app refresh, and PSI-based swappiness control. It attaches `sched_process_exec` through `BPF_RAW_TRACEPOINT_OPEN` when supported, prefers top-app cgroup detection, watches configuration changes with inotify, learns real thread load, and degrades automatically for thermal, battery-saver, and screen-off states. Every optional path has a polling fallback, and no persistent runtime logs are created.

Commands:

```sh
/data/adb/modules/Corona/bin/coronad start
/data/adb/modules/Corona/bin/coronad reload
/data/adb/modules/Corona/bin/coronad status
/data/adb/modules/Corona/bin/coronad stop
```

Build in the project chroot:

```sh
CARGO_HOME=/root/tmp/cargo RUSTUP_HOME=/root/tmp/rustup native/build-coronad.sh
```
