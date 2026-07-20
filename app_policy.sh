#!/system/bin/sh

MODDIR=${0%/*}
CONFIG_DIR=${CORONA_CONFIG_DIR:-"$MODDIR/config"}
RULES_FILE="$CONFIG_DIR/app_rules.conf"
WHITELIST_FILE="$CONFIG_DIR/app_whitelist.list"
PROTECT_FILE="$CONFIG_DIR/app_protect.list"
PROFILES_LIST_FILE="$CONFIG_DIR/app_profiles.list"
PRIORITY_FILE="$CONFIG_DIR/process_priority.conf"
PROFILES_DIR="$CONFIG_DIR/app_profiles"
THREAD_PRIORITY_FILE="$CONFIG_DIR/thread_priority.conf"
ICONS_DIR="$MODDIR/webroot/app_icons"
PIDFILE="$CONFIG_DIR/.app_policy_daemon.pid"
STATEFILE="$CONFIG_DIR/.app_policy_state"
CORONAD="$MODDIR/bin/coronad"

. "$MODDIR/app_policy/common.sh"
. "$MODDIR/app_policy/meta.sh"
. "$MODDIR/app_policy/runtime.sh"

use_coronad() {
    [ -x "$CORONAD" ] && [ "$(get_conf_value "$CONFIG_DIR/coronad.conf" enabled)" = "1" ]
}

get_daemon_pid() {
    if use_coronad; then
        corona_pid=$(cat "$CONFIG_DIR/.coronad.pid" 2>/dev/null)
        if [ -n "$corona_pid" ] && [ -d "/proc/$corona_pid" ]; then
            corona_cmdline=$(tr '\0' ' ' < "/proc/$corona_pid/cmdline" 2>/dev/null)
            case "$corona_cmdline" in
                *coronad*) printf '%s' "$corona_pid"; return 0 ;;
            esac
        fi
    fi
    [ -f "$PIDFILE" ] || return 1
    daemon_pid=$(cat "$PIDFILE" 2>/dev/null)
    [ -n "$daemon_pid" ] && [ -d "/proc/$daemon_pid" ] || return 1
    daemon_cmdline=$(tr '\0' ' ' < "/proc/$daemon_pid/cmdline" 2>/dev/null)
    case "$daemon_cmdline" in
        *app_policy.sh*daemon*) printf '%s' "$daemon_pid" ;;
        *) return 1 ;;
    esac
}

case "$1" in
    list) list_apps ;;
    list-meta) output_app_meta ;;
    dump-rules) dump_rules ;;
    list-set) set_list_item "$2" "$3" "$4" ;;
    priority-get) serialize_priority_rule "$2" ;;
    priority-set) set_priority_rule "$2" "$3" "$4" "$5" ;;
    priority-del) delete_priority_rule "$2" ;;
    label-batch)
        payload=$(printf '%s' "$2" | awk -v RS=',' 'NF { print }' | while IFS= read -r pkg; do
            [ -n "$pkg" ] || continue
            component=$(resolve_launcher_component "$pkg")
            printf '%s|%s\n' "$pkg" "$component"
        done)
        batch=$(run_launcher_meta label-batch "$payload")
        if [ -n "$batch" ]; then
            printf '%s\n' "$batch" | while IFS='|' read -r pkg component label; do
                [ -n "$pkg" ] || continue
                printf '%s|%s\n' "$pkg" "$label"
            done
        else
            printf '%s' "$2" | awk -v RS=',' 'NF { print }' | while IFS= read -r pkg; do
                [ -n "$pkg" ] || continue
                label=$(output_label "$pkg")
                printf '%s|%s\n' "$pkg" "$label"
            done
        fi ;;
    label) output_label "$2" "$3" ;;
    icon) output_icon "$2" "$3" ;;
    icon-file) output_icon_file "$2" "$3" ;;
    memclean) run_memclean "$2" ;;
    protect-once) apply_protection_once ;;
    daemon)
        if use_coronad; then
            CORONA_MODDIR="$MODDIR" "$CORONAD" daemon
        else
            monitor_daemon
        fi
        ;;
    daemon-reload)
        if use_coronad; then
            CORONA_MODDIR="$MODDIR" "$CORONAD" reload
            exit $?
        fi
        pid=$(get_daemon_pid) || exit 0
        kill -HUP "$pid" 2>/dev/null
        ;;
    daemon-stop)
        if use_coronad; then
            CORONA_MODDIR="$MODDIR" "$CORONAD" stop
            rm -f "$PIDFILE" "$STATEFILE"
            exit $?
        fi
        pid=$(get_daemon_pid) || { rm -f "$PIDFILE" "$STATEFILE"; exit 0; }
        kill -TERM "$pid" 2>/dev/null
        ;;
    foreground) get_foreground_package ;;
    daemon-status) get_daemon_pid ;;
    thread-list) list_package_threads "$2" ;;
    auto-affinity)
        shift
        "$MODDIR/scripts/auto-affinity.sh" "$@"
        ;;
    *) exit 1 ;;
esac
