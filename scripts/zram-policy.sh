#!/system/bin/sh

SCRIPT_DIR=${0%/*}
MODDIR=${SCRIPT_DIR%/*}
CONFIG_FILE="$MODDIR/config/zram_policy.conf"
PID_FILE="$MODDIR/config/.zram_policy.pid"
STATE_FILE="$MODDIR/config/.zram_policy_state"
BASELINE_FILE="$MODDIR/config/.zram_policy.baseline"

get_value() {
    [ -f "$1" ] && grep -m1 "^$2=" "$1" 2>/dev/null | cut -d'=' -f2-
}

number_or_default() {
    value="$1"
    fallback="$2"
    case "$value" in ''|*[!0-9]*) echo "$fallback" ;; *) echo "$value" ;; esac
}

policy_enabled() {
    [ "$(get_value "$CONFIG_FILE" enabled)" = "1" ]
}

find_zram_block() {
    awk 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev ~ /^zram[0-9]+$/) { print dev; exit } }' /proc/swaps 2>/dev/null
}

pid_is_daemon() {
    pid="$1"
    [ -n "$pid" ] && [ -d "/proc/$pid" ] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'zram-policy.sh.*daemon'
}

read_oplus_value() {
    key="$1"
    for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do
        [ -r "$node" ] || continue
        awk -F': *' -v key="$key" '$1 == key { print $2; exit }' "$node" 2>/dev/null
        return
    done
}

write_oplus_value() {
    key="$1"
    value="$2"
    case "$value" in ''|*[!0-9]*) return 1 ;; esac
    for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do
        [ -w "$node" ] || continue
        echo "$key=$value" > "$node" 2>/dev/null
    done
    case "$key" in
        vm_swappiness)
            for node in /sys/module/oplus_bsp_zram_opt/parameters/vm_swappiness /sys/module/zram_opt/parameters/vm_swappiness; do
                [ -w "$node" ] && echo "$value" > "$node" 2>/dev/null
            done
            ;;
        direct_swappiness)
            for node in /sys/module/oplus_bsp_zram_opt/parameters/direct_vm_swappiness /sys/module/zram_opt/parameters/direct_vm_swappiness; do
                [ -w "$node" ] && echo "$value" > "$node" 2>/dev/null
            done
            ;;
        swapd_swappiness)
            for node in /sys/module/oplus_bsp_zram_opt/parameters/hybridswapd_swappiness /sys/module/zram_opt/parameters/hybridswapd_swappiness; do
                [ -w "$node" ] && echo "$value" > "$node" 2>/dev/null
            done
            ;;
    esac
}

capture_baseline() {
    [ -f "$BASELINE_FILE" ] && return 0
    mkdir -p "$MODDIR/config"
    block=$(find_zram_block)
    {
        printf 'vm_swappiness=%s\n' "$(read_oplus_value vm_swappiness)"
        printf 'direct_swappiness=%s\n' "$(read_oplus_value direct_swappiness)"
        printf 'swapd_swappiness=%s\n' "$(read_oplus_value swapd_swappiness)"
        if [ -n "$block" ] && [ -r "/sys/block/$block/hybridswap_swapd_pause" ]; then
            printf 'hybridswap_swapd_pause=%s\n' "$(cat "/sys/block/$block/hybridswap_swapd_pause" 2>/dev/null | tr -d ' \r\n')"
        fi
    } > "$BASELINE_FILE"
}

restore_baseline() {
    [ -r "$BASELINE_FILE" ] || return 0
    block=$(find_zram_block)
    for key in vm_swappiness direct_swappiness swapd_swappiness; do
        value=$(get_value "$BASELINE_FILE" "$key")
        [ -n "$value" ] && write_oplus_value "$key" "$value"
    done
    pause=$(get_value "$BASELINE_FILE" hybridswap_swapd_pause)
    [ -n "$block" ] && [ -n "$pause" ] && [ -w "/sys/block/$block/hybridswap_swapd_pause" ] && echo "$pause" > "/sys/block/$block/hybridswap_swapd_pause" 2>/dev/null
    rm -f "$BASELINE_FILE"
}

screen_on() {
    state=$(dumpsys power 2>/dev/null | sed -n 's/.*mWakefulness=\([^ ]*\).*/\1/p' | head -1)
    case "$state" in Asleep|Dozing) echo 0 ;; *) echo 1 ;; esac
}

battery_percent() {
    value=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null | tr -d ' \r\n')
    number_or_default "$value" 100
}

is_charging() {
    status=$(cat /sys/class/power_supply/battery/status 2>/dev/null | tr '[:upper:]' '[:lower:]')
    case "$status" in charging|full) echo 1 ;; *) echo 0 ;; esac
}

