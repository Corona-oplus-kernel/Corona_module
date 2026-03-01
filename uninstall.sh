#!/system/bin/sh
MODPATH=${MODPATH:-${0%/*}}
CONFIG_DIR="$MODPATH/config"
RUNTIME_CONF="$CONFIG_DIR/runtime.conf"

get_conf_value() { [ -f "$1" ] && grep -m1 "^$2=" "$1" | cut -d'=' -f2-; }

swapfile=$(get_conf_value "$CONFIG_DIR/swap.conf" "path")
[ -z "$swapfile" ] && swapfile=$(get_conf_value "$RUNTIME_CONF" "swapfile_path")
[ -z "$swapfile" ] && swapfile="$MODPATH/swapfile.img"

rm -rf "$CONFIG_DIR"
swapoff "$swapfile" 2>/dev/null
rm -f "$swapfile"
