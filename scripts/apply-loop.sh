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

apply_official_backing() {
    official=$(/system/bin/sh "$WRITEBACK_HELPER" detect "$zram_block" 2>/dev/null) || return 1
    [ -b "$official" ] || return 1
    /system/bin/sh "$WRITEBACK_HELPER" cleanup "$zram_block" >/dev/null 2>&1 || return 1
    size_gb=$(( (size_mb + 512) / 1024 ))
    official_sizes=$(getprop persist.sys.oplus.nandswap.cfg | tr ',' ' ')
    if [ -n "$official_sizes" ]; then
        size_supported=0
        size_level=0
        official_level=0
        for official_size in $official_sizes; do
            if [ "$official_size" = "$size_gb" ]; then
                size_supported=1
                size_level=$official_level
            fi
            official_level=$((official_level + 1))
        done
        [ "$size_supported" = 1 ] || return 1
    else
        [ "$size_gb" -ge 1 ] || size_gb=1
        [ "$size_gb" -le 16 ] || size_gb=16
    fi
    setprop persist.sys.oplus.nandswap true || return 1
    [ -z "$official_sizes" ] || setprop persist.sys.oplus.nandswap.lvl "$size_level" || return 1
    setprop persist.sys.oplus.nandswap.swapsize "$size_gb" || return 1
    setprop persist.sys.oplus.nandswap.swapsize.curr "$size_gb" || return 1
    [ -z "$official_sizes" ] || [ "$(getprop persist.sys.oplus.nandswap.lvl)" = "$size_level" ] || return 1
    [ "$(getprop persist.sys.oplus.nandswap.swapsize)" = "$size_gb" ] || return 1
    [ "$(getprop persist.sys.oplus.nandswap.swapsize.curr)" = "$size_gb" ] || return 1
    /system/bin/sh "$WRITEBACK_HELPER" restore "$zram_block" "$official" >/dev/null 2>&1 || return 1
    current=$(cat "/sys/block/$zram_block/hybridswap_loop_device" 2>/dev/null)
    [ -n "$current" ] || current=$(cat "/sys/block/$zram_block/backing_dev" 2>/dev/null)
    [ "$current" = "$official" ] && return 0
    current_real=$(readlink -f "$current" 2>/dev/null)
    official_real=$(readlink -f "$official" 2>/dev/null)
    [ -n "$current_real" ] && [ "$current_real" = "$official_real" ]
}

restore_official_backing() {
    /system/bin/sh "$WRITEBACK_HELPER" cleanup "$zram_block" >/dev/null 2>&1
}

case "$ACTION" in
    start|create|recreate)
        [ "$size_mb" -gt 0 ] || exit 0
        apply_official_backing
        ;;
    stop|disable|delete)
        /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" false "$size_mb"
        ;;
    apply)
        if [ "$enabled" = "1" ]; then
            [ "$size_mb" -gt 0 ] || exit 0
            apply_official_backing
        else
            restore_official_backing
        fi
        ;;
    *)
        exit 2
        ;;
esac
