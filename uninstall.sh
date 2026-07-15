#!/system/bin/sh
MODPATH=${MODPATH:-${0%/*}}
CONFIG_DIR="$MODPATH/config"
RUNTIME_CONF="$CONFIG_DIR/runtime.conf"
get_conf_value() { [ -f "$1" ] && grep -m1 "^$2=" "$1" | cut -d'=' -f2-; }
swapfile=$(get_conf_value "$CONFIG_DIR/swap.conf" "path")
[ -z "$swapfile" ] && swapfile=$(get_conf_value "$RUNTIME_CONF" "swapfile_path")
[ -z "$swapfile" ] && swapfile="$MODPATH/swapfile.img"
[ -x "$MODPATH/scripts/apply-loop.sh" ] && /system/bin/sh "$MODPATH/scripts/apply-loop.sh" stop >/dev/null 2>&1
rm -rf "$CONFIG_DIR"
rm -rf "$MODPATH/scripts.d/.logs"
rm -f /data/adb/post-fs-data.d/Corona.sh
swapoff "$swapfile" 2>/dev/null
rm -f "$swapfile"
rm -f /data/nandswap/corona_swapfile /data/nandswap/corona_loop_device
