#!/system/bin/sh

SCRIPT_DIR=${0%/*}
MODDIR=${SCRIPT_DIR%/*}
CONFIG_FILE="$MODDIR/config/zram_policy.conf"
PID_FILE="$MODDIR/config/.zram_policy.pid"
STATE_FILE="$MODDIR/config/.zram_policy_state"
BASELINE_FILE="$MODDIR/config/.zram_policy.baseline"
ESWAP_CACHE_FILE="$MODDIR/config/.eswap_usable"

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
    command_line=$(cat "/proc/$pid/cmdline" 2>/dev/null | tr '\0' ' ')
    case "$command_line" in
        "/system/bin/sh $0 daemon "|"$0 daemon ") return 0 ;;
        *) return 1 ;;
    esac
}

find_daemon_pids() {
    for process in /proc/[0-9]*; do
        [ -d "$process" ] || continue
        pid=${process##*/}
        case "$pid" in *[!0-9]*) continue ;; esac
        [ "$pid" = "$$" ] && continue
        command_line=$(cat "$process/cmdline" 2>/dev/null | tr '\0' ' ')
        case "$command_line" in
            "/system/bin/sh $0 daemon "|"$0 daemon ") echo "$pid" ;;
        esac
    done
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

write_if_changed() {
    node="$1"
    value="$2"
    [ -w "$node" ] || return 0
    current=$(cat "$node" 2>/dev/null | tr -d ' 
')
    [ "$current" = "$value" ] && return 0
    echo "$value" > "$node" 2>/dev/null
}

coronad_manages_pressure() {
    pid=$(cat "$MODDIR/config/.coronad.pid" 2>/dev/null)
    [ -n "$pid" ] && [ -d "/proc/$pid" ] || return 1
    [ "$(get_value "$MODDIR/config/memory_pressure.conf" enabled)" = "1" ] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'coronad'
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

select_hybridswapd_profile() {
    block="$1"
    mem_total_mb=$(awk '/^MemTotal:/ { print int($2 / 1024); exit }' /proc/meminfo 2>/dev/null)
    mem_total_mb=$(number_or_default "$mem_total_mb" 8192)
    baseline_window=$(get_value "$BASELINE_FILE" avail_buffers)
    set -- $baseline_window
    baseline_min=$(number_or_default "$2" 0)
    baseline_high=$(number_or_default "$3" 0)
    free_swap_threshold=$(number_or_default "$4" 1536)
    if [ "$baseline_min" -le 0 ] || [ "$baseline_high" -lt "$baseline_min" ]; then
        select_memory_profile
        baseline_min=$PROFILE_MIN_MB
        baseline_high=$PROFILE_HIGH_MB
    fi

    calculated_min_mb=$((mem_total_mb * 20 / 100))
    calculated_high_mb=$((mem_total_mb * 23 / 100))
    [ "$calculated_high_mb" -lt "$baseline_high" ] && calculated_high_mb=$baseline_high
    [ "$calculated_min_mb" -lt "$baseline_min" ] && calculated_min_mb=$baseline_min
    [ "$calculated_min_mb" -gt $((calculated_high_mb - 384)) ] && calculated_min_mb=$((calculated_high_mb - 384))
    PROFILE_MIN_MB=$calculated_min_mb
    PROFILE_HIGH_MB=$calculated_high_mb
    reclaim_gap_mb=$((PROFILE_MIN_MB - baseline_min))
    [ "$reclaim_gap_mb" -lt 0 ] && reclaim_gap_mb=0

    baseline_vm=$(number_or_default "$(get_value "$BASELINE_FILE" vm_swappiness)" 160)
    baseline_direct=$(number_or_default "$(get_value "$BASELINE_FILE" direct_swappiness)" 60)
    baseline_swapd=$(number_or_default "$(get_value "$BASELINE_FILE" swapd_swappiness)" 200)
    baseline_zram_wm=$(number_or_default "$(get_value "$BASELINE_FILE" zram_wm_ratio)" 80)
    baseline_cpuload=$(number_or_default "$(get_value "$BASELINE_FILE" cpuload_threshold)" 60)
    baseline_reclaim=$(number_or_default "$(get_value "$BASELINE_FILE" swapd_max_reclaim_size)" 50)
    TARGET_VM=$((baseline_vm + reclaim_gap_mb / 48))
    [ "$TARGET_VM" -gt 180 ] && TARGET_VM=180
    TARGET_DIRECT=$((baseline_direct + reclaim_gap_mb / 20))
    [ "$TARGET_DIRECT" -gt 110 ] && TARGET_DIRECT=110
    TARGET_SWAPD=$baseline_swapd
    TARGET_ZRAM_WM=$((baseline_zram_wm + reclaim_gap_mb / 128))
    [ "$TARGET_ZRAM_WM" -gt 90 ] && TARGET_ZRAM_WM=90
    TARGET_CPULOAD=$((baseline_cpuload + reclaim_gap_mb / 48))
    [ "$TARGET_CPULOAD" -gt 80 ] && TARGET_CPULOAD=80
    TARGET_MAX_RECLAIM=$((baseline_reclaim + reclaim_gap_mb / 12))
    [ "$TARGET_MAX_RECLAIM" -gt 128 ] && TARGET_MAX_RECLAIM=128
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

read_reclaim_window() {
    backend="$1"
    if [ "$backend" = "erm" ] && [ -r /dev/memcg/memory.erm_avail_buffer ]; then
        cat /dev/memcg/memory.erm_avail_buffer 2>/dev/null | tr -d '[]\r\n' | tr ' ' '-'
        return
    fi
    if [ -r /dev/memcg/memory.avail_buffers ]; then
        minimum=$(awk '$1 == "min_avail_buffers:" { print $2; exit }' /dev/memcg/memory.avail_buffers 2>/dev/null)
        high=$(awk '$1 == "high_avail_buffers:" { print $2; exit }' /dev/memcg/memory.avail_buffers 2>/dev/null)
        [ -n "$minimum" ] && [ -n "$high" ] && printf '%s-%s\n' "$minimum" "$high" && return
    fi
    echo --
}

apply_memory_profile() {
    block="$1"
    MEMORY_BACKEND=$(detect_memory_backend "$block")
    if [ "$MEMORY_BACKEND" = "hybridswapd" ]; then
        select_hybridswapd_profile "$block"
        RECLAIM_WINDOW_MB="$PROFILE_MIN_MB-$PROFILE_HIGH_MB"
        coronad_manages_pressure || write_if_changed /proc/sys/vm/swappiness "$TARGET_VM"
        write_oplus_value vm_swappiness "$TARGET_VM"
        write_oplus_value direct_swappiness "$TARGET_DIRECT"
        write_oplus_value swapd_swappiness "$TARGET_SWAPD"
        write_if_changed /dev/memcg/memory.avail_buffers "$PROFILE_HIGH_MB $PROFILE_MIN_MB $PROFILE_HIGH_MB $free_swap_threshold"
        write_if_changed /dev/memcg/memory.zram_wm_ratio "$TARGET_ZRAM_WM"
        write_if_changed /dev/memcg/memory.cpuload_threshold "$TARGET_CPULOAD"
        write_if_changed /dev/memcg/memory.swapd_max_reclaim_size "$TARGET_MAX_RECLAIM"
        ATOMIC_CLEAN_DISABLED=$(getprop persist.debug.disable_atomic_clean 2>/dev/null)
        SYNC_VM=$TARGET_VM
        SYNC_DIRECT=$TARGET_DIRECT
        SYNC_SWAPD=$TARGET_SWAPD
        return
    fi

    select_memory_profile
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

    coronad_manages_pressure || write_if_changed /proc/sys/vm/swappiness "$TARGET_VM"
    write_oplus_value vm_swappiness "$TARGET_VM"
    write_oplus_value direct_swappiness "$TARGET_DIRECT"
    target_swapd=200
    write_oplus_value swapd_swappiness "$target_swapd"
    write_if_changed /proc/oplus_mem/dynamic_swappiness "$TARGET_KSWAPD_FIRST 4096 $TARGET_KSWAPD_SECOND 2048"
    write_if_changed /proc/oplus_healthinfo/dynamic_swappiness "$TARGET_KSWAPD_FIRST 4096 $TARGET_KSWAPD_SECOND 2048"

    if [ "$MEMORY_BACKEND" = "erm" ]; then
        write_if_changed /dev/memcg/memory.erm_avail_buffer "$PROFILE_MIN_MB $PROFILE_HIGH_MB"
        write_if_changed /sys/kernel/oplus_mm/erm/wmarks "$PROFILE_WM_DIRECT $PROFILE_WM_MIN"
        write_if_changed /sys/kernel/oplus_mm/erm/kswapd_swappiness1 "4096 $TARGET_KSWAPD_FIRST"
        write_if_changed /sys/kernel/oplus_mm/erm/kswapd_swappiness2 "2048 $TARGET_KSWAPD_SECOND"
        write_if_changed /sys/kernel/oplus_mm/erm/direct_swappiness1 "2048 $TARGET_DIRECT"
        write_if_changed /sys/kernel/oplus_mm/erm/thrashing_limit_pct "$TARGET_THRASHING"
        write_if_changed /dev/memcg/memory.zram_used_limit_mb "$PROFILE_ZRAM_LIMIT"
        if command -v resetprop >/dev/null 2>&1; then
            [ "$(getprop persist.debug.disable_atomic_clean 2>/dev/null)" = "true" ] || resetprop -p persist.debug.disable_atomic_clean true 2>/dev/null
            [ "$(getprop sys.nirvana.enable_lowfree_cch_clean 2>/dev/null)" = "false" ] || resetprop sys.nirvana.enable_lowfree_cch_clean false 2>/dev/null
        fi
    elif [ "$MEMORY_BACKEND" = "generic" ]; then
        write_if_changed /dev/memcg/memory.avail_buffers "$PROFILE_HIGH_MB $PROFILE_MIN_MB $PROFILE_HIGH_MB 1536"
        write_if_changed /dev/memcg/memory.zram_wm_ratio 70
        write_if_changed /dev/memcg/memory.cpuload_threshold 80
        write_if_changed /dev/memcg/memory.swapd_max_reclaim_size 100
        write_if_changed /dev/memcg/memory.zram_used_limit_mb "$PROFILE_ZRAM_LIMIT"
    fi

    [ "$MEMORY_BACKEND" = "erm" ] && write_if_supported "/sys/block/$block/hybridswap_zram_increase" "$PROFILE_ZRAM_INCREASE"
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
        case "$type" in *trip*|*limit*) continue ;; esac
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

hybridswap_meminfo_kb() {
    block="$1"
    key="$2:"
    file="/sys/block/$block/hybridswap_meminfo"
    [ -r "$file" ] || { echo 0; return; }
    value=$(awk -v key="$key" '$1 == key { print $2; exit }' "$file" 2>/dev/null)
    number_or_default "$value" 0
}

hybridswap_stat_kb() {
    block="$1"
    key="$2:"
    file="/sys/block/$block/hybridswap_stat_snap"
    [ -r "$file" ] || { echo 0; return; }
    value=$(awk -v key="$key" '$1 == key { print $2; exit }' "$file" 2>/dev/null)
    number_or_default "$value" 0
}

hybridswap_vmstat_value() {
    block="$1"
    key="$2"
    file="/sys/block/$block/hybridswap_vmstat"
    [ -r "$file" ] || { echo 0; return; }
    value=$(awk -v key="$key" '$1 == key { print $2; exit }' "$file" 2>/dev/null)
    number_or_default "$value" 0
}

compression_ratio_percent() {
    original="$1"
    compressed="$2"
    awk -v original="$original" -v compressed="$compressed" 'BEGIN { print (compressed > 0 ? int(original * 100 / compressed) : 0) }'
}

select_adaptive_scales() {
    if [ "$COMPRESSION_RATIO_PERCENT" -ge 300 ]; then
        compression_scale=125
    elif [ "$COMPRESSION_RATIO_PERCENT" -ge 240 ]; then
        compression_scale=115
    elif [ "$COMPRESSION_RATIO_PERCENT" -ge 180 ]; then
        compression_scale=100
    elif [ "$COMPRESSION_RATIO_PERCENT" -ge 150 ]; then
        compression_scale=85
    elif [ "$COMPRESSION_RATIO_PERCENT" -gt 0 ]; then
        compression_scale=70
    else
        compression_scale=100
    fi

    case "$ADAPTIVE_FEEDBACK_LEVEL" in
        1)
            feedback_scale=75
            WRITEBACK_BUDGET_SCALE_PERCENT=75
            ADAPTIVE_COOLDOWN_PERCENT=150
            ADAPTIVE_ADJ_BONUS=25
            ;;
        2)
            feedback_scale=55
            WRITEBACK_BUDGET_SCALE_PERCENT=55
            ADAPTIVE_COOLDOWN_PERCENT=220
            ADAPTIVE_ADJ_BONUS=50
            ;;
        3)
            feedback_scale=35
            WRITEBACK_BUDGET_SCALE_PERCENT=35
            ADAPTIVE_COOLDOWN_PERCENT=300
            ADAPTIVE_ADJ_BONUS=100
            ;;
        *)
            ADAPTIVE_FEEDBACK_LEVEL=0
            feedback_scale=100
            WRITEBACK_BUDGET_SCALE_PERCENT=100
            ADAPTIVE_COOLDOWN_PERCENT=100
            ADAPTIVE_ADJ_BONUS=0
            ;;
    esac
    RECLAIM_BUDGET_SCALE_PERCENT=$((compression_scale * feedback_scale / 100))
}

