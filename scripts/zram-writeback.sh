#!/system/bin/sh

ACTION="$1"
ZRAM_BLOCK="$2"
MODE="$3"
SIZE_MB="$4"

BACKING_DIR=/data/nandswap
BACKING_FILE="$BACKING_DIR/corona_swapfile"
LOOP_STATE="$BACKING_DIR/corona_loop_device"
NANDSWAP_TOOL=/product/bin/nandswap_tool

find_backing_loop() {
    /system/bin/losetup -a 2>/dev/null | awk -v file="($BACKING_FILE)" '$0 ~ file { sub(/:.*/, "", $1); print $1; exit }'
}

detach_backing_loop() {
    loop_device=$(cat "$LOOP_STATE" 2>/dev/null | tr -d ' \r\n')
    [ -n "$loop_device" ] || loop_device=$(find_backing_loop)
    if [ -n "$loop_device" ]; then
        /system/bin/losetup -d "$loop_device" 2>/dev/null || return 1
    fi
    rm -f "$LOOP_STATE"
    return 0
}

cleanup_backing() {
    detach_backing_loop || return 1
    rm -f "$BACKING_FILE"
}

create_backing() {
    case "$SIZE_MB" in
        ''|*[!0-9]*) SIZE_MB=4096 ;;
    esac
    [ "$SIZE_MB" -lt 256 ] && SIZE_MB=256
    [ "$SIZE_MB" -gt 32768 ] && SIZE_MB=32768

    [ -x "$NANDSWAP_TOOL" ] || return 1
    [ -e "/sys/block/$ZRAM_BLOCK" ] || return 1
    available_kb=$(df -k /data 2>/dev/null | awk 'NR == 2 { print $4 }')
    required_kb=$((SIZE_MB * 1024 + 524288))
    [ -n "$available_kb" ] && [ "$available_kb" -lt "$required_kb" ] && return 1
    mkdir -p "$BACKING_DIR" || return 1
    detach_backing_loop || return 1

    rm -f "$BACKING_FILE"
    touch "$BACKING_FILE" || return 1
    "$NANDSWAP_TOOL" -s1 "$BACKING_FILE" >/dev/null 2>&1 || return 1
    bytes=$((SIZE_MB * 1024 * 1024))
    /system/bin/fallocate -l "$bytes" "$BACKING_FILE" 2>/dev/null || return 1
    "$NANDSWAP_TOOL" -g "$BACKING_FILE" 2>/dev/null | grep -q pinned || return 1

    loop_device=$(/system/bin/losetup -f -s "$BACKING_FILE" 2>/dev/null) || return 1
    [ -n "$loop_device" ] || return 1
    if ! "$NANDSWAP_TOOL" -l "$loop_device" 2>/dev/null | grep -q success; then
        /system/bin/losetup -d "$loop_device" 2>/dev/null
        return 1
    fi

    if [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" ]; then
        printf '%s' "$loop_device" > "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" 2>/dev/null
        readback=$(cat "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" 2>/dev/null | tr -d ' \r\n')
        if [ "$readback" != "$loop_device" ]; then
            /system/bin/losetup -d "$loop_device" 2>/dev/null
            return 1
        fi
        [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_enable" ] && echo 1 > "/sys/block/$ZRAM_BLOCK/hybridswap_enable" 2>/dev/null
    elif [ -f "/sys/block/$ZRAM_BLOCK/backing_dev" ] && [ -f "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" ]; then
        printf '%s' "$loop_device" > "/sys/block/$ZRAM_BLOCK/backing_dev" 2>/dev/null
        readback=$(cat "/sys/block/$ZRAM_BLOCK/backing_dev" 2>/dev/null | tr -d ' \r\n')
        if [ "$readback" != "$loop_device" ]; then
            /system/bin/losetup -d "$loop_device" 2>/dev/null
            return 1
        fi
        echo 0 > "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" 2>/dev/null
    else
        /system/bin/losetup -d "$loop_device" 2>/dev/null
        return 1
    fi

    printf '%s\n' "$loop_device" > "$LOOP_STATE"
}

case "$ACTION" in
    apply)
        if [ "$MODE" = "true" ]; then
            if ! create_backing; then
                detach_backing_loop && rm -f "$BACKING_FILE"
                exit 1
            fi
        else
            cleanup_backing
        fi
        ;;
    cleanup)
        cleanup_backing
        ;;
    *)
        exit 2
        ;;
esac
