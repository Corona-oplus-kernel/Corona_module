#!/system/bin/sh

normalize_foreground_package() {
    pkg="$1"
    case "$pkg" in
        ''|me.weishu.kernelsu|com.android.shell) return 1 ;;
    esac
    printf '%s\n' "$pkg"
}

get_foreground_package() {
    pkg=$(dumpsys activity activities 2>/dev/null | awk '
        /topResumedActivity=|mResumedActivity:/ {
            for (i = 1; i <= NF; i++) {
                if ($i ~ /^[A-Za-z0-9_.-]+\//) {
                    split($i, component, "/")
                    print component[1]
                    exit
                }
            }
        }
    ')
    [ -n "$pkg" ] && {
        normalize_foreground_package "$pkg" && return 0
    }
    dumpsys window windows 2>/dev/null | awk '
        /mCurrentFocus=|mFocusedApp=/ {
            for (i = 1; i <= NF; i++) {
                if ($i ~ /^[A-Za-z0-9_.-]+\//) {
                    split($i, component, "/")
                    print component[1]
                    exit
                }
            }
        }
    ' | while IFS= read -r candidate; do normalize_foreground_package "$candidate"; done
}

runtime_package_pids() {
    pkg="$1"
    [ -n "$pkg" ] || return 0
    pattern=$(printf '%s' "$pkg" | sed 's/[][\\.^$*+?(){}|]/\\&/g')
    pgrep -f "^${pattern}(:[^ ]*)?([[:space:]]|$)" 2>/dev/null
}

protect_package() {
    pkg="$1"
    [ -d /dev/memcg/system/active_fg ] || return 0
    runtime_package_pids "$pkg" | while IFS= read -r pid; do
        [ -n "$pid" ] && echo "$pid" > /dev/memcg/system/active_fg/cgroup.procs 2>/dev/null
    done
}

apply_protection_once() {
    [ "$1" = "cached" ] || load_rules
    [ -d /dev/memcg/system ] || return 0
    mkdir -p /dev/memcg/system/active_fg
    echo 0 > /dev/memcg/system/active_fg/memory.swappiness 2>/dev/null
    echo 1 > /dev/memcg/system/active_fg/memory.use_hierarchy 2>/dev/null
    for app in com.android.systemui com.android.launcher surfaceflinger system_server; do
        protect_package "$app"
    done
    csv_to_lines "$protect_csv" | while IFS= read -r pkg; do
        [ -n "$pkg" ] && protect_package "$pkg"
    done
}

mem_available_kb() {
    awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null
}

kill_background_apps() {
    foreground_pkg="$1"
    load_rules
    killed=""
    candidates=$(pm list packages -3 2>/dev/null | cut -d: -f2)
    for pkg in $candidates; do
        [ -n "$pkg" ] || continue
        [ "$pkg" = "$foreground_pkg" ] && continue
        csv_contains "$pkg" "$whitelist_csv" && continue
        csv_contains "$pkg" "$protect_csv" && continue
        is_package_running "$pkg" || continue
        am force-stop "$pkg" >/dev/null 2>&1
        killed="$killed $pkg"
    done
    echo "$killed" | xargs echo 2>/dev/null
}

run_memclean() {
    mode="$1"
    foreground_pkg=$(get_foreground_package)
    before=$(mem_available_kb)
    [ -n "$before" ] || before=0
    sync
    case "$mode" in
        drop-caches)
            echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
            ;;
        drop-all)
            echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
            echo 1 > /proc/sys/vm/compact_memory 2>/dev/null
            ;;
        compact)
            echo 1 > /proc/sys/vm/compact_memory 2>/dev/null
            ;;
        kill-bg)
            killed=$(kill_background_apps "$foreground_pkg")
            ;;
        emergency-reclaim|full-clean)
            echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
            echo 1 > /proc/sys/vm/compact_memory 2>/dev/null
            killed=$(kill_background_apps "$foreground_pkg")
            ;;
    esac
    after=$(mem_available_kb)
    [ -n "$after" ] || after=0
    freed=$((after - before))
    [ "$freed" -lt 0 ] && freed=0
    printf 'before_kb=%s\nafter_kb=%s\nfreed_kb=%s\nforeground=%s\nkilled=%s\n' "$before" "$after" "$freed" "$foreground_pkg" "$killed"
}

