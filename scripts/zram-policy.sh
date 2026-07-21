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

read_erm_stat() {
    [ -r /sys/kernel/oplus_mm/erm/stats ] || return 1
    awk -v key="$1" '$1 == key { print $2; exit }' /sys/kernel/oplus_mm/erm/stats 2>/dev/null
}

write_if_supported() {
    node="$1"
    value="$2"
    [ -w "$node" ] && echo "$value" > "$node" 2>/dev/null
}

select_memory_profile() {
    mem_total_mb=$(awk '/^MemTotal:/ { print int($2 / 1024); exit }' /proc/meminfo 2>/dev/null)
    mem_total_mb=$(number_or_default "$mem_total_mb" 8192)
    if [ "$mem_total_mb" -ge 14336 ]; then
        PROFILE_MIN_MB=4000
        PROFILE_HIGH_MB=4500
        PROFILE_WM_DIRECT=196608
        PROFILE_WM_MIN=163840
        PROFILE_ZRAM_INCREASE=2048
        PROFILE_ZRAM_LIMIT=10240
    elif [ "$mem_total_mb" -ge 10240 ]; then
        PROFILE_MIN_MB=3200
        PROFILE_HIGH_MB=3600
        PROFILE_WM_DIRECT=163840
        PROFILE_WM_MIN=131072
        PROFILE_ZRAM_INCREASE=1536
        PROFILE_ZRAM_LIMIT=8192
    elif [ "$mem_total_mb" -ge 7168 ]; then
        PROFILE_MIN_MB=2400
        PROFILE_HIGH_MB=2800
        PROFILE_WM_DIRECT=131072
        PROFILE_WM_MIN=98304
        PROFILE_ZRAM_INCREASE=1024
        PROFILE_ZRAM_LIMIT=6144
    else
        PROFILE_MIN_MB=1600
        PROFILE_HIGH_MB=1900
        PROFILE_WM_DIRECT=98304
        PROFILE_WM_MIN=81920
        PROFILE_ZRAM_INCREASE=512
        PROFILE_ZRAM_LIMIT=4096
    fi
}

select_erm_profile() {
    if [ "$mem_total_mb" -ge 14336 ]; then
        PROFILE_MIN_MB=4500
        PROFILE_HIGH_MB=5000
        PROFILE_WM_DIRECT=229376
        PROFILE_WM_MIN=196608
    elif [ "$mem_total_mb" -ge 10240 ]; then
        PROFILE_MIN_MB=3600
        PROFILE_HIGH_MB=4000
        PROFILE_WM_DIRECT=196608
        PROFILE_WM_MIN=163840
    elif [ "$mem_total_mb" -ge 7168 ]; then
        PROFILE_MIN_MB=2800
        PROFILE_HIGH_MB=3200
        PROFILE_WM_DIRECT=163840
        PROFILE_WM_MIN=131072
    else
        PROFILE_MIN_MB=1800
        PROFILE_HIGH_MB=2200
        PROFILE_WM_DIRECT=114688
        PROFILE_WM_MIN=98304
    fi
}

detect_memory_backend() {
    if [ -r /sys/kernel/oplus_mm/erm/stats ] && [ -w /dev/memcg/memory.erm_avail_buffer ]; then
        echo erm
    elif [ -r "/sys/block/$1/hybridswap_vmstat" ]; then
        echo hybridswapd
    else
        echo generic
    fi
}

