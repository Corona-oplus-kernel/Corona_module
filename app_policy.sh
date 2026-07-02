#!/system/bin/sh

MODDIR=${0%/*}
CONFIG_DIR=${CORONA_CONFIG_DIR:-"$MODDIR/config"}
RULES_FILE="$CONFIG_DIR/app_rules.conf"
WHITELIST_FILE="$CONFIG_DIR/app_whitelist.list"
PROTECT_FILE="$CONFIG_DIR/app_protect.list"
PROFILES_LIST_FILE="$CONFIG_DIR/app_profiles.list"
PRIORITY_FILE="$CONFIG_DIR/process_priority.conf"
PROFILES_DIR="$CONFIG_DIR/app_profiles"
ICONS_DIR="$MODDIR/webroot/app_icons"
PIDFILE="$MODDIR/.app_policy_daemon.pid"
STATEFILE="$MODDIR/.app_policy_state"

find_busybox() {
    for candidate in /data/adb/magisk/busybox /data/adb/ksu/bin/busybox /data/adb/ap/bin/busybox; do
        [ -x "$candidate" ] && {
            echo "$candidate"
            return 0
        }
    done
    command -v busybox 2>/dev/null && return 0
    return 1
}

BUSYBOX=$(find_busybox)

find_chroot_distro() {
    for candidate in /data/adb/ksu/bin/chroot-distro /data/data/com.termux/files/usr/bin/chroot-distro; do
        [ -x "$candidate" ] && { echo "$candidate"; return 0; }
    done
    command -v chroot-distro 2>/dev/null
}

CHROOT_DISTRO_BIN=$(find_chroot_distro)
LAUNCHER_META_PY=/root/make/Corona_module/launcher_meta.py
CHROOT_ICONS_DIR=/root/make/Corona_module/webroot/app_icons

run_launcher_meta() {
    [ -n "$CHROOT_DISTRO_BIN" ] || return 1
    cmd="cd /root/make/Corona_module && python3 $LAUNCHER_META_PY"
    for arg in "$@"; do
        escaped=$(printf "%s" "$arg" | sed "s/'/'\''/g")
        cmd="$cmd '$escaped'"
    done
    "$CHROOT_DISTRO_BIN" command ubuntu "$cmd" 2>/dev/null
}


get_conf_value() {
    [ -f "$1" ] || return 1
    grep -m1 "^$2=" "$1" | cut -d'=' -f2-
}

csv_to_lines() {
    echo "$1" | tr ',' '\n' | sed '/^$/d'
}

csv_contains() {
    target="$1"
    csv="$2"
    for item in $(csv_to_lines "$csv"); do
        [ "$item" = "$target" ] && return 0
    done
    return 1
}

list_file_for_key() {
    case "$1" in
        whitelist) echo "$WHITELIST_FILE" ;;
        protect) echo "$PROTECT_FILE" ;;
        profiles) echo "$PROFILES_LIST_FILE" ;;
        *) return 1 ;;
    esac
}

legacy_csv_for_key() {
    get_conf_value "$RULES_FILE" "$1"
}

ensure_list_file() {
    key="$1"
    file=$(list_file_for_key "$key") || return 1
    [ -f "$file" ] && return 0
    legacy=$(legacy_csv_for_key "$key")
    mkdir -p "$CONFIG_DIR"
    : > "$file"
    [ -n "$legacy" ] && csv_to_lines "$legacy" | awk 'NF && !seen[$0]++' > "$file"
}

list_file_to_csv() {
    file="$1"
    [ -f "$file" ] || return 0
    awk 'NF && !seen[$0]++ { if (out) out = out "," $0; else out = $0 } END { print out }' "$file"
}

load_list_csv() {
    key="$1"
    file=$(list_file_for_key "$key") || return 1
    ensure_list_file "$key"
    list_file_to_csv "$file"
}

set_list_item() {
    key="$1"
    action="$2"
    pkg="$3"
    [ -n "$pkg" ] || return 1
    file=$(list_file_for_key "$key") || return 1
    ensure_list_file "$key"
    tmp=$(mktemp)
    awk -v pkg="$pkg" 'NF && $0 != pkg && !seen[$0]++ { print $0 }' "$file" > "$tmp" 2>/dev/null
    if [ "$action" = "add" ]; then
        printf '%s\n' "$pkg" >> "$tmp"
    fi
    awk 'NF && !seen[$0]++ { print $0 }' "$tmp" > "$file"
    rm -f "$tmp"
}

serialize_priority_rule() {
    [ -f "$PRIORITY_FILE" ] || return 0
    awk -F'=' -v key="$1" '$1 == key { print $2; exit }' "$PRIORITY_FILE"
}

set_priority_rule() {
    key="$1"
    nice="$2"
    io_class="$3"
    io_level="$4"
    mkdir -p "$CONFIG_DIR"
    tmp=$(mktemp)
    [ -f "$PRIORITY_FILE" ] && awk -F'=' -v key="$key" '$1 != key && NF { print $0 }' "$PRIORITY_FILE" > "$tmp" 2>/dev/null || :
    printf '%s=%s,%s,%s
' "$key" "$nice" "$io_class" "$io_level" >> "$tmp"
    awk 'NF && !seen[$0]++ { print $0 }' "$tmp" > "$PRIORITY_FILE"
    rm -f "$tmp"
}

delete_priority_rule() {
    key="$1"
    [ -f "$PRIORITY_FILE" ] || return 0
    tmp=$(mktemp)
    awk -F'=' -v key="$key" '$1 != key && NF { print $0 }' "$PRIORITY_FILE" > "$tmp" 2>/dev/null
    mv "$tmp" "$PRIORITY_FILE"
}

dump_rules() {
    load_rules
    printf 'monitor_enabled=%s
notify_enabled=%s
whitelist=%s
protect=%s
profiles=%s
'         "$monitor_enabled" "$notify_enabled" "$whitelist_csv" "$protect_csv" "$profiles_csv"
}

load_rules() {
    monitor_enabled=$(get_conf_value "$RULES_FILE" monitor_enabled)
    notify_enabled=$(get_conf_value "$RULES_FILE" notify_enabled)
    whitelist_csv=$(load_list_csv whitelist)
    protect_csv=$(load_list_csv protect)
    profiles_csv=$(load_list_csv profiles)
    [ -n "$monitor_enabled" ] || monitor_enabled=0
    [ -n "$notify_enabled" ] || notify_enabled=1
}

send_notification() {
    title="$1"
    text="$2"
    cmd notification post -S bigtext -t "$title" corona_app_policy "$text" >/dev/null 2>&1
}

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

get_package_label() {
    pkg="$1"
    label=$(dumpsys package "$pkg" 2>/dev/null | sed -n 's/^[[:space:]]*application-label://p' | head -n1)
    [ -n "$label" ] || label="$pkg"
    echo "$label" | tr '\t\r\n' '   '
}

resolve_launcher_component() {
    pkg="$1"
    cmd package resolve-activity --brief "$pkg" 2>/dev/null | awk '/^[A-Za-z0-9_.-]+\// { comp=$1 } /^[[:space:]]+[A-Za-z0-9_.-]+\// { gsub(/^[[:space:]]+/, "", $1); comp=$1 } END { if (comp) print comp }'
}

output_label() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    label=$(run_launcher_meta label "$pkg" "$component")
    [ -n "$label" ] && { printf '%s' "$label"; return 0; }
    get_package_label "$pkg"
}

list_apps() {
    pm list packages -3 2>/dev/null | cut -d: -f2 | sort -u | while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        component=$(resolve_launcher_component "$pkg")
        [ -n "$component" ] || continue
        printf '%s|%s\n' "$pkg" "$component"
    done
}

list_zip_entries() {
    archive="$1"
    if command -v unzip >/dev/null 2>&1; then
        unzip -Z1 "$archive" 2>/dev/null && return 0
    fi
    if command -v toybox >/dev/null 2>&1; then
        toybox unzip -l "$archive" 2>/dev/null | awk 'NF {print $NF}' | sed '1,/^Name$/d' && return 0
    fi
    [ -n "$BUSYBOX" ] && "$BUSYBOX" unzip -l "$archive" 2>/dev/null | awk 'NF && $NF !~ /^Archive:|files?$|Date|Length|----/ {print $NF}'
}

output_icon() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    launcher_icon=$(run_launcher_meta icon-data "$pkg" "$component")
    [ -n "$launcher_icon" ] && { printf '%s' "$launcher_icon"; return 0; }
    apk=$(pm path "$pkg" 2>/dev/null | sed -n 's/^package://p' | head -n1)
    [ -f "$apk" ] || exit 0
    icon_entry=$(list_zip_entries "$apk" | grep -E '^res/(mipmap|drawable)[^/]*/((ic_launcher|app_icon|logo|icon)[^/]*)\.(png|webp|jpg|jpeg)$' | sort | tail -n1)
    [ -n "$icon_entry" ] || icon_entry=$(unzip -l "$apk" 2>/dev/null | awk '/ res\// && $4 ~ /\.(png|webp|jpg|jpeg)$/ {print $1 " " $4}' | sort -n | tail -n1 | awk '{print $2}')
    [ -n "$icon_entry" ] || exit 0
    tmp=$(mktemp)
    if command -v unzip >/dev/null 2>&1; then
        unzip -p "$apk" "$icon_entry" > "$tmp" 2>/dev/null
    elif command -v toybox >/dev/null 2>&1; then
        toybox unzip -p "$apk" "$icon_entry" > "$tmp" 2>/dev/null
    elif [ -n "$BUSYBOX" ]; then
        "$BUSYBOX" unzip -p "$apk" "$icon_entry" > "$tmp" 2>/dev/null
    fi
    [ -s "$tmp" ] || {
        rm -f "$tmp"
        exit 0
    }
    mime=image/png
    case "$icon_entry" in
        *.webp) mime=image/webp ;;
        *.jpg|*.jpeg) mime=image/jpeg ;;
    esac
    if command -v base64 >/dev/null 2>&1; then
        printf 'data:%s;base64,%s' "$mime" "$(base64 "$tmp" | tr -d '\n')"
    elif [ -n "$BUSYBOX" ]; then
        printf 'data:%s;base64,%s' "$mime" "$("$BUSYBOX" base64 "$tmp" | tr -d '\n')"
    fi
    rm -f "$tmp"
}
output_icon_file() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    mkdir -p "$ICONS_DIR"
    launcher_icon=$(run_launcher_meta icon "$pkg" "$CHROOT_ICONS_DIR" "$component")
    if [ -n "$launcher_icon" ]; then
        filename=$(basename "$launcher_icon")
        if [ -f "$ICONS_DIR/$filename" ]; then
            printf '%s' "$ICONS_DIR/$filename"
            exit 0
        fi
    fi
    apk=$(pm path "$pkg" 2>/dev/null | sed -n 's/^package://p' | head -n1)
    [ -f "$apk" ] || exit 0
    icon_entry=$(list_zip_entries "$apk" | grep -E '^res/(mipmap|drawable)[^/]*/((ic_launcher|app_icon|logo|icon)[^/]*)\.(png|webp|jpg|jpeg)$' | sort | tail -n1)
    [ -n "$icon_entry" ] || icon_entry=$(unzip -l "$apk" 2>/dev/null | awk '/ res\// && $4 ~ /\.(png|webp|jpg|jpeg)$/ {print $1 " " $4}' | sort -n | tail -n1 | awk '{print $2}')
    [ -n "$icon_entry" ] || exit 0
    ext=${icon_entry##*.}
    out="$ICONS_DIR/$pkg.$ext"
    if [ -s "$out" ]; then
        printf '%s' "$out"
        exit 0
    fi
    if command -v unzip >/dev/null 2>&1; then
        unzip -p "$apk" "$icon_entry" > "$out" 2>/dev/null
    elif command -v toybox >/dev/null 2>&1; then
        toybox unzip -p "$apk" "$icon_entry" > "$out" 2>/dev/null
    elif [ -n "$BUSYBOX" ]; then
        "$BUSYBOX" unzip -p "$apk" "$icon_entry" > "$out" 2>/dev/null
    fi
    [ -s "$out" ] && printf '%s' "$out" || rm -f "$out"
}