update_adaptive_feedback() {
    CURRENT_REOUT_KB=$(hybridswap_stat_kb "$ZRAM_BLOCK" reout_bytes)
    CURRENT_FAULT_COUNT=$(hybridswap_stat_kb "$ZRAM_BLOCK" fault_cnt)
    CURRENT_REFAULT_HITS=$(hybridswap_vmstat_value "$ZRAM_BLOCK" swapd_hit_refaults)
    LAST_REFAULT_MB=0

    if [ "$FEEDBACK_SAMPLE_EPOCH" -gt 0 ] && [ "$FEEDBACK_SAMPLE_WRITEBACK_KB" -gt 0 ]; then
        sample_age=$((now - FEEDBACK_SAMPLE_EPOCH))
        reout_delta_kb=$((CURRENT_REOUT_KB - FEEDBACK_SAMPLE_REOUT_KB))
        [ "$reout_delta_kb" -lt 0 ] && reout_delta_kb=0
        refault_threshold_kb=$((FEEDBACK_SAMPLE_WRITEBACK_KB * 35 / 100))
        [ "$refault_threshold_kb" -lt 16384 ] && refault_threshold_kb=16384
        if [ "$sample_age" -ge 120 ] && [ "$reout_delta_kb" -ge "$refault_threshold_kb" ]; then
            ADAPTIVE_FEEDBACK_LEVEL=$((ADAPTIVE_FEEDBACK_LEVEL + 1))
            [ "$ADAPTIVE_FEEDBACK_LEVEL" -gt 3 ] && ADAPTIVE_FEEDBACK_LEVEL=3
            FEEDBACK_LAST_ADJUST_EPOCH=$now
            LAST_REFAULT_MB=$((reout_delta_kb / 1024))
            FEEDBACK_SAMPLE_EPOCH=0
            FEEDBACK_SAMPLE_WRITEBACK_KB=0
        elif [ "$sample_age" -ge 900 ]; then
            [ "$ADAPTIVE_FEEDBACK_LEVEL" -gt 0 ] && ADAPTIVE_FEEDBACK_LEVEL=$((ADAPTIVE_FEEDBACK_LEVEL - 1))
            FEEDBACK_LAST_ADJUST_EPOCH=$now
            LAST_REFAULT_MB=$((reout_delta_kb / 1024))
            FEEDBACK_SAMPLE_EPOCH=0
            FEEDBACK_SAMPLE_WRITEBACK_KB=0
        fi
    elif [ "$ADAPTIVE_FEEDBACK_LEVEL" -gt 0 ] && [ "$FEEDBACK_LAST_ADJUST_EPOCH" -gt 0 ] && [ $((now - FEEDBACK_LAST_ADJUST_EPOCH)) -ge 1800 ]; then
        ADAPTIVE_FEEDBACK_LEVEL=$((ADAPTIVE_FEEDBACK_LEVEL - 1))
        FEEDBACK_LAST_ADJUST_EPOCH=$now
    fi

    select_adaptive_scales
}