apply_memory_profile() {
    block="$1"
    select_memory_profile
    MEMORY_BACKEND=$(detect_memory_backend "$block")
    TARGET_VM=160
    TARGET_DIRECT=120
    TARGET_KSWAPD_FIRST=120
    TARGET_KSWAPD_SECOND=160
    TARGET_THRASHING=25
    if [ "$MEMORY_BACKEND" = "erm" ]; then
        select_erm_profile
        TARGET_VM=180
        TARGET_DIRECT=140
        TARGET_KSWAPD_FIRST=140
        TARGET_KSWAPD_SECOND=180
        TARGET_THRASHING=30
    fi
    RECLAIM_WINDOW_MB="$PROFILE_MIN_MB-$PROFILE_HIGH_MB"

    write_if_supported /proc/sys/vm/swappiness "$TARGET_VM"
    write_oplus_value vm_swappiness "$TARGET_VM"
    write_oplus_value direct_swappiness "$TARGET_DIRECT"
    write_oplus_value swapd_swappiness 200
    write_if_supported /proc/oplus_mem/dynamic_swappiness "$TARGET_KSWAPD_FIRST 4096 $TARGET_KSWAPD_SECOND 2048"
    write_if_supported /proc/oplus_healthinfo/dynamic_swappiness "$TARGET_KSWAPD_FIRST 4096 $TARGET_KSWAPD_SECOND 2048"

    if [ "$MEMORY_BACKEND" = "erm" ]; then
        write_if_supported /dev/memcg/memory.erm_avail_buffer "$PROFILE_MIN_MB $PROFILE_HIGH_MB"
        write_if_supported /sys/kernel/oplus_mm/erm/wmarks "$PROFILE_WM_DIRECT $PROFILE_WM_MIN"
        write_if_supported /sys/kernel/oplus_mm/erm/kswapd_swappiness1 "4096 $TARGET_KSWAPD_FIRST"
        write_if_supported /sys/kernel/oplus_mm/erm/kswapd_swappiness2 "2048 $TARGET_KSWAPD_SECOND"
        write_if_supported /sys/kernel/oplus_mm/erm/direct_swappiness1 "2048 $TARGET_DIRECT"
        write_if_supported /sys/kernel/oplus_mm/erm/thrashing_limit_pct "$TARGET_THRASHING"
        write_if_supported /dev/memcg/memory.zram_used_limit_mb "$PROFILE_ZRAM_LIMIT"
        if command -v resetprop >/dev/null 2>&1; then
            [ "$(getprop persist.debug.disable_atomic_clean 2>/dev/null)" = "true" ] || resetprop -p persist.debug.disable_atomic_clean true 2>/dev/null
            [ "$(getprop sys.nirvana.enable_lowfree_cch_clean 2>/dev/null)" = "false" ] || resetprop sys.nirvana.enable_lowfree_cch_clean false 2>/dev/null
        fi
    else
        write_if_supported /dev/memcg/memory.avail_buffers "$PROFILE_HIGH_MB $PROFILE_MIN_MB $PROFILE_HIGH_MB 1536"
        write_if_supported /dev/memcg/memory.zram_wm_ratio 75
        write_if_supported /dev/memcg/memory.cpuload_threshold 80
        write_if_supported /dev/memcg/memory.swapd_max_reclaim_size 100
    fi

    write_if_supported "/sys/block/$block/hybridswap_zram_increase" "$PROFILE_ZRAM_INCREASE"
    ATOMIC_CLEAN_DISABLED=$(getprop persist.debug.disable_atomic_clean 2>/dev/null)
    SYNC_VM=$TARGET_VM
    SYNC_DIRECT=$TARGET_DIRECT
    SYNC_SWAPD=200
}