max_temperature_c() {
    best=0
    for zone in /sys/class/thermal/thermal_zone*; do
        [ -r "$zone/temp" ] || continue
        type=$(cat "$zone/type" 2>/dev/null | tr '[:upper:]' '[:lower:]')
        case "$type" in *cpu*|*cpuss*|*soc*) ;; *) continue ;; esac
        value=$(cat "$zone/temp" 2>/dev/null | tr -d ' \r\n')
        case "$value" in ''|*[!0-9]*) continue ;; esac
        [ "$value" -gt 1000 ] && value=$((value / 1000))
        [ "$value" -gt "$best" ] && [ "$value" -lt 150 ] && best=$value
    done
    echo "$best"
}

pressure_avg10() {
    awk '/^some / { for (i = 1; i <= NF; i++) if ($i ~ /^avg10=/) { sub(/^avg10=/, "", $i); print $i; exit } }' /proc/pressure/memory 2>/dev/null
}

bytes_to_mb() {
    awk -v value="$1" 'BEGIN { if (value ~ /^[0-9]+$/) print int(value / 1048576); else print 0 }'
}

kb_to_mb() {
    awk -v value="$1" 'BEGIN { if (value ~ /^[0-9]+$/) print int(value / 1024); else print 0 }'
}

positive_difference_mb() {
    awk -v high="$1" -v low="$2" 'BEGIN { difference = high - low; print (difference > 0 ? int(difference / 1048576) : 0) }'
}

percentage_difference() {
    awk -v high="$1" -v low="$2" 'BEGIN { print (low > 0 && high > low ? int((high - low) * 100 / low) : 0) }'
}

hybridswap_daily_kb() {
    block="$1"
    stat_file="/sys/block/$block/hybridswap_stat_snap"
    [ -r "$stat_file" ] || { echo 0; return; }
    value=$(awk -F'[:= ]+' '$1 == "reclaimin_bytes_daily" { print $2; exit }' "$stat_file" 2>/dev/null)
    number_or_default "$value" 0
}

hybridswap_quota_bytes() {
    block="$1"
    for node in \
        "/sys/block/$block/hybridswap_daily_quota" \
        "/sys/block/$block/hybridswap_quota_day" \
        /sys/module/oplus_bsp_hybridswap_zram/parameters/hybridswap_daily_quota \
        /sys/module/hybridswap_zram/parameters/hybridswap_daily_quota; do
        [ -r "$node" ] || continue
        value=$(cat "$node" 2>/dev/null | tr -d ' \r\n')
        number_or_default "$value" 0
        return
    done
    echo 0
}

read_mm_stat() {
    block="$1"
    set -- $(cat "/sys/block/$block/mm_stat" 2>/dev/null)
    MM_ORIG=${1:-0}
    MM_COMPR=${2:-0}
    MM_USED=${3:-0}
}

zram_usage_percent() {
    block="$1"
    awk -v block="$block" 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev == block) { print ($3 > 0 ? int($4 * 100 / $3) : 0); exit } }' /proc/swaps 2>/dev/null
}

sync_oplus_swappiness() {
    target=$(cat /proc/sys/vm/swappiness 2>/dev/null | tr -d ' \r\n')
    target=$(number_or_default "$target" 100)
    direct=$target
    [ "$direct" -gt 100 ] && direct=100
    swapd=200
    write_oplus_value vm_swappiness "$target"
    write_oplus_value direct_swappiness "$direct"
    write_oplus_value swapd_swappiness "$swapd"
    SYNC_VM=$target
    SYNC_DIRECT=$direct
    SYNC_SWAPD=$swapd
}

write_state() {
    tmp="$STATE_FILE.tmp.$$"
    {
        printf 'running=%s\n' "$1"
        printf 'supported=%s\n' "$SUPPORTED"
        printf 'zram_block=%s\n' "$ZRAM_BLOCK"
        printf 'usage_percent=%s\n' "$USAGE_PERCENT"
        printf 'compressed_mb=%s\n' "$COMPRESSED_MB"
        printf 'memory_used_mb=%s\n' "$MEMORY_USED_MB"
        printf 'overhead_mb=%s\n' "$OVERHEAD_MB"
        printf 'pressure_avg10=%s\n' "$PRESSURE_AVG10"
        printf 'temperature_c=%s\n' "$TEMPERATURE_C"
        printf 'screen_on=%s\n' "$SCREEN_ON"
        printf 'hybridswap_paused=%s\n' "$HYBRID_PAUSED"
        printf 'hybridswap_daily_mb=%s\n' "$HYBRID_DAILY_MB"
        printf 'hybridswap_quota_mb=%s\n' "$HYBRID_QUOTA_MB"
        printf 'oplus_vm_swappiness=%s\n' "$SYNC_VM"
        printf 'oplus_direct_swappiness=%s\n' "$SYNC_DIRECT"
        printf 'oplus_swapd_swappiness=%s\n' "$SYNC_SWAPD"
        printf 'last_action=%s\n' "$LAST_ACTION"
        printf 'last_reason=%s\n' "$LAST_REASON"
        printf 'last_recompress_epoch=%s\n' "$LAST_RECOMPRESS"
        printf 'last_compact_epoch=%s\n' "$LAST_COMPACT"
        printf 'recompress_saved_mb=%s\n' "$RECOMPRESS_SAVED_MB"
    } > "$tmp" && mv -f "$tmp" "$STATE_FILE"
}