record_writeback_feedback_sample() {
    written_kb="$1"
    if [ "$FEEDBACK_SAMPLE_EPOCH" -le 0 ]; then
        FEEDBACK_SAMPLE_EPOCH=$now
        FEEDBACK_SAMPLE_REOUT_KB=$CURRENT_REOUT_KB
        FEEDBACK_SAMPLE_FAULT_COUNT=$CURRENT_FAULT_COUNT
        FEEDBACK_SAMPLE_REFAULT_HITS=$CURRENT_REFAULT_HITS
        FEEDBACK_SAMPLE_WRITEBACK_KB=$written_kb
    else
        FEEDBACK_SAMPLE_WRITEBACK_KB=$((FEEDBACK_SAMPLE_WRITEBACK_KB + written_kb))
    fi
}

check_eswap_usable() {
    block="$1"
    if [ -f "$ESWAP_CACHE_FILE" ]; then
        cat "$ESWAP_CACHE_FILE" 2>/dev/null
        return
    fi
    result=0
    total_kb=$(hybridswap_meminfo_kb "$block" EST)
    [ "$total_kb" -gt 0 ] || { echo 0 > "$ESWAP_CACHE_FILE" 2>/dev/null; echo 0; return; }
    backend=$(detect_memory_backend "$block")
    if [ "$backend" = "hybridswapd" ]; then
        echo 1 > "$ESWAP_CACHE_FILE" 2>/dev/null
        echo 1
        return
    fi
    if [ "$backend" = "erm" ] && [ "$SCREEN_ON" = "1" ]; then
        echo -1
        return
    fi
    probe_group=
    for stat in /dev/memcg/apps/*/memory.swap_stat; do
        [ -r "$stat" ] || continue
        group=${stat%/memory.swap_stat}
        name=${group##*/}
        case "$name" in active|inactive|systemserver) continue ;; esac
        [ -w "$group/memory.force_swapout" ] || continue
        sz=$(awk '$1 == "zramCompressedSize:" { print $2; exit }' "$stat" 2>/dev/null)
        sz=$(number_or_default "$sz" 0)
        [ "$sz" -ge 16384 ] || continue
        probe_group=$group
        break
    done
    if [ -n "$probe_group" ]; then
        before=$(hybridswap_meminfo_kb "$block" ESU_C)
        echo 1 > "$probe_group/memory.force_swapout" 2>/dev/null
        after=$(hybridswap_meminfo_kb "$block" ESU_C)
        [ "$after" -gt "$before" ] && result=1
    fi
    echo "$result" > "$ESWAP_CACHE_FILE" 2>/dev/null
    echo "$result"
}