capture_baseline() {
    [ -f "$BASELINE_FILE" ] && return 0
    mkdir -p "$MODDIR/config"
    block=$(find_zram_block)
    {
        printf 'sys_vm_swappiness=%s\n' "$(cat /proc/sys/vm/swappiness 2>/dev/null | tr -d ' \r\n')"
        printf 'vm_swappiness=%s\n' "$(read_oplus_value vm_swappiness)"
        printf 'direct_swappiness=%s\n' "$(read_oplus_value direct_swappiness)"
        printf 'swapd_swappiness=%s\n' "$(read_oplus_value swapd_swappiness)"
        printf 'dynamic_swappiness=%s\n' "$(cat /proc/oplus_mem/dynamic_swappiness 2>/dev/null | tr -d '\r\n')"
        printf 'erm_avail_buffer=%s\n' "$(cat /dev/memcg/memory.erm_avail_buffer 2>/dev/null | tr -d '[]\r\n' | tr '-' ' ')"
        printf 'erm_wmarks=%s %s\n' "$(read_erm_stat wm_direct)" "$(read_erm_stat wm_min)"
        printf 'erm_kswapd1=%s %s\n' "$(read_erm_stat kswapd_threshold1)" "$(read_erm_stat kswapd_swappiness1)"
        printf 'erm_kswapd2=%s %s\n' "$(read_erm_stat kswapd_threshold2)" "$(read_erm_stat kswapd_swappiness2)"
        printf 'erm_direct1=%s %s\n' "$(read_erm_stat direct_threshold1)" "$(read_erm_stat direct_swappiness1)"
        printf 'erm_thrashing_limit=%s\n' "$(read_erm_stat thrashing_limit_pct)"
        if [ -r /dev/memcg/memory.avail_buffers ]; then
            printf 'avail_buffers=%s %s %s %s\n' \
                "$(awk '$1 == "avail_buffers:" { print $2 }' /dev/memcg/memory.avail_buffers)" \
                "$(awk '$1 == "min_avail_buffers:" { print $2 }' /dev/memcg/memory.avail_buffers)" \
                "$(awk '$1 == "high_avail_buffers:" { print $2 }' /dev/memcg/memory.avail_buffers)" \
                "$(awk '$1 == "free_swap_threshold:" { print $2 }' /dev/memcg/memory.avail_buffers)"
        fi
        printf 'zram_wm_ratio=%s\n' "$(cat /dev/memcg/memory.zram_wm_ratio 2>/dev/null | tr -d ' \r\n')"
        printf 'cpuload_threshold=%s\n' "$(cat /dev/memcg/memory.cpuload_threshold 2>/dev/null | tr -d ' \r\n')"
        printf 'swapd_max_reclaim_size=%s\n' "$(cat /dev/memcg/memory.swapd_max_reclaim_size 2>/dev/null | awk '{ print $NF }')"
        printf 'hybridswap_zram_increase=%s\n' "$(cat "/sys/block/$block/hybridswap_zram_increase" 2>/dev/null | tr -d ' \r\n')"
        printf 'zram_used_limit_mb=%s\n' "$(cat /dev/memcg/memory.zram_used_limit_mb 2>/dev/null | tr -d ' \r\n')"
        printf 'atomic_clean_disabled=%s\n' "$(getprop persist.debug.disable_atomic_clean 2>/dev/null)"
        printf 'nirvana_lowfree_clean=%s\n' "$(getprop sys.nirvana.enable_lowfree_cch_clean 2>/dev/null)"
        if [ -n "$block" ] && [ -r "/sys/block/$block/hybridswap_swapd_pause" ]; then
            printf 'hybridswap_swapd_pause=%s\n' "$(cat "/sys/block/$block/hybridswap_swapd_pause" 2>/dev/null | tr -d ' \r\n')"
        fi
    } > "$BASELINE_FILE"
}