run_once() {
    ZRAM_BLOCK=$(find_zram_block)
    SUPPORTED=0
    USAGE_PERCENT=0
    COMPRESSED_MB=0
    MEMORY_USED_MB=0
    OVERHEAD_MB=0
    PRESSURE_AVG10=$(pressure_avg10)
    [ -n "$PRESSURE_AVG10" ] || PRESSURE_AVG10=0
    TEMPERATURE_C=$(max_temperature_c)
    SCREEN_ON=$(screen_on)
    HYBRID_PAUSED=0
    HYBRID_DAILY_MB=0
    HYBRID_QUOTA_MB=0
    SYNC_VM=$(read_oplus_value vm_swappiness)
    SYNC_DIRECT=$(read_oplus_value direct_swappiness)
    SYNC_SWAPD=$(read_oplus_value swapd_swappiness)
    LAST_ACTION=$(get_value "$STATE_FILE" last_action)
    [ -n "$LAST_ACTION" ] || LAST_ACTION=idle
    LAST_REASON=none
    LAST_RECOMPRESS=$(number_or_default "$(get_value "$STATE_FILE" last_recompress_epoch)" 0)
    LAST_COMPACT=$(number_or_default "$(get_value "$STATE_FILE" last_compact_epoch)" 0)
    RECOMPRESS_SAVED_MB=$(number_or_default "$(get_value "$STATE_FILE" recompress_saved_mb)" 0)
    ACTION_THIS_RUN=none

    if [ -z "$ZRAM_BLOCK" ] || [ ! -r "/sys/block/$ZRAM_BLOCK/mm_stat" ]; then
        LAST_REASON=no_zram
        write_state 1
        return 1
    fi
    SUPPORTED=1
    capture_baseline
    HYBRID_DAILY_MB=$(kb_to_mb "$(hybridswap_daily_kb "$ZRAM_BLOCK")")
    HYBRID_QUOTA_MB=$(bytes_to_mb "$(hybridswap_quota_bytes "$ZRAM_BLOCK")")
    read_mm_stat "$ZRAM_BLOCK"
    USAGE_PERCENT=$(zram_usage_percent "$ZRAM_BLOCK")
    COMPRESSED_MB=$(bytes_to_mb "$MM_COMPR")
    MEMORY_USED_MB=$(bytes_to_mb "$MM_USED")
    OVERHEAD_MB=$(positive_difference_mb "$MM_USED" "$MM_COMPR")

    sync_oplus_swappiness

    critical=0
    awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value >= 5.0 ? 0 : 1 }' && critical=1
    [ "$USAGE_PERCENT" -ge 92 ] && critical=1
    pause_node="/sys/block/$ZRAM_BLOCK/hybridswap_swapd_pause"
    if [ -w "$pause_node" ]; then
        if [ "$SCREEN_ON" = "1" ] && [ "$critical" = "0" ]; then
            desired_pause=1
        else
            desired_pause=0
        fi
        current_pause=$(cat "$pause_node" 2>/dev/null | tr -d ' \r\n')
        [ "$current_pause" = "$desired_pause" ] || echo "$desired_pause" > "$pause_node" 2>/dev/null
        HYBRID_PAUSED=$desired_pause
    fi

    now=$(date +%s)
    interval=$(number_or_default "$(get_value "$CONFIG_FILE" interval_seconds)" 30)
    idle_age=$(number_or_default "$(get_value "$CONFIG_FILE" idle_age_seconds)" 600)
    recompress_usage=$(number_or_default "$(get_value "$CONFIG_FILE" recompress_usage_percent)" 70)
    recompress_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" recompress_cooldown_seconds)" 1800)
    compact_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" compact_cooldown_seconds)" 3600)
    compact_overhead_mb=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_mb)" 256)
    compact_overhead_percent=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_percent)" 12)
    thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" thermal_limit_c)" 48)
    battery_min=$(number_or_default "$(get_value "$CONFIG_FILE" battery_min_percent)" 20)
    battery=$(battery_percent)
    charging=$(is_charging)
    overhead_percent=$(percentage_difference "$MM_USED" "$MM_COMPR")

    if [ "$SCREEN_ON" = "0" ] && [ "$USAGE_PERCENT" -ge "$recompress_usage" ] && [ "$TEMPERATURE_C" -le "$thermal_limit" ] && { [ "$battery" -ge "$battery_min" ] || [ "$charging" = "1" ]; }; then
        if [ $((now - LAST_RECOMPRESS)) -ge "$recompress_cooldown" ] && [ -w "/sys/block/$ZRAM_BLOCK/idle" ] && [ -w "/sys/block/$ZRAM_BLOCK/recompress" ]; then
            before_used=$MM_USED
            if echo "$idle_age" > "/sys/block/$ZRAM_BLOCK/idle" 2>/dev/null && echo 'type=idle' > "/sys/block/$ZRAM_BLOCK/recompress" 2>/dev/null; then
                read_mm_stat "$ZRAM_BLOCK"
                saved=$(positive_difference_mb "$before_used" "$MM_USED")
                LAST_RECOMPRESS=$now
                RECOMPRESS_SAVED_MB=$saved
                LAST_ACTION=recompress
                ACTION_THIS_RUN=recompress
                LAST_REASON=screen_off_idle_pages
                COMPRESSED_MB=$(bytes_to_mb "$MM_COMPR")
                MEMORY_USED_MB=$(bytes_to_mb "$MM_USED")
                OVERHEAD_MB=$(positive_difference_mb "$MM_USED" "$MM_COMPR")
            else
                LAST_REASON=recompress_failed
            fi
        else
            LAST_REASON=recompress_cooldown
        fi
    elif [ "$SCREEN_ON" = "1" ]; then
        LAST_REASON=screen_on
    elif [ "$USAGE_PERCENT" -lt "$recompress_usage" ]; then
        LAST_REASON=low_usage
    elif [ "$TEMPERATURE_C" -gt "$thermal_limit" ]; then
        LAST_REASON=high_temperature
    else
        LAST_REASON=low_battery
    fi

    if [ "$ACTION_THIS_RUN" != "recompress" ] && [ -w "/sys/block/$ZRAM_BLOCK/compact" ] && [ $((now - LAST_COMPACT)) -ge "$compact_cooldown" ]; then
        if [ "$OVERHEAD_MB" -ge "$compact_overhead_mb" ] && [ "$overhead_percent" -ge "$compact_overhead_percent" ]; then
            if echo 1 > "/sys/block/$ZRAM_BLOCK/compact" 2>/dev/null; then
                LAST_COMPACT=$now
                LAST_ACTION=compact
                ACTION_THIS_RUN=compact
                LAST_REASON=fragmentation_threshold
                read_mm_stat "$ZRAM_BLOCK"
                COMPRESSED_MB=$(bytes_to_mb "$MM_COMPR")
                MEMORY_USED_MB=$(bytes_to_mb "$MM_USED")
                OVERHEAD_MB=$(positive_difference_mb "$MM_USED" "$MM_COMPR")
            fi
        fi
    fi

    write_state 1
    echo "$interval"
}