memcg_min_oom_adj() {
    group="$1"
    minimum=1000
    found=0
    for pid in $(cat "$group/cgroup.procs" 2>/dev/null); do
        value=$(cat "/proc/$pid/oom_score_adj" 2>/dev/null | tr -d ' \r\n')
        case "$value" in -[0-9]*|[0-9]*) ;; *) continue ;; esac
        found=1
        [ "$value" -lt "$minimum" ] && minimum=$value
    done
    [ "$found" = "1" ] && echo "$minimum" || echo 1000
}

find_writeback_target() {
    minimum_kb="$1"
    minimum_adj="$2"
    exclude="$3"
    best_size=0
    best_group=
    for stat in /dev/memcg/apps/*/memory.swap_stat; do
        [ -r "$stat" ] || continue
        group=${stat%/memory.swap_stat}
        name=${group##*/}
        case "$name" in active|inactive|systemserver) continue ;; esac
        case ",$exclude," in *",$name,"*) continue ;; esac
        [ -w "$group/memory.force_swapout" ] || continue
        size=$(awk '$1 == "zramCompressedSize:" { print $2; exit }' "$stat" 2>/dev/null)
        size=$(number_or_default "$size" 0)
        [ "$size" -ge "$minimum_kb" ] || continue
        adj=$(memcg_min_oom_adj "$group")
        [ "$adj" -ge "$minimum_adj" ] || continue
        if [ "$size" -gt "$best_size" ]; then
            best_size=$size
            best_group=$group
        fi
    done
    [ -n "$best_group" ] && printf '%s %s\n' "$best_group" "$best_size"
}

list_reclaim_targets() {
    minimum_kb="$1"
    minimum_adj="$2"
    for node in /dev/memcg/apps/*/memory.force_shrink_anon; do
        [ -w "$node" ] || continue
        group=${node%/memory.force_shrink_anon}
        name=${group##*/}
        case "$name" in active|inactive|systemserver) continue ;; esac
        size_bytes=$(awk '$1 == "total_inactive_anon" { print $2; exit }' "$group/memory.stat" 2>/dev/null)
        size_bytes=$(number_or_default "$size_bytes" 0)
        size_kb=$((size_bytes / 1024))
        [ "$size_kb" -ge "$minimum_kb" ] || continue
        adj=$(memcg_min_oom_adj "$group")
        [ "$adj" -ge "$minimum_adj" ] || continue
        printf '%s:%s\n' "$size_kb" "$group"
    done | sort -t':' -k1,1nr
}

zram_swap_used_kb() {
    block="$1"
    awk -v block="$block" 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev == block) { print $4; exit } }' /proc/swaps 2>/dev/null
}

