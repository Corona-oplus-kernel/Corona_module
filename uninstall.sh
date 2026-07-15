#!/system/bin/sh
MODPATH=${MODPATH:-${0%/*}}
CONFIG_DIR="$MODPATH/config"
RUNTIME_CONF="$CONFIG_DIR/runtime.conf"
get_conf_value() { [ -f "$1" ] && grep -m1 "^$2=" "$1" | cut -d'=' -f2-; }
swapfile=$(get_conf_value "$CONFIG_DIR/swap.conf" "path")
[ -z "$swapfile" ] && swapfile=$(get_conf_value "$RUNTIME_CONF" "swapfile_path")
[ -z "$swapfile" ] && swapfile="$MODPATH/swapfile.img"
[ -x "$MODPATH/app_policy.sh" ] && /system/bin/sh "$MODPATH/app_policy.sh" daemon-stop >/dev/null 2>&1
if [ -f "$MODPATH/.app_policy_daemon.pid" ]; then
    daemon_pid=$(cat "$MODPATH/.app_policy_daemon.pid" 2>/dev/null)
    [ -n "$daemon_pid" ] && kill -TERM "$daemon_pid" 2>/dev/null
fi
[ -x "$MODPATH/scripts/apply-loop.sh" ] && /system/bin/sh "$MODPATH/scripts/apply-loop.sh" stop >/dev/null 2>&1
[ -f "$MODPATH/scripts/memory-pressure.sh" ] && /system/bin/sh "$MODPATH/scripts/memory-pressure.sh" stop >/dev/null 2>&1
swapoff /data/nandswap/corona_swapfile 2>/dev/null
swapoff "$swapfile" 2>/dev/null
rm -rf "$MODPATH/.app_policy_effective" "$MODPATH"/.app_policy_effective.next.*
rm -f "$MODPATH/.app_policy_daemon.pid" "$MODPATH/.app_policy_state" "$MODPATH/.memory_pressure.runtime.conf" "$MODPATH/.memory_pressure.pid" "$MODPATH/.memory_pressure.baseline"
find "$CONFIG_DIR" -type f -name '*.tmp.*' -delete 2>/dev/null
rm -rf "$CONFIG_DIR"
rm -rf "$MODPATH/scripts.d/.logs"
rm -f /data/adb/post-fs-data.d/Corona.sh
rm -f "$swapfile"
rm -f /data/nandswap/corona_swapfile /data/nandswap/corona_loop_device