package_pids_for_name() {
    runtime_package_pids "$1"
}

list_package_threads() {
    pkg="$1"
    for pid in $(package_pids_for_name "$pkg"); do
        [ -d "/proc/$pid/task" ] || continue
        for task_dir in /proc/$pid/task/[0-9]*; do
            [ -r "$task_dir/comm" ] || continue
            thread_name=$(cat "$task_dir/comm" 2>/dev/null)
            [ -n "$thread_name" ] && printf '%s\n' "$thread_name"
        done
    done | awk 'NF && !seen[$0]++ { print $0 }' | sort
}

thread_name_matches() {
    thread_name="$1"
    thread_pattern="$2"
    case "$thread_pattern" in
        *'*'*|*'?'*|*'['*) case "$thread_name" in $thread_pattern) return 0 ;; esac ;;
        *) [ "$thread_name" = "$thread_pattern" ] && return 0 ;;
    esac
    return 1
}

normalize_affinity_mask() {
    affinity_value="$1"
    [ -n "$affinity_value" ] || return 1
    case "$affinity_value" in
        *-*|*,*)
            result=0
            old_ifs="$IFS"
            IFS=','
            set -- $affinity_value
            IFS="$old_ifs"
            for part in "$@"; do
                case "$part" in
                    *-*)
                        start=${part%-*}
                        end=${part#*-}
                        ;;
                    *)
                        start=$part
                        end=$part
                        ;;
                esac
                [ -n "$start" ] && [ -n "$end" ] || return 1
                i=$start
                while [ "$i" -le "$end" ] 2>/dev/null; do
                    result=$((result | (1 << i)))
                    i=$((i + 1))
                done
            done
            printf '%x\n' "$result"
            return 0
            ;;
        0x*|0X*)
            printf '%s\n' "${affinity_value#0x}"
            return 0
            ;;
        *[a-fA-F]*)
            printf '%s\n' "$affinity_value"
            return 0
            ;;
        *)
            printf '%x\n' $((1 << affinity_value))
            return 0
            ;;
    esac
}

get_task_nice() {
    tid="$1"
    awk '{print $19}' "/proc/$tid/stat" 2>/dev/null
}

set_task_nice_absolute() {
    tid="$1"
    target_nice="$2"
    [ -n "$target_nice" ] || return 1
    current_nice=$(get_task_nice "$tid")
    [ -n "$current_nice" ] || return 1
    delta=$((target_nice - current_nice))
    [ "$delta" -eq 0 ] 2>/dev/null && return 0
    renice -n "$delta" -p "$tid" 2>/dev/null
}

apply_sched_policy_to_tid() {
    tid="$1"
    sched_policy="$2"
    rt_prio="$3"
    case "$sched_policy" in
        ''|other|normal)
            chrt -o -p "$tid" 0 2>/dev/null ;;
        batch)
            chrt -b -p "$tid" 0 2>/dev/null ;;
        idle)
            chrt -i -p "$tid" 0 2>/dev/null ;;
        fifo)
            [ -n "$rt_prio" ] || rt_prio=1
            chrt -f -p "$tid" "$rt_prio" 2>/dev/null ;;
        rr)
            [ -n "$rt_prio" ] || rt_prio=1
            chrt -r -p "$tid" "$rt_prio" 2>/dev/null ;;
    esac
}

apply_cpuset_to_tid() {
    tid="$1"
    cpuset_group="$2"
    [ -n "$cpuset_group" ] || return 0
    tasks_file="/dev/cpuset/$cpuset_group/tasks"
    [ -f "$tasks_file" ] || return 0
    echo "$tid" > "$tasks_file" 2>/dev/null
}

