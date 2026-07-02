#!/system/bin/sh

get_foreground_package() {
    pkg=$(dumpsys activity activities 2>/dev/null | sed -n 's/.*topResumedActivity: .* \([^ /][^ /]*\)\/.*/\1/p' | head -n1)
    [ -n "$pkg" ] && {
        echo "$pkg"
        return 0
    }
    pkg=$(dumpsys window windows 2>/dev/null | sed -n 's/.*mCurrentFocus=.* \([^ /][^ /]*\)\/.*/\1/p' | head -n1)
    [ -n "$pkg" ] && {
        echo "$pkg"
        return 0
    }
    pkg=$(dumpsys activity top 2>/dev/null | sed -n 's/.*ACTIVITY \([^ /][^ /]*\)\/.*/\1/p' | head -n1)
    [ -n "$pkg" ] && echo "$pkg"
}

protect_package() {
    pkg="$1"
    [ -d /dev/memcg/system/active_fg ] || return 0
    package_pids "$pkg" | while IFS= read -r pid; do
        [ -n "$pid" ] && echo "$pid" > /dev/memcg/system/active_fg/cgroup.procs 2>/dev/null
    done
}

apply_protection_once() {
    load_rules
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
    printf 'before_kb=%s
after_kb=%s
freed_kb=%s
foreground=%s
killed=%s
' "$before" "$after" "$freed" "$foreground_pkg" "$killed"
}


package_pids_for_name() {
    target="$1"
    for d in /proc/[0-9]*; do
        [ -r "$d/cmdline" ] || continue
        cmdline=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
        case "$cmdline" in
            "$target"*|*" $target"*|*"$target:"*|*"$target/"*) basename "$d" ;;
        esac
    done | sort -u
}

list_package_threads() {
    pkg="$1"
    for pid in $(package_pids_for_name "$pkg"); do
        [ -d "/proc/$pid/task" ] || continue
        for task_dir in /proc/$pid/task/[0-9]*; do
            [ -r "$task_dir/comm" ] || continue
            thread_name=$(cat "$task_dir/comm" 2>/dev/null)
            [ -n "$thread_name" ] && printf '%s
' "$thread_name"
        done
    done | awk 'NF && !seen[$0]++ { print $0 }' | sort
}

profile_exists() {
    pkg="$1"
    csv_contains "$pkg" "$profiles_csv" && return 0
    [ -d "$PROFILES_DIR/$pkg" ] && find "$PROFILES_DIR/$pkg" -maxdepth 1 -type f | grep -q .
}

ensure_singleton() {
    if [ -f "$PIDFILE" ]; then
        old_pid=$(cat "$PIDFILE" 2>/dev/null)
        if [ -n "$old_pid" ] && [ -d "/proc/$old_pid" ]; then
            cmdline=$(tr '\\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null)
            case "$cmdline" in
                *app_policy.sh*daemon*) exit 0 ;;
            esac
        fi
    fi
    echo $$ > "$PIDFILE"
    trap 'rm -f "$PIDFILE" "$STATEFILE"' EXIT INT TERM
}

monitor_daemon() {
    ensure_singleton
    last_profile=""
    while true; do
        load_rules
        apply_protection_once
        "$MODDIR/service.sh" --apply-thread-priority >/dev/null 2>&1
        current_pkg=$(get_foreground_package)
        target_profile=base
        profile_dir=
        if [ "$monitor_enabled" = "1" ] && [ -n "$current_pkg" ] && profile_exists "$current_pkg"; then
            target_profile="$current_pkg"
            profile_dir="$PROFILES_DIR/$current_pkg"
        fi
        if [ "$target_profile" != "$last_profile" ]; then
            if [ "$target_profile" = "base" ]; then
                "$MODDIR/service.sh" --apply-runtime-config >/dev/null 2>&1
                [ "$notify_enabled" = "1" ] && send_notification "Corona 应用预设" "已恢复默认配置"
            else
                CORONA_CONFIG_DIR="$profile_dir" CORONA_SKIP_DESCRIPTION=1 "$MODDIR/service.sh" --apply-runtime-config >/dev/null 2>&1
                [ "$notify_enabled" = "1" ] && send_notification "Corona 应用预设" "已切换到 $(get_package_label "$current_pkg")"
            fi
            last_profile="$target_profile"
            printf 'foreground=%s
profile=%s
' "$current_pkg" "$target_profile" > "$STATEFILE"
        fi
        sleep 3
    done
}
