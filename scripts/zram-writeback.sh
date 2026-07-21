#!/system/bin/sh

ACTION="$1"
ZRAM_BLOCK="$2"
MODE="$3"
SIZE_MB="$4"

BACKING_DIR=/data/nandswap
BACKING_FILE="$BACKING_DIR/corona_swapfile"
LOOP_STATE="$BACKING_DIR/corona_loop_device"
SYSTEM_BACKING_STATE="$BACKING_DIR/corona_system_backing"
HYBRID_STATE="$BACKING_DIR/corona_hybridswap_state"

get_current_backing() {
    [ -n "$ZRAM_BLOCK" ] || return 1
    if [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" ]; then
        cat "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" 2>/dev/null | tr -d ' \r\n'
    elif [ -f "/sys/block/$ZRAM_BLOCK/backing_dev" ]; then
        cat "/sys/block/$ZRAM_BLOCK/backing_dev" 2>/dev/null | tr -d ' \r\n'
    fi
}

get_managed_loop() {
    loop_device=$(cat "$LOOP_STATE" 2>/dev/null | tr -d ' \r\n')
    if [ -n "$loop_device" ]; then
        /system/bin/losetup "$loop_device" 2>/dev/null | grep -Fq "$BACKING_FILE" || loop_device=
    fi
    [ -n "$loop_device" ] || loop_device=$(find_backing_loop)
    [ -n "$loop_device" ] && printf '%s\n' "$loop_device"
}

is_managed_backing() {
    device="$1"
    [ -n "$device" ] || return 1
    managed=$(get_managed_loop)
    [ -n "$managed" ] && [ "$device" = "$managed" ] && return 0
    case "$device" in
        /dev/block/loop*|/dev/loop*)
            /system/bin/losetup "$device" 2>/dev/null | grep -Fq "$BACKING_FILE"
            return $?
            ;;
    esac
    return 1
}

remember_hybridswap_state() {
    mkdir -p "$BACKING_DIR" 2>/dev/null || return 1
    : > "$HYBRID_STATE"
    for key in hybridswap_zram_increase hybridswap_quota_day hybridswap_swapd_pause; do
        node="/sys/block/$ZRAM_BLOCK/$key"
        [ -r "$node" ] || continue
        value=$(cat "$node" 2>/dev/null | tr -d ' \r\n')
        case "$value" in ''|*[!0-9]*) continue ;; esac
        printf '%s=%s\n' "$key" "$value" >> "$HYBRID_STATE"
    done
}

remember_system_backing() {
    remember_hybridswap_state
    current=$(get_current_backing)
    [ -n "$current" ] && [ "$current" != none ] || return 0
    is_managed_backing "$current" && return 0
    [ -b "$current" ] || return 0
    printf '%s\n' "$current" > "$SYSTEM_BACKING_STATE"
}

restore_hybridswap_state() {
    [ -r "$HYBRID_STATE" ] || return 0
    while IFS='=' read -r key value; do
        case "$key" in
            hybridswap_zram_increase|hybridswap_quota_day|hybridswap_swapd_pause)
                node="/sys/block/$ZRAM_BLOCK/$key"
                [ -f "$node" ] && echo "$value" > "$node" 2>/dev/null
                ;;
        esac
    done < "$HYBRID_STATE"
}

find_system_backing() {
    preferred="$1"
    [ -n "$preferred" ] && [ -b "$preferred" ] && {
        printf '%s\n' "$preferred"
        return 0
    }
    saved=$(cat "$SYSTEM_BACKING_STATE" 2>/dev/null | tr -d ' \r\n')
    [ -n "$saved" ] && [ -b "$saved" ] && {
        printf '%s\n' "$saved"
        return 0
    }
    current=$(get_current_backing)
    if [ -n "$current" ] && [ "$current" != none ] && [ -b "$current" ] && ! is_managed_backing "$current"; then
        printf '%s\n' "$current"
        return 0
    fi
    for rc in /odm/etc/init/*.rc /product/etc/init/*.rc /vendor/etc/init/*.rc /system_ext/etc/init/*.rc; do
        [ -r "$rc" ] || continue
        mapper_name=$(grep -i -E 'cryptfs.*encryptDev.*(hybrid|nand|swap)|(hybrid|nand|swap).*cryptfs.*encryptDev' "$rc" 2>/dev/null | sed -n 's|.*cryptfs[[:space:]]\+encryptDev[[:space:]]\+[^[:space:]]\+[[:space:]]\+\([^[:space:]]\+\).*|\1|p' | head -1)
        [ -n "$mapper_name" ] || continue
        device="/dev/block/mapper/$mapper_name"
        [ -b "$device" ] && {
            printf '%s\n' "$device"
            return 0
        }
    done
    for script in /odm/etc/init.oplus.mm-sys.sh /product/bin/init.oplus.nandswap.sh; do
        [ -r "$script" ] || continue
        device=$(sed -n 's|^[[:space:]]*hybridswap_partition=["'"']\?\([^"'"']*\)["'"']\?.*|\1|p' "$script" 2>/dev/null | head -1)
        [ -n "$device" ] && [ -b "$device" ] && {
            printf '%s\n' "$device"
            return 0
        }
    done
    for device in /dev/block/mapper/* /dev/mapper/*; do
        [ -b "$device" ] || continue
        name=${device##*/}
        case "$name" in
            *hybrid*swap*|*nand*swap*|*swap*crypto*)
                printf '%s\n' "$device"
                return 0
                ;;
        esac
    done
    for device in /dev/block/by-name/hybridswap /dev/block/by-name/nandswap; do
        [ -b "$device" ] && {
            printf '%s\n' "$device"
            return 0
        }
    done
    return 1
}