run_daemon() {
    echo $$ > "$PID_FILE"
    cleanup() {
        trap - TERM INT EXIT
        rm -f "$PID_FILE"
        restore_baseline
        exit 0
    }
    trap cleanup TERM INT EXIT
    trap : HUP
    while policy_enabled; do
        interval=$(run_once)
        interval=$(number_or_default "$interval" 30)
        sleep "$interval"
    done
}

stop_daemon() {
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if pid_is_daemon "$pid"; then
        kill -TERM "$pid" 2>/dev/null
        count=0
        while [ -d "/proc/$pid" ] && [ "$count" -lt 30 ]; do
            sleep 0.1
            count=$((count + 1))
        done
    fi
    rm -f "$PID_FILE"
    restore_baseline
    if [ -f "$STATE_FILE" ]; then
        sed -i 's/^running=.*/running=0/' "$STATE_FILE" 2>/dev/null
    fi
}

start_daemon() {
    policy_enabled || return 0
    pid=$(cat "$PID_FILE" 2>/dev/null)
    pid_is_daemon "$pid" && { kill -HUP "$pid" 2>/dev/null; return 0; }
    nohup /system/bin/sh "$0" daemon >/dev/null 2>&1 &
}

case "$1" in
    daemon) run_daemon ;;
    start) start_daemon ;;
    stop) stop_daemon ;;
    once) policy_enabled && run_once >/dev/null ;;
    status)
        if [ -r "$STATE_FILE" ]; then
            cat "$STATE_FILE"
        else
            echo running=0
            [ -n "$(find_zram_block)" ] && echo supported=1 || echo supported=0
        fi
        ;;
    apply)
        stop_daemon
        start_daemon
        ;;
    *) exit 2 ;;
esac