output_app_meta() {
    list_apps | while IFS='|' read -r pkg component; do
        [ -n "$pkg" ] || continue
        component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
        label=$(output_label "$pkg" "$component")
        printf '%s|%s|%s\n' "$pkg" "$component" "$label"
    done
}

is_package_running() {
    pkg="$1"
    ps -A -o NAME,ARGS 2>/dev/null | grep -F -q "$pkg"
}

package_pids() {
    pkg="$1"
    {
        pgrep -f "$pkg" 2>/dev/null
        for proc_dir in /proc/[0-9]*; do
            [ -r "$proc_dir/cmdline" ] || continue
            cmdline=$(tr '\0' ' ' < "$proc_dir/cmdline" 2>/dev/null)
            case "$cmdline" in
                "$pkg"*|*" $pkg"*|*"$pkg:"*) basename "$proc_dir" ;;
            esac
        done
    } | sort -u
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
    printf 'before_kb=%s\nafter_kb=%s\nfreed_kb=%s\nforeground=%s\nkilled=%s\n' "$before" "$after" "$freed" "$foreground_pkg" "$killed"
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
            cmdline=$(tr '\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null)
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
            printf 'foreground=%s\nprofile=%s\n' "$current_pkg" "$target_profile" > "$STATEFILE"
        fi
        sleep 3
    done
}

case "$1" in
    list) list_apps ;;
    list-meta) output_app_meta ;;
    dump-rules) dump_rules ;;
    list-set) set_list_item "$2" "$3" "$4" ;;
    priority-get) serialize_priority_rule "$2" ;;
    priority-set) set_priority_rule "$2" "$3" "$4" "$5" ;;
    priority-del) delete_priority_rule "$2" ;;
    label) output_label "$2" "$3" ;;
    icon) output_icon "$2" "$3" ;;
    icon-file) output_icon_file "$2" "$3" ;;
    memclean) run_memclean "$2" ;;
    protect-once) apply_protection_once ;;
    daemon) monitor_daemon ;;
    foreground) get_foreground_package ;;
    *) exit 1 ;;
 esac