bind_backing_device() {
    device="$1"
    [ -n "$device" ] || return 1
    if [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" ]; then
        printf '%s' "$device" > "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" 2>/dev/null || return 1
        readback=$(get_current_backing)
        [ "$readback" = "$device" ] || return 1
        [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_enable" ] && echo 1 > "/sys/block/$ZRAM_BLOCK/hybridswap_enable" 2>/dev/null
        restore_hybridswap_state
        return 0
    fi
    if [ -f "/sys/block/$ZRAM_BLOCK/backing_dev" ] && [ -f "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" ]; then
        printf '%s' "$device" > "/sys/block/$ZRAM_BLOCK/backing_dev" 2>/dev/null || return 1
        readback=$(get_current_backing)
        [ "$readback" = "$device" ] || return 1
        echo 0 > "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" 2>/dev/null
        return 0
    fi
    return 1
}

verify_eswap_health() {
    [ -n "$ZRAM_BLOCK" ] || return 1
    meminfo="/sys/block/$ZRAM_BLOCK/hybridswap_meminfo"
    [ -r "$meminfo" ] || return 1
    est=$(awk '$1 == "EST:" { print $2; exit }' "$meminfo" 2>/dev/null)
    [ -n "$est" ] && [ "$est" -gt 0 ] 2>/dev/null
}

restore_system_backing() {
    system_backing=$(find_system_backing "$1") || return 0
    current=$(get_current_backing)
    if [ "$current" = "$system_backing" ]; then
        restore_hybridswap_state
        return 0
    fi
    bind_backing_device "$system_backing"
}

find_backing_loop() {
    /system/bin/losetup -a 2>/dev/null | awk -v file="($BACKING_FILE)" '$0 ~ file { sub(/:.*/, "", $1); print $1; exit }'
}

detach_backing_loop() {
    loop_device=$(get_managed_loop)
    if [ -n "$loop_device" ]; then
        /system/bin/losetup -d "$loop_device" 2>/dev/null || return 1
    fi
    rm -f "$LOOP_STATE"
    return 0
}

clear_managed_binding() {
    [ -n "$ZRAM_BLOCK" ] || return 0
    current=$(get_current_backing)
    is_managed_backing "$current" || return 0
    if [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" ]; then
        printf '%s' none > "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" 2>/dev/null
    elif [ -f "/sys/block/$ZRAM_BLOCK/backing_dev" ]; then
        printf '%s' none > "/sys/block/$ZRAM_BLOCK/backing_dev" 2>/dev/null
        [ -f "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" ] && echo 1 > "/sys/block/$ZRAM_BLOCK/writeback_limit_enable" 2>/dev/null
        [ -f "/sys/block/$ZRAM_BLOCK/writeback_limit" ] && echo 0 > "/sys/block/$ZRAM_BLOCK/writeback_limit" 2>/dev/null
    fi
}

cleanup_backing() {
    clear_managed_binding
    detach_backing_loop || return 1
    rm -f "$BACKING_FILE"
    restore_system_backing
}

case "$ACTION" in
    detect)
        find_system_backing
        ;;
    remember)
        remember_system_backing
        ;;
    restore)
        restore_system_backing "$3"
        ;;
    apply)
        cleanup_backing
        ;;
    cleanup)
        cleanup_backing
        ;;
    *)
        exit 2
        ;;
esac