apply_uclamp_to_tid() {
    tid="$1"
    uclamp_min="$2"
    uclamp_max="$3"
    cpuctl_group="$4"
    if [ -w /proc/oplus_qos_sched/qos_task_uclamp ] && { [ -n "$uclamp_min" ] || [ -n "$uclamp_max" ]; }; then
        min_val=${uclamp_min:-0}
        max_val=${uclamp_max:-1024}
        printf '%s %s %s\n' "$tid" "$min_val" "$max_val" > /proc/oplus_qos_sched/qos_task_uclamp 2>/dev/null && return 0
    fi
    [ -n "$cpuctl_group" ] || return 0
    tasks_file="/dev/cpuctl/$cpuctl_group/tasks"
    min_file="/dev/cpuctl/$cpuctl_group/cpu.uclamp.min"
    max_file="/dev/cpuctl/$cpuctl_group/cpu.uclamp.max"
    [ -f "$tasks_file" ] || return 0
    [ -n "$uclamp_min" ] && [ -f "$min_file" ] && echo "$uclamp_min" > "$min_file" 2>/dev/null
    [ -n "$uclamp_max" ] && [ -f "$max_file" ] && echo "$uclamp_max" > "$max_file" 2>/dev/null
    echo "$tid" > "$tasks_file" 2>/dev/null
}

set_walt_knob() {
    path="$1"
    value="$2"
    [ -n "$value" ] || return 0
    [ -f "$path" ] || return 0
    echo "$value" > "$path" 2>/dev/null
}

apply_thread_walt_hints() {
    enable_per_task_boost="$1"
    enable_pipeline_special="$2"
    disable_reduce_affinity="$3"
    [ "$enable_per_task_boost" = "1" ] && set_walt_knob /proc/sys/walt/sched_per_task_boost 1
    [ "$enable_pipeline_special" = "1" ] && set_walt_knob /proc/sys/walt/sched_pipeline_special 1
    [ "$disable_reduce_affinity" = "1" ] && set_walt_knob /proc/sys/walt/task_reduce_affinity 0
}

apply_thread_priority_once() {
    [ -f "$THREAD_PRIORITY_FILE" ] || return 0
    walt_per_task_boost=0
    walt_pipeline_special=0
    walt_reduce_affinity=0
    while IFS='=' read -r target values; do
        case "$target" in ''|'#'*) continue ;; esac
        [ -n "$values" ] || continue
        package_name=$(printf '%s' "$target" | cut -d'|' -f1)
        thread_pattern=$(printf '%s' "$target" | cut -d'|' -f2-)
        [ -n "$package_name" ] && [ -n "$thread_pattern" ] || continue
        IFS='|' read -r nice_val io_class io_level affinity_mask sched_policy rt_prio cpuset_group walt_boost walt_pipeline uclamp_min uclamp_max <<EOF2
$values
EOF2
        [ "$walt_boost" = "1" ] && walt_per_task_boost=1 && walt_reduce_affinity=1
        [ "$walt_pipeline" = "1" ] && walt_pipeline_special=1
        for pid in $(package_pids_for_name "$package_name"); do
            [ -d "/proc/$pid/task" ] || continue
            for task_dir in /proc/$pid/task/[0-9]*; do
                [ -r "$task_dir/comm" ] || continue
                tid=${task_dir##*/}
                thread_name=$(cat "$task_dir/comm" 2>/dev/null)
                thread_name_matches "$thread_name" "$thread_pattern" || continue
                [ -n "$nice_val" ] && set_task_nice_absolute "$tid" "$nice_val"
                if [ -n "$io_class" ] && [ -n "$io_level" ]; then
                    ionice -c "$io_class" -n "$io_level" -p "$tid" 2>/dev/null
                fi
                                if [ -n "$affinity_mask" ]; then
                    affinity_hex=$(normalize_affinity_mask "$affinity_mask")
                    [ -n "$affinity_hex" ] && taskset -p "$affinity_hex" "$tid" >/dev/null 2>&1
                fi
                apply_cpuset_to_tid "$tid" "$cpuset_group"
                apply_uclamp_to_tid "$tid" "$uclamp_min" "$uclamp_max" "$cpuset_group"
                apply_sched_policy_to_tid "$tid" "$sched_policy" "$rt_prio"
            done
        done
    done < "$THREAD_PRIORITY_FILE"
    apply_thread_walt_hints "$walt_per_task_boost" "$walt_pipeline_special" "$walt_reduce_affinity"
}

