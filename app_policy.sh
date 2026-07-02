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

. "$MODDIR/app_policy/common.sh"
. "$MODDIR/app_policy/meta.sh"
. "$MODDIR/app_policy/runtime.sh"

case "$1" in
    list) list_apps ;;
    list-meta) output_app_meta ;;
    dump-rules) dump_rules ;;
    list-set) set_list_item "$2" "$3" "$4" ;;
    priority-get) serialize_priority_rule "$2" ;;
    priority-set) set_priority_rule "$2" "$3" "$4" "$5" ;;
    priority-del) delete_priority_rule "$2" ;;
    label-batch)
        printf '%s' "$2" | tr ',' '
' | while IFS= read -r pkg; do
            [ -n "$pkg" ] || continue
            label=$(output_label "$pkg")
            printf '%s|%s
' "$pkg" "$label"
        done ;;
    label) output_label "$2" "$3" ;;
    icon) output_icon "$2" "$3" ;;
    icon-file) output_icon_file "$2" "$3" ;;
    memclean) run_memclean "$2" ;;
    protect-once) apply_protection_once ;;
    daemon) monitor_daemon ;;
    foreground) get_foreground_package ;;
    thread-list) list_package_threads "$2" ;;
    *) exit 1 ;;
esac
