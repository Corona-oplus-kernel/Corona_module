#!/system/bin/sh

MODDIR=${0%/*}
MODDIR=${MODDIR%/scripts}
CONFIG_DIR="$MODDIR/config"
LOOP_CONF="$CONFIG_DIR/loop.conf"
ZRAM_CONF="$CONFIG_DIR/zram.conf"
WRITEBACK_HELPER="$MODDIR/scripts/zram-writeback.sh"
ACTION=${1:-apply}

get_conf_value() {
    [ -f "$1" ] && grep -m1 "^$2=" "$1" 2>/dev/null | cut -d'=' -f2-
}

enabled=$(get_conf_value "$LOOP_CONF" enabled)
size_mb=$(get_conf_value "$LOOP_CONF" size_mb)
case "$enabled" in 1) ;; *) enabled=0 ;; esac
case "$size_mb" in ''|*[!0-9]*) size_mb=0 ;; esac
zram_path=$(get_conf_value "$ZRAM_CONF" zram_path)
[ -n "$zram_path" ] || zram_path=/dev/block/zram0
zram_block=${zram_path##*/}

case "$zram_block" in
    zram[0-9]*) ;;
    *) zram_block=zram0 ;;
esac

[ -x "$WRITEBACK_HELPER" ] || exit 1

case "$ACTION" in
    start)
        [ "$size_mb" -gt 0 ] || exit 0
        /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" true "$size_mb"
        ;;
    stop)
        /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" false "$size_mb"
        ;;
    apply)
        if [ "$enabled" = "1" ]; then
            [ "$size_mb" -gt 0 ] || exit 0
            /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" true "$size_mb"
        else
            /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" false "$size_mb"
        fi
        ;;
    *)
        exit 2
        ;;
esac