restore_baseline() {
    [ -r "$BASELINE_FILE" ] || return 0
    block=$(find_zram_block)
    value=$(get_value "$BASELINE_FILE" sys_vm_swappiness)
    [ -n "$value" ] && write_if_supported /proc/sys/vm/swappiness "$value"
    for key in vm_swappiness direct_swappiness swapd_swappiness; do
        value=$(get_value "$BASELINE_FILE" "$key")
        [ -n "$value" ] && write_oplus_value "$key" "$value"
    done
    value=$(get_value "$BASELINE_FILE" dynamic_swappiness)
    [ -n "$value" ] && write_if_supported /proc/oplus_mem/dynamic_swappiness "$value"
    value=$(get_value "$BASELINE_FILE" erm_avail_buffer)
    [ -n "$value" ] && write_if_supported /dev/memcg/memory.erm_avail_buffer "$value"
    value=$(get_value "$BASELINE_FILE" erm_wmarks)
    [ -n "$value" ] && write_if_supported /sys/kernel/oplus_mm/erm/wmarks "$value"
    value=$(get_value "$BASELINE_FILE" erm_kswapd1)
    [ -n "$value" ] && write_if_supported /sys/kernel/oplus_mm/erm/kswapd_swappiness1 "$value"
    value=$(get_value "$BASELINE_FILE" erm_kswapd2)
    [ -n "$value" ] && write_if_supported /sys/kernel/oplus_mm/erm/kswapd_swappiness2 "$value"
    value=$(get_value "$BASELINE_FILE" erm_direct1)
    case "$value" in 0\ 0|'') ;; *) write_if_supported /sys/kernel/oplus_mm/erm/direct_swappiness1 "$value" ;; esac
    value=$(get_value "$BASELINE_FILE" erm_thrashing_limit)
    [ -n "$value" ] && write_if_supported /sys/kernel/oplus_mm/erm/thrashing_limit_pct "$value"
    for item in \
        'avail_buffers:/dev/memcg/memory.avail_buffers' \
        'zram_wm_ratio:/dev/memcg/memory.zram_wm_ratio' \
        'cpuload_threshold:/dev/memcg/memory.cpuload_threshold' \
        'swapd_max_reclaim_size:/dev/memcg/memory.swapd_max_reclaim_size' \
        'zram_used_limit_mb:/dev/memcg/memory.zram_used_limit_mb' \
        "hybridswap_zram_increase:/sys/block/$block/hybridswap_zram_increase"; do
        key=${item%%:*}
        node=${item#*:}
        value=$(get_value "$BASELINE_FILE" "$key")
        [ -n "$value" ] && write_if_supported "$node" "$value"
    done
    if command -v resetprop >/dev/null 2>&1; then
        value=$(get_value "$BASELINE_FILE" atomic_clean_disabled)
        if [ -n "$value" ]; then
            resetprop -p persist.debug.disable_atomic_clean "$value" 2>/dev/null
        else
            resetprop -p -d persist.debug.disable_atomic_clean 2>/dev/null
        fi
        value=$(get_value "$BASELINE_FILE" nirvana_lowfree_clean)
        if [ -n "$value" ]; then
            resetprop sys.nirvana.enable_lowfree_cch_clean "$value" 2>/dev/null
        else
            resetprop -d sys.nirvana.enable_lowfree_cch_clean 2>/dev/null
        fi
    fi
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
        printf 'memory_backend=%s\n' "$MEMORY_BACKEND"
        printf 'reclaim_window_mb=%s\n' "$RECLAIM_WINDOW_MB"
        printf 'atomic_clean_disabled=%s\n' "$ATOMIC_CLEAN_DISABLED"
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
    MEMORY_BACKEND=generic
    RECLAIM_WINDOW_MB=--
    ATOMIC_CLEAN_DISABLED=$(getprop persist.debug.disable_atomic_clean 2>/dev/null)
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

    apply_memory_profile "$ZRAM_BLOCK"

    critical=0
    awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value >= 1.0 ? 0 : 1 }' && critical=1
    [ "$USAGE_PERCENT" -ge 75 ] && critical=1
    pause_node="/sys/block/$ZRAM_BLOCK/hybridswap_swapd_pause"
    if [ -w "$pause_node" ]; then
        if [ "$MEMORY_BACKEND" = "erm" ]; then
            desired_pause=0
        elif [ "$SCREEN_ON" = "1" ] && [ "$critical" = "0" ]; then
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

    if [ "$ACTION_THIS_RUN" != "recompress" ] && [ "$SCREEN_ON" = "0" ] && [ "$TEMPERATURE_C" -le "$thermal_limit" ] && { [ "$battery" -ge "$battery_min" ] || [ "$charging" = "1" ]; } && [ -w "/sys/block/$ZRAM_BLOCK/compact" ] && [ $((now - LAST_COMPACT)) -ge "$compact_cooldown" ]; then
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

print_status() {
    actual_running=0
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if policy_enabled && pid_is_daemon "$pid"; then
        actual_running=1
    fi
    if [ -r "$STATE_FILE" ]; then
        awk -v running="$actual_running" '
            BEGIN { found = 0 }
            /^running=/ { print "running=" running; found = 1; next }
            { print }
            END { if (!found) print "running=" running }
        ' "$STATE_FILE"
    else
        echo "running=$actual_running"
        [ -n "$(find_zram_block)" ] && echo supported=1 || echo supported=0
    fi
}

case "$1" in
    daemon) run_daemon ;;
    start) start_daemon ;;
    stop) stop_daemon ;;
    once) policy_enabled && run_once >/dev/null ;;
    status) print_status ;;
    apply)
        stop_daemon
        start_daemon
        ;;
    *) exit 2 ;;
esac