perform_hybridswapd_reclaim() {
    [ "$MEMORY_BACKEND" = "hybridswapd" ] || return 0
    [ "$battery" -ge "$battery_min" ] || return 0
    if [ "$RECLAIM_BLOCKED_UNTIL" -gt "$now" ]; then
        RECLAIM_CIRCUIT_ACTIVE=1
        return 0
    fi
    RECLAIM_BLOCKED_UNTIL=0
    RECLAIM_CIRCUIT_ACTIVE=0

    target_pct=55
    budget_pct=2
    budget_cap_kb=196608
    minimum_budget_kb=32768
    minimum_adj=900
    aggregate_allowed=0
    reclaim_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" reclaim_cooldown_seconds)" 900)
    reclaim_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" reclaim_thermal_limit_c)" 68)
    pressure_limit=0.2
    if [ "$SCREEN_ON" = "1" ]; then
        target_pct=60
        budget_pct=4
        budget_cap_kb=393216
        minimum_budget_kb=32768
        minimum_adj=800
        aggregate_allowed=0
        reclaim_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" reclaim_screen_on_cooldown_seconds)" 180)
        reclaim_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" reclaim_screen_on_thermal_limit_c)" 72)
        pressure_limit=0.1
    fi
    reclaim_cooldown=$((reclaim_cooldown * ADAPTIVE_COOLDOWN_PERCENT / 100))
    minimum_adj=$((minimum_adj + ADAPTIVE_ADJ_BONUS))
    [ "$minimum_adj" -gt 1000 ] && minimum_adj=1000
    [ "$TEMPERATURE_C" -le "$reclaim_thermal_limit" ] || return 0
    awk -v value="$PRESSURE_AVG10" -v limit="$pressure_limit" 'BEGIN { exit value <= limit ? 0 : 1 }' || return 0
    [ $((now - LAST_RECLAIM)) -ge "$reclaim_cooldown" ] || return 0

    total_kb=$(awk -v block="$ZRAM_BLOCK" 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev == block) { print $3; exit } }' /proc/swaps 2>/dev/null)
    used_kb=$(zram_swap_used_kb "$ZRAM_BLOCK")
    total_kb=$(number_or_default "$total_kb" 0)
    used_kb=$(number_or_default "$used_kb" 0)
    [ "$total_kb" -gt 0 ] || return 0
    target_kb=$((total_kb * target_pct / 100))
    [ "$used_kb" -lt "$target_kb" ] || return 0
    budget_kb=$((total_kb * budget_pct / 100))
    budget_kb=$((budget_kb * RECLAIM_BUDGET_SCALE_PERCENT / 100))
    budget_cap_kb=$((budget_cap_kb * RECLAIM_BUDGET_SCALE_PERCENT / 100))
    [ "$budget_kb" -gt "$budget_cap_kb" ] && budget_kb=$budget_cap_kb
    remaining_kb=$((target_kb - used_kb))
    [ "$budget_kb" -gt "$remaining_kb" ] && budget_kb=$remaining_kb
    [ "$budget_kb" -ge "$minimum_budget_kb" ] || return 0

    reclaimed_kb=0
    reclaimed_apps=0
    fail_count=0
    attempt_count=0
    aggregate_reclaimed=0
    reclaim_candidates=$(list_reclaim_targets 4096 "$minimum_adj")
    inactive_group=/dev/memcg/apps/inactive
    aggregate_bytes=$(awk '$1 == "total_inactive_anon" { print $2; exit }' "$inactive_group/memory.stat" 2>/dev/null)
    aggregate_bytes=$(number_or_default "$aggregate_bytes" 0)
    aggregate_kb=$((aggregate_bytes / 1024))
    if [ "$aggregate_allowed" = "1" ] && [ -w "$inactive_group/memory.force_shrink_anon" ] && [ "$aggregate_kb" -ge 65536 ] && [ "$aggregate_kb" -le "$budget_kb" ]; then
        attempt_count=$((attempt_count + 1))
        aggregate_apps=$(printf '%s\n' "$reclaim_candidates" | awk 'NF { count++ } END { print count + 0 }')
        before_kb=$(zram_swap_used_kb "$ZRAM_BLOCK")
        if echo 0 > "$inactive_group/memory.force_shrink_anon" 2>/dev/null; then
            after_kb=$(zram_swap_used_kb "$ZRAM_BLOCK")
            delta_kb=$((after_kb - before_kb))
            if [ "$delta_kb" -gt 0 ]; then
                reclaimed_kb=$delta_kb
                budget_kb=$((budget_kb - delta_kb))
                reclaimed_apps=$aggregate_apps
                aggregate_reclaimed=1
            fi
        fi
    fi
    [ "$aggregate_reclaimed" = "1" ] && reclaim_candidates=
    for candidate in $reclaim_candidates; do
        [ "$budget_kb" -ge 4096 ] || break
        [ "$fail_count" -lt 4 ] || break
        expected_kb=${candidate%%:*}
        group=${candidate#*:}
        attempt_count=$((attempt_count + 1))
        before_kb=$(zram_swap_used_kb "$ZRAM_BLOCK")
        echo 0 > "$group/memory.force_shrink_anon" 2>/dev/null || { fail_count=$((fail_count + 1)); continue; }
        after_kb=$(zram_swap_used_kb "$ZRAM_BLOCK")
        delta_kb=$((after_kb - before_kb))
        if [ "$delta_kb" -gt 0 ]; then
            reclaimed_kb=$((reclaimed_kb + delta_kb))
            budget_kb=$((budget_kb - delta_kb))
            reclaimed_apps=$((reclaimed_apps + 1))
            fail_count=0
        else
            budget_kb=$((budget_kb - expected_kb))
            fail_count=$((fail_count + 1))
        fi
    done

    if [ "$reclaimed_kb" -gt 0 ]; then
        RECLAIM_FAIL_STREAK=0
        RECLAIM_BLOCKED_UNTIL=0
        LAST_RECLAIM=$now
        RECLAIM_MB=$((reclaimed_kb / 1024))
        RECLAIM_APPS=$reclaimed_apps
        LAST_ACTION=reclaim
        ACTION_THIS_RUN=reclaim
        LAST_REASON=background_anon_reclaim
        read_mm_stat "$ZRAM_BLOCK"
        USAGE_PERCENT=$(zram_usage_percent "$ZRAM_BLOCK")
        COMPRESSED_MB=$(bytes_to_mb "$MM_COMPR")
        MEMORY_USED_MB=$(bytes_to_mb "$MM_USED")
        OVERHEAD_MB=$(positive_difference_mb "$MM_USED" "$MM_COMPR")
    elif [ "$attempt_count" -gt 0 ]; then
        RECLAIM_FAIL_STREAK=$((RECLAIM_FAIL_STREAK + 1))
        if [ "$RECLAIM_FAIL_STREAK" -ge 3 ]; then
            RECLAIM_FAIL_STREAK=0
            RECLAIM_BLOCKED_UNTIL=$((now + 900))
            RECLAIM_CIRCUIT_ACTIVE=1
        fi
    fi
}