profile_exists() {
    pkg="$1"
    csv_contains "$pkg" "$profiles_csv" && return 0
    check_dir="$PROFILES_DIR/$pkg"
    [ -d "$check_dir" ] || return 1
    for profile_file in "$check_dir"/*; do
        [ -f "$profile_file" ] && return 0
    done
    return 1
}

cleanup_daemon() {
    rm -f "$PIDFILE" "$STATEFILE"
}

request_rules_reload() {
    rules_reload_requested=1
    [ -n "$daemon_sleep_pid" ] && kill "$daemon_sleep_pid" 2>/dev/null
}

stop_daemon() {
    [ -n "$daemon_sleep_pid" ] && kill "$daemon_sleep_pid" 2>/dev/null
    exit 0
}

daemon_sleep() {
    sleep "$1" &
    daemon_sleep_pid=$!
    wait "$daemon_sleep_pid" 2>/dev/null
    daemon_sleep_pid=
}

ensure_singleton() {
    if [ -f "$PIDFILE" ]; then
        old_pid=$(cat "$PIDFILE" 2>/dev/null)
        if [ -n "$old_pid" ] && [ -d "/proc/$old_pid" ]; then
            cmdline=$(tr '\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null)
            case "$cmdline" in
                *app_policy.sh*daemon*) exit 0 ;;
            esac
        fi
    fi
    echo $$ > "$PIDFILE"
    trap cleanup_daemon EXIT
    trap stop_daemon INT TERM
    trap request_rules_reload HUP
}

monitor_daemon() {
    ensure_singleton
    last_profile=""
    last_foreground=""
    slow_tick=0
    rules_tick=0
    daemon_sleep_pid=
    rules_reload_requested=1
    while true; do
        rules_tick=$((rules_tick + 1))
        if [ "$rules_tick" -ge 10 ]; then
            rules_reload_requested=1
            rules_tick=0
        fi
        if [ "$rules_reload_requested" = "1" ]; then
            load_rules
            rules_reload_requested=0
        fi
        current_pkg=$(get_foreground_package)
        target_profile=base
        profile_dir=
        if [ "$monitor_enabled" = "1" ] && [ -n "$current_pkg" ] && profile_exists "$current_pkg"; then
            target_profile="$current_pkg"
            profile_dir="$PROFILES_DIR/$current_pkg"
        fi
        profile_changed=0
        foreground_changed=0
        if [ "$target_profile" != "$last_profile" ]; then
            target_config_dir="$MODDIR/config"
            [ "$target_profile" != "base" ] && target_config_dir="$profile_dir"
            "$MODDIR/service.sh" --apply-runtime-delta "$target_config_dir" >/dev/null 2>&1
            if [ "$target_profile" = "base" ]; then
                [ "$notify_enabled" = "1" ] && send_notification "Corona 应用预设" "已恢复默认配置"
            else
                [ "$notify_enabled" = "1" ] && send_notification "Corona 应用预设" "已切换到 $(get_package_label "$current_pkg")"
            fi
            last_profile="$target_profile"
            profile_changed=1
            printf 'foreground=%s
profile=%s
' "$current_pkg" "$target_profile" > "$STATEFILE"
        fi
        if [ "$current_pkg" != "$last_foreground" ]; then
            foreground_changed=1
        fi
        if [ "$foreground_changed" -eq 1 ] || [ "$profile_changed" -eq 1 ]; then
            [ -f "$THREAD_PRIORITY_FILE" ] && apply_thread_priority_once
            [ -n "$current_pkg" ] && "$MODDIR/scripts/auto-affinity.sh" apply "$current_pkg" >/dev/null 2>&1
            last_foreground="$current_pkg"
        fi
        slow_tick=$((slow_tick + 1))
        if [ "$slow_tick" -ge 5 ]; then
            slow_tick=0
            [ -n "$protect_csv" ] && apply_protection_once cached
            [ -n "$current_pkg" ] && "$MODDIR/scripts/auto-affinity.sh" apply "$current_pkg" >/dev/null 2>&1
        fi
        if [ "$foreground_changed" -eq 0 ] && [ "$profile_changed" -eq 0 ] && [ "$target_profile" = "base" ]; then
            daemon_sleep 6
        else
            daemon_sleep 4
        fi
    done
}