perform_proactive_writeback() {
    case "$MEMORY_BACKEND" in erm|hybridswapd) ;; *) return 0 ;; esac
    [ "$ESWAP_AVAILABLE" = "1" ] || return 0
    [ "$battery" -ge "$battery_min" ] || return 0
    awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value <= 0.5 ? 0 : 1 }' || return 0
    if [ "$WRITEBACK_BLOCKED_UNTIL" -gt "$now" ]; then
        WRITEBACK_CIRCUIT_ACTIVE=1
        return 0
    fi
    WRITEBACK_BLOCKED_UNTIL=0
    WRITEBACK_CIRCUIT_ACTIVE=0

    minimum_usage=25
    minimum_adj=600
    writeback_cooldown=600
    cap_pct=80
    daily_multiplier=2
    budget_divisor=2
    if [ "$SCREEN_ON" = "0" ]; then
        cap_pct=90
    fi
    if [ "$MEMORY_BACKEND" = "hybridswapd" ]; then
        writeback_cooldown=300
        daily_multiplier=3
        writeback_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" writeback_thermal_limit_c)" 72)
        if [ "$SCREEN_ON" = "1" ]; then
            minimum_usage=25
            minimum_adj=900
            cap_pct=70
            budget_divisor=10
            awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value <= 0.1 ? 0 : 1 }' || return 0
        else
            minimum_usage=25
            minimum_adj=900
            cap_pct=75
            budget_divisor=10
            writeback_cooldown=900
            awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value <= 0.2 ? 0 : 1 }' || return 0
        fi
    elif [ "$SCREEN_ON" = "1" ]; then
        minimum_usage=40
        writeback_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" writeback_thermal_limit_c)" 70)
        awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value <= 0.2 ? 0 : 1 }' || return 0
    else
        writeback_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" writeback_thermal_limit_c)" 70)
    fi
    writeback_cooldown=$((writeback_cooldown * ADAPTIVE_COOLDOWN_PERCENT / 100))
    minimum_adj=$((minimum_adj + ADAPTIVE_ADJ_BONUS))
    [ "$minimum_adj" -gt 1000 ] && minimum_adj=1000
    [ "$TEMPERATURE_C" -le "$writeback_thermal_limit" ] || return 0
    [ "$USAGE_PERCENT" -ge "$minimum_usage" ] || return 0
    [ $((now - LAST_WRITEBACK)) -ge "$writeback_cooldown" ] || return 0

    total_kb=$(hybridswap_meminfo_kb "$ZRAM_BLOCK" EST)
    used_kb=$(hybridswap_meminfo_kb "$ZRAM_BLOCK" ESU_C)
    daily_kb=$(hybridswap_daily_kb "$ZRAM_BLOCK")
    [ "$total_kb" -gt 0 ] || return 0
    cap_kb=$((total_kb * cap_pct / 100))
    [ "$used_kb" -lt "$cap_kb" ] || return 0
    daily_cap_kb=$((total_kb * daily_multiplier))
    [ "$daily_kb" -lt "$daily_cap_kb" ] || return 0

    remaining_capacity=$((cap_kb - used_kb))
    budget_kb=$remaining_capacity
    max_budget=$((total_kb / budget_divisor))
    max_budget=$((max_budget * WRITEBACK_BUDGET_SCALE_PERCENT / 100))
    [ "$budget_kb" -gt "$max_budget" ] && budget_kb=$max_budget
    remaining_daily=$((daily_cap_kb - daily_kb))
    [ "$budget_kb" -gt "$remaining_daily" ] && budget_kb=$remaining_daily
    [ "$budget_kb" -ge 8192 ] || return 0

    written_kb=0
    writeback_apps=0
    fail_count=0
    attempt_count=0
    tried=
    while [ "$budget_kb" -ge 8192 ] && [ "$fail_count" -lt 3 ]; do
        candidate=$(find_writeback_target 8192 "$minimum_adj" "$tried")
        [ -n "$candidate" ] || break
        set -- $candidate
        group="$1"
        expected_kb="$2"
        [ -n "$group" ] || break
        name=${group##*/}
        tried="$tried,$name"
        attempt_count=$((attempt_count + 1))
        before_kb=$(hybridswap_meminfo_kb "$ZRAM_BLOCK" ESU_C)
        echo 1 > "$group/memory.force_swapout" 2>/dev/null || { fail_count=$((fail_count + 1)); continue; }
        after_kb=$(hybridswap_meminfo_kb "$ZRAM_BLOCK" ESU_C)
        delta_kb=$((after_kb - before_kb))
        if [ "$delta_kb" -gt 0 ]; then
            written_kb=$((written_kb + delta_kb))
            budget_kb=$((budget_kb - delta_kb))
            writeback_apps=$((writeback_apps + 1))
            fail_count=0
        else
            budget_kb=$((budget_kb - expected_kb))
            fail_count=$((fail_count + 1))
        fi
    done

    if [ "$written_kb" -gt 0 ]; then
        WRITEBACK_FAIL_STREAK=0
        WRITEBACK_BLOCKED_UNTIL=0
        LAST_WRITEBACK=$now
        WRITEBACK_MB=$((written_kb / 1024))
        WRITEBACK_APPS=$writeback_apps
        LAST_ACTION=writeback
        ACTION_THIS_RUN=writeback
        LAST_REASON=background_cold_pages
        HYBRID_DAILY_MB=$(kb_to_mb "$(hybridswap_daily_kb "$ZRAM_BLOCK")")
        record_writeback_feedback_sample "$written_kb"
    elif [ "$attempt_count" -gt 0 ]; then
        WRITEBACK_FAIL_STREAK=$((WRITEBACK_FAIL_STREAK + 1))
        if [ "$WRITEBACK_FAIL_STREAK" -ge 3 ]; then
            WRITEBACK_FAIL_STREAK=0
            WRITEBACK_BLOCKED_UNTIL=$((now + 900))
            WRITEBACK_CIRCUIT_ACTIVE=1
        fi
    fi
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
        printf 'hybridswap_used_mb=%s\n' "$HYBRID_USED_MB"
        printf 'hybridswap_capacity_mb=%s\n' "$HYBRID_CAPACITY_MB"
        printf 'eswap_available=%s\n' "$ESWAP_AVAILABLE"
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
        printf 'last_writeback_epoch=%s\n' "$LAST_WRITEBACK"
        printf 'last_reclaim_epoch=%s\n' "$LAST_RECLAIM"
        printf 'recompress_saved_mb=%s\n' "$RECOMPRESS_SAVED_MB"
        printf 'writeback_mb=%s\n' "$WRITEBACK_MB"
        printf 'writeback_apps=%s\n' "$WRITEBACK_APPS"
        printf 'reclaim_mb=%s\n' "$RECLAIM_MB"
        printf 'reclaim_apps=%s\n' "$RECLAIM_APPS"
        printf 'compression_ratio_percent=%s\n' "$COMPRESSION_RATIO_PERCENT"
        printf 'reclaim_budget_scale_percent=%s\n' "$RECLAIM_BUDGET_SCALE_PERCENT"
        printf 'writeback_budget_scale_percent=%s\n' "$WRITEBACK_BUDGET_SCALE_PERCENT"
        printf 'adaptive_feedback_level=%s\n' "$ADAPTIVE_FEEDBACK_LEVEL"
        printf 'last_refault_mb=%s\n' "$LAST_REFAULT_MB"
        printf 'current_reout_kb=%s\n' "$CURRENT_REOUT_KB"
        printf 'current_fault_count=%s\n' "$CURRENT_FAULT_COUNT"
        printf 'current_refault_hits=%s\n' "$CURRENT_REFAULT_HITS"
        printf 'feedback_sample_epoch=%s\n' "$FEEDBACK_SAMPLE_EPOCH"
        printf 'feedback_sample_reout_kb=%s\n' "$FEEDBACK_SAMPLE_REOUT_KB"
        printf 'feedback_sample_fault_count=%s\n' "$FEEDBACK_SAMPLE_FAULT_COUNT"
        printf 'feedback_sample_refault_hits=%s\n' "$FEEDBACK_SAMPLE_REFAULT_HITS"
        printf 'feedback_sample_writeback_kb=%s\n' "$FEEDBACK_SAMPLE_WRITEBACK_KB"
        printf 'feedback_last_adjust_epoch=%s\n' "$FEEDBACK_LAST_ADJUST_EPOCH"
        printf 'writeback_fail_streak=%s\n' "$WRITEBACK_FAIL_STREAK"
        printf 'reclaim_fail_streak=%s\n' "$RECLAIM_FAIL_STREAK"
        printf 'writeback_blocked_until=%s\n' "$WRITEBACK_BLOCKED_UNTIL"
        printf 'reclaim_blocked_until=%s\n' "$RECLAIM_BLOCKED_UNTIL"
        printf 'writeback_circuit_active=%s\n' "$WRITEBACK_CIRCUIT_ACTIVE"
        printf 'reclaim_circuit_active=%s\n' "$RECLAIM_CIRCUIT_ACTIVE"
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
    HYBRID_USED_MB=0
    HYBRID_CAPACITY_MB=0
    ESWAP_AVAILABLE=-1
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
    LAST_WRITEBACK=$(number_or_default "$(get_value "$STATE_FILE" last_writeback_epoch)" 0)
    LAST_RECLAIM=$(number_or_default "$(get_value "$STATE_FILE" last_reclaim_epoch)" 0)
    RECOMPRESS_SAVED_MB=$(number_or_default "$(get_value "$STATE_FILE" recompress_saved_mb)" 0)
    WRITEBACK_MB=$(number_or_default "$(get_value "$STATE_FILE" writeback_mb)" 0)
    WRITEBACK_APPS=$(number_or_default "$(get_value "$STATE_FILE" writeback_apps)" 0)
    RECLAIM_MB=$(number_or_default "$(get_value "$STATE_FILE" reclaim_mb)" 0)
    RECLAIM_APPS=$(number_or_default "$(get_value "$STATE_FILE" reclaim_apps)" 0)
    COMPRESSION_RATIO_PERCENT=0
    RECLAIM_BUDGET_SCALE_PERCENT=100
    WRITEBACK_BUDGET_SCALE_PERCENT=100
    ADAPTIVE_COOLDOWN_PERCENT=100
    ADAPTIVE_ADJ_BONUS=0
    ADAPTIVE_FEEDBACK_LEVEL=$(number_or_default "$(get_value "$STATE_FILE" adaptive_feedback_level)" 0)
    LAST_REFAULT_MB=$(number_or_default "$(get_value "$STATE_FILE" last_refault_mb)" 0)
    CURRENT_REOUT_KB=0
    CURRENT_FAULT_COUNT=0
    CURRENT_REFAULT_HITS=0
    FEEDBACK_SAMPLE_EPOCH=$(number_or_default "$(get_value "$STATE_FILE" feedback_sample_epoch)" 0)
    FEEDBACK_SAMPLE_REOUT_KB=$(number_or_default "$(get_value "$STATE_FILE" feedback_sample_reout_kb)" 0)
    FEEDBACK_SAMPLE_FAULT_COUNT=$(number_or_default "$(get_value "$STATE_FILE" feedback_sample_fault_count)" 0)
    FEEDBACK_SAMPLE_REFAULT_HITS=$(number_or_default "$(get_value "$STATE_FILE" feedback_sample_refault_hits)" 0)
    FEEDBACK_SAMPLE_WRITEBACK_KB=$(number_or_default "$(get_value "$STATE_FILE" feedback_sample_writeback_kb)" 0)
    FEEDBACK_LAST_ADJUST_EPOCH=$(number_or_default "$(get_value "$STATE_FILE" feedback_last_adjust_epoch)" 0)
    WRITEBACK_FAIL_STREAK=$(number_or_default "$(get_value "$STATE_FILE" writeback_fail_streak)" 0)
    RECLAIM_FAIL_STREAK=$(number_or_default "$(get_value "$STATE_FILE" reclaim_fail_streak)" 0)
    WRITEBACK_BLOCKED_UNTIL=$(number_or_default "$(get_value "$STATE_FILE" writeback_blocked_until)" 0)
    RECLAIM_BLOCKED_UNTIL=$(number_or_default "$(get_value "$STATE_FILE" reclaim_blocked_until)" 0)
    WRITEBACK_CIRCUIT_ACTIVE=0
    RECLAIM_CIRCUIT_ACTIVE=0
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
    HYBRID_USED_MB=$(kb_to_mb "$(hybridswap_meminfo_kb "$ZRAM_BLOCK" ESU_C)")
    HYBRID_CAPACITY_MB=$(kb_to_mb "$(hybridswap_meminfo_kb "$ZRAM_BLOCK" EST)")
    ESWAP_AVAILABLE=$(check_eswap_usable "$ZRAM_BLOCK")
    read_mm_stat "$ZRAM_BLOCK"
    USAGE_PERCENT=$(zram_usage_percent "$ZRAM_BLOCK")
    COMPRESSED_MB=$(bytes_to_mb "$MM_COMPR")
    MEMORY_USED_MB=$(bytes_to_mb "$MM_USED")
    OVERHEAD_MB=$(positive_difference_mb "$MM_USED" "$MM_COMPR")
    COMPRESSION_RATIO_PERCENT=$(compression_ratio_percent "$MM_ORIG" "$MM_COMPR")

    apply_memory_profile "$ZRAM_BLOCK"

    critical=0
    awk -v value="$PRESSURE_AVG10" 'BEGIN { exit value >= 1.0 ? 0 : 1 }' && critical=1
    [ "$USAGE_PERCENT" -ge 75 ] && critical=1
    pause_node="/sys/block/$ZRAM_BLOCK/hybridswap_swapd_pause"
    if [ -w "$pause_node" ]; then
        if [ "$MEMORY_BACKEND" = "erm" ] || [ "$MEMORY_BACKEND" = "hybridswapd" ]; then
            desired_pause=0
        elif [ "$ESWAP_AVAILABLE" = "0" ]; then
            desired_pause=1
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
    if [ "$WRITEBACK_BLOCKED_UNTIL" -gt "$now" ]; then
        WRITEBACK_CIRCUIT_ACTIVE=1
    else
        WRITEBACK_BLOCKED_UNTIL=0
    fi
    if [ "$RECLAIM_BLOCKED_UNTIL" -gt "$now" ]; then
        RECLAIM_CIRCUIT_ACTIVE=1
    else
        RECLAIM_BLOCKED_UNTIL=0
    fi
    update_adaptive_feedback
    base_interval=$(number_or_default "$(get_value "$CONFIG_FILE" interval_seconds)" 30)
    if [ "$SCREEN_ON" = "1" ]; then
        if [ "$ACTION_THIS_RUN" != "none" ]; then
            interval=$base_interval
        else
            screen_idle_interval=$(number_or_default "$(get_value "$CONFIG_FILE" screen_idle_interval_seconds)" 45)
            interval=$screen_idle_interval
        fi
    else
        if [ "$ACTION_THIS_RUN" != "none" ]; then
            interval=$base_interval
        else
            idle_interval=$(number_or_default "$(get_value "$CONFIG_FILE" idle_interval_seconds)" 90)
            interval=$idle_interval
        fi
    fi
    idle_age=$(number_or_default "$(get_value "$CONFIG_FILE" idle_age_seconds)" 600)
    recompress_usage=$(number_or_default "$(get_value "$CONFIG_FILE" recompress_usage_percent)" 70)
    recompress_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" recompress_cooldown_seconds)" 1800)
    compact_cooldown=$(number_or_default "$(get_value "$CONFIG_FILE" compact_cooldown_seconds)" 1800)
    compact_overhead_mb=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_mb)" 256)
    compact_overhead_percent=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_percent)" 12)
    thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" thermal_limit_c)" 48)
    compact_thermal_limit=$(number_or_default "$(get_value "$CONFIG_FILE" compact_thermal_limit_c)" 55)
    battery_min=$(number_or_default "$(get_value "$CONFIG_FILE" battery_min_percent)" 20)
    battery=$(battery_percent)
    charging=$(is_charging)
    overhead_percent=$(percentage_difference "$MM_USED" "$MM_COMPR")

    if [ "$SCREEN_ON" = "0" ] && [ "$USAGE_PERCENT" -ge "$recompress_usage" ] && [ "$TEMPERATURE_C" -le "$thermal_limit" ] && { [ "$battery" -ge "$battery_min" ] || [ "$charging" = "1" ]; }; then
        if [ $((now - LAST_RECOMPRESS)) -ge "$recompress_cooldown" ] && [ -w "/sys/block/$ZRAM_BLOCK/idle" ] && [ -w "/sys/block/$ZRAM_BLOCK/recompress" ]; then
            before_used=$MM_USED
            if echo "$idle_age" > "/sys/block/$ZRAM_BLOCK/idle" 2>/dev/null && timeout 60 sh -c "echo 'type=idle' > /sys/block/$ZRAM_BLOCK/recompress" 2>/dev/null; then
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
        if [ "$MEMORY_BACKEND" = "hybridswapd" ]; then
            LAST_REASON=hybridswap_adaptive
        else
            LAST_REASON=screen_on
        fi
    elif [ "$USAGE_PERCENT" -lt "$recompress_usage" ]; then
        LAST_REASON=low_usage
    elif [ "$TEMPERATURE_C" -gt "$thermal_limit" ]; then
        LAST_REASON=high_temperature
    else
        LAST_REASON=low_battery
    fi

    compact_screen_on=0
    compact_threshold_mb=$compact_overhead_mb
    compact_threshold_pct=$compact_overhead_percent
    compact_cd=$compact_cooldown
    if [ "$MEMORY_BACKEND" = "hybridswapd" ]; then
        compact_screen_on=1
        compact_threshold_mb=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_mb_screenon)" 128)
        compact_threshold_pct=$(number_or_default "$(get_value "$CONFIG_FILE" compact_overhead_percent_screenon)" 8)
        compact_cd=$(number_or_default "$(get_value "$CONFIG_FILE" compact_cooldown_seconds_screenon)" 900)
    fi
    compact_can_run=0
    if [ "$SCREEN_ON" = "0" ]; then
        [ "$ACTION_THIS_RUN" != "recompress" ] && [ "$TEMPERATURE_C" -le "$compact_thermal_limit" ] && { [ "$battery" -ge "$battery_min" ] || [ "$charging" = "1" ]; } && [ $((now - LAST_COMPACT)) -ge "$compact_cd" ] && compact_can_run=1
    elif [ "$compact_screen_on" = "1" ]; then
        [ "$ACTION_THIS_RUN" = "none" ] && [ "$PRESSURE_AVG10" != "" ] && awk -v v="$PRESSURE_AVG10" 'BEGIN{exit v<0.3?0:1}' && [ "$TEMPERATURE_C" -le "$compact_thermal_limit" ] && [ $((now - LAST_COMPACT)) -ge "$compact_cd" ] && compact_can_run=1
    fi
    if [ "$compact_can_run" = "1" ] && [ -w "/sys/block/$ZRAM_BLOCK/compact" ]; then
        if [ "$OVERHEAD_MB" -ge "$compact_threshold_mb" ] && [ "$overhead_percent" -ge "$compact_threshold_pct" ]; then
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

    [ "$ACTION_THIS_RUN" = "none" ] && perform_proactive_writeback
    [ "$ACTION_THIS_RUN" = "none" ] && perform_hybridswapd_reclaim
    HYBRID_USED_MB=$(kb_to_mb "$(hybridswap_meminfo_kb "$ZRAM_BLOCK" ESU_C)")
    HYBRID_CAPACITY_MB=$(kb_to_mb "$(hybridswap_meminfo_kb "$ZRAM_BLOCK" EST)")
    [ "$ESWAP_AVAILABLE" = "-1" ] && ESWAP_AVAILABLE=$(check_eswap_usable "$ZRAM_BLOCK")

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
    pids=$({ cat "$PID_FILE" 2>/dev/null; find_daemon_pids; } | sort -u)
    for pid in $pids; do
        pid_is_daemon "$pid" || continue
        kill -TERM "$pid" 2>/dev/null
    done
    for pid in $pids; do
        pid_is_daemon "$pid" || continue
        count=0
        while [ -d "/proc/$pid" ] && [ "$count" -lt 30 ]; do
            sleep 0.1
            count=$((count + 1))
        done
        pid_is_daemon "$pid" && kill -KILL "$pid" 2>/dev/null
    done
    rm -f "$PID_FILE"
    restore_baseline
    rm -f "$STATE_FILE" "$ESWAP_CACHE_FILE"
}

start_daemon() {
    policy_enabled || return 0
    pid=$(cat "$PID_FILE" 2>/dev/null)
    pid_is_daemon "$pid" && { kill -HUP "$pid" 2>/dev/null; return 0; }
    for pid in $(find_daemon_pids); do
        pid_is_daemon "$pid" || continue
        echo "$pid" > "$PID_FILE"
        kill -HUP "$pid" 2>/dev/null
        return 0
    done
    if command -v setsid >/dev/null 2>&1; then
        nohup setsid -d /system/bin/sh "$0" daemon </dev/null >/dev/null 2>&1 &
    else
        nohup /system/bin/sh "$0" daemon </dev/null >/dev/null 2>&1 &
    fi
}

print_status() {
    actual_running=0
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if ! pid_is_daemon "$pid"; then
        pid=
        rm -f "$PID_FILE"
    fi
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
