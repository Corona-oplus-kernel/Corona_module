#!/system/bin/sh
MODDIR=${0%/*}
CONFIG_DIR=${CORONA_CONFIG_DIR:-"$MODDIR/config"}
RUNTIME_CONF="$CONFIG_DIR/runtime.conf"
SCRIPTS_DIR="$MODDIR/scripts.d"
APP_POLICY_SH="$MODDIR/app_policy.sh"
CORONAD="$MODDIR/bin/coronad"
THREAD_PRIORITY_FILE="$CONFIG_DIR/thread_priority.conf"
WRITEBACK_HELPER="$MODDIR/scripts/zram-writeback.sh"

BRAND=$(getprop ro.product.brand | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(getprop ro.product.manufacturer | tr '[:upper:]' '[:lower:]')
if [ "$BRAND" != "oneplus" ] && [ "$MANUFACTURER" != "oneplus" ] && [ "$BRAND" != "oplus" ] && [ "$MANUFACTURER" != "oplus" ]; then
    exit 0
fi

set_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null; }
lock_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null && chmod 444 "$2" 2>/dev/null; }
get_conf_value() { [ -f "$1" ] && grep -m1 "^$2=" "$1" | cut -d'=' -f2-; }

get_loop_mode() (
    loop_conf="$CONFIG_DIR/loop.conf"
    if [ -f "$loop_conf" ]; then
        [ "$(get_conf_value "$loop_conf" enabled)" = "1" ] && echo true || echo false
        return
    fi
    get_conf_value "$CONFIG_DIR/zram.conf" zram_writeback
)

get_loop_size_mb() (
    loop_conf="$CONFIG_DIR/loop.conf"
    if [ -f "$loop_conf" ]; then
        value=$(get_conf_value "$loop_conf" size_mb)
    else
        value=$(get_conf_value "$CONFIG_DIR/zram.conf" writeback_size_mb)
    fi
    case "$value" in ''|*[!0-9]*) value=4096 ;; esac
    echo "$value"
)

get_managed_loop_device() {
    state=/data/nandswap/corona_loop_device
    device=$(cat "$state" 2>/dev/null | tr -d ' \r\n')
    [ -n "$device" ] || return 1
    /system/bin/losetup "$device" 2>/dev/null | grep -Fq /data/nandswap/corona_swapfile || return 1
    printf '%s\n' "$device"
}

wait_until_boot_complete() { until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 5; done; }
wait_until_login() { until [ -d "/data/data/android" ]; do sleep 5; done; }
has_mm_sys_entry() { [ -f /odm/etc/init.oplus.mm-sys.sh ]; }
get_active_zram_dev() {
    awk 'NR > 1 && ($1 ~ /^\/dev\/block\/zram/ || $1 ~ /^\/dev\/zram/) { print $1; exit }' /proc/swaps 2>/dev/null
}

get_active_zram_block() {
    dev=$(get_active_zram_dev)
    [ -n "$dev" ] || return 1
    dev=${dev#/dev/block/}
    dev=${dev#/dev/}
    [ -d "/sys/block/$dev" ] || return 1
    echo "$dev"
}

get_active_zram_algorithm() {
    block=$(get_active_zram_block) || return 1
    raw=$(cat "/sys/block/$block/comp_algorithm" 2>/dev/null)
    active=$(echo "$raw" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
    [ -n "$active" ] && {
        echo "$active"
        return 0
    }
    echo "$raw" | awk '{print $1}'
}

get_oplus_vm_swappiness() {
    for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do
        [ -r "$node" ] || continue
        value=$(awk -F': *' '/^vm_swappiness:/ { print $2; exit }' "$node" 2>/dev/null)
        [ -n "$value" ] && {
            echo "$value"
            return 0
        }
    done
    return 1
}

write_zram_swappiness() {
    value="$1"
    direct_value="$2"
    [ -n "$value" ] || return 0
    spt_dir=/sys/module/swappiness_pressure_throttle/parameters
    [ -n "$value" ] && [ -f "$spt_dir/swappiness_idle" ] && echo "$value" > "$spt_dir/swappiness_idle" 2>/dev/null
    for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do
        [ -w "$node" ] || continue
        [ -n "$direct_value" ] && echo "direct_swappiness=${direct_value}" > "$node" 2>/dev/null
        [ -n "$value" ] && echo "vm_swappiness=${value}" > "$node" 2>/dev/null
        break
    done
    [ -n "$value" ] || return
    [ -f /proc/sys/vm/swappiness ] && echo "$value" > /proc/sys/vm/swappiness 2>/dev/null
    [ -f /dev/memcg/memory.swappiness ] && echo "$value" > /dev/memcg/memory.swappiness 2>/dev/null
    [ -f /dev/memcg/apps/memory.swappiness ] && echo "$value" > /dev/memcg/apps/memory.swappiness 2>/dev/null
    [ -f /sys/module/zram_opt/parameters/vm_swappiness ] && echo "$value" > /sys/module/zram_opt/parameters/vm_swappiness 2>/dev/null
}

zram_config_needs_overlay() {
    conf="$CONFIG_DIR/zram.conf"
    [ -f "$conf" ] || return 1
    [ "$(get_conf_value "$conf" enabled)" = "1" ] || return 1

    dev=$(get_active_zram_dev)
    [ -n "$dev" ] || return 0
    block=$(get_active_zram_block) || return 0

    if grep -q '^size=' "$conf"; then
        want=$(get_conf_value "$conf" size)
        now=$(cat "/sys/block/$block/disksize" 2>/dev/null | tr -d ' \n')
        [ -n "$want" ] && [ "$want" != "$now" ] && return 0
    fi

    if grep -q '^algorithm=' "$conf"; then
        want=$(get_conf_value "$conf" algorithm)
        now=$(get_active_zram_algorithm 2>/dev/null)
        [ -n "$want" ] && [ "$want" != "$now" ] && [ "kernel:$want" != "$now" ] && return 0
    fi

    if grep -q '^swappiness=' "$conf"; then
        want=$(get_conf_value "$conf" swappiness)
        now_vm=$(cat /proc/sys/vm/swappiness 2>/dev/null | tr -d ' \n')
        now_apps=$(cat /dev/memcg/apps/memory.swappiness 2>/dev/null | tr -d ' \n')
        now_oplus=$(get_oplus_vm_swappiness 2>/dev/null)
        [ -n "$want" ] && { [ "$want" != "$now_vm" ] || [ "$want" != "$now_apps" ] || { [ -n "$now_oplus" ] && [ "$want" != "$now_oplus" ]; }; } && return 0
    fi

    if grep -q '^direct_swappiness=' "$conf"; then
        want=$(get_conf_value "$conf" direct_swappiness)
        now=$(for node in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do [ -r "$node" ] || continue; awk -F': *' '/^direct_swappiness:/ { print $2; exit }' "$node"; break; done)
        [ -n "$want" ] && [ -n "$now" ] && [ "$want" != "$now" ] && return 0
    fi

    if grep -q '^zram_used_limit_mb=' "$conf" && [ -r /dev/memcg/memory.zram_used_limit_mb ]; then
        want=$(get_conf_value "$conf" zram_used_limit_mb)
        now=$(cat /dev/memcg/memory.zram_used_limit_mb 2>/dev/null | tr -d ' \n')
        [ -n "$want" ] && [ "$want" != "$now" ] && return 0
    fi

    for key in hybridswap_zram_increase hybridswap_quota_day; do
        grep -q "^${key}=" "$conf" || continue
        [ -r "/sys/block/$block/$key" ] || continue
        want=$(get_conf_value "$conf" "$key")
        now=$(cat "/sys/block/$block/$key" 2>/dev/null | tr -d ' \n')
        [ -n "$want" ] && [ "$want" != "$now" ] && return 0
    done

    return 1
}

get_zram_apply_helper() {
    [ -f "$MODDIR/scripts/apply-zram.sh" ] && { echo "$MODDIR/scripts/apply-zram.sh"; return 0; }
    return 1
}

should_trigger_official_nandswap() {
    [ -f "$CONFIG_DIR/zram.conf" ] || return 1
    [ "$(get_conf_value "$CONFIG_DIR/zram.conf" enabled)" = "1" ] || return 1
    zram_config_needs_overlay && return 0
    return 1
}

trigger_official_nandswap_once() {
    should_trigger_official_nandswap || return 0
    helper=$(get_zram_apply_helper)
    [ -n "$helper" ] && /system/bin/sh "$helper" >/dev/null 2>&1
}

apply_writeback_block_config() {
    [ -f "$CONFIG_DIR/loop.conf" ] || return 0
    helper="$MODDIR/scripts/apply-loop.sh"
    [ -x "$helper" ] || return 1
    /system/bin/sh "$helper" apply >/dev/null 2>&1
}

get_system_info() {
    mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    sdk_version=$(getprop ro.build.version.sdk)
    kernel_version=$(uname -r | cut -d'-' -f1)
    kernel_version1=$(echo "$kernel_version" | cut -d'.' -f1)
    is_oplus=0; find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | grep -q . && is_oplus=1
    isCoronaKernel=0
    corona_node_value="$(cat /proc/corona 2>/dev/null)"
    case "$corona_node_value" in
        ''|*[!0-9]*) ;;
        *) [ "$corona_node_value" -gt 0 ] && isCoronaKernel=1 ;;
    esac
}

apply_io_config() {
    [ ! -f "$CONFIG_DIR/io_scheduler.conf" ] && return
    io_conf="$CONFIG_DIR/io_scheduler.conf"
    enabled=$(get_conf_value "$io_conf" enabled)
    [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
    scheduler=$(get_conf_value "$io_conf" scheduler)
    readahead=$(get_conf_value "$io_conf" readahead)
    nr_requests=$(get_conf_value "$io_conf" nr_requests)
    rq_affinity=$(get_conf_value "$io_conf" rq_affinity)
    nomerges=$(get_conf_value "$io_conf" nomerges)
    iostats=$(get_conf_value "$io_conf" iostats)
    [ "$isCoronaKernel" = "1" ] && [ -n "$scheduler" ] && scheduler="kernel:$scheduler"
    for queue_dir in /sys/block/*/queue; do
        [ -d "$queue_dir" ] || continue
        case "${queue_dir%/queue}" in
            /sys/block/loop*|/sys/block/ram*|/sys/block/zram*|/sys/block/dm-*) continue ;;
        esac
        [ -n "$scheduler" ] && [ -f "$queue_dir/scheduler" ] && echo "$scheduler" > "$queue_dir/scheduler" 2>/dev/null
        [ -n "$readahead" ] && [ -f "$queue_dir/read_ahead_kb" ] && echo "$readahead" > "$queue_dir/read_ahead_kb" 2>/dev/null
        [ -n "$nr_requests" ] && [ -f "$queue_dir/nr_requests" ] && echo "$nr_requests" > "$queue_dir/nr_requests" 2>/dev/null
        [ -n "$rq_affinity" ] && [ -f "$queue_dir/rq_affinity" ] && echo "$rq_affinity" > "$queue_dir/rq_affinity" 2>/dev/null
        [ -n "$nomerges" ] && [ -f "$queue_dir/nomerges" ] && echo "$nomerges" > "$queue_dir/nomerges" 2>/dev/null
        [ -n "$iostats" ] && [ -f "$queue_dir/iostats" ] && echo "$iostats" > "$queue_dir/iostats" 2>/dev/null
    done
}

apply_cpu_governor_config() {
    [ ! -f "$CONFIG_DIR/cpu_governor.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/cpu_governor.conf" enabled)
    [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
    governor=$(grep "^governor=" "$CONFIG_DIR/cpu_governor.conf" | cut -d'=' -f2)
    [ -n "$governor" ] && for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "$governor" > "$f" 2>/dev/null; done
}

apply_cpu_hotplug_config() {
    [ ! -f "$CONFIG_DIR/cpu_hotplug.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/cpu_governor.conf" enabled)
    [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
    while IFS='=' read -r cpu state; do
        [ -n "$cpu" ] && [ -n "$state" ] && {
            cpu_num=$(echo "$cpu" | sed 's/cpu//')
            [ "$cpu_num" != "0" ] && echo "$state" > "/sys/devices/system/cpu/$cpu/online" 2>/dev/null
        }
    done < "$CONFIG_DIR/cpu_hotplug.conf"
}

apply_tcp_config() {
    [ ! -f "$CONFIG_DIR/tcp.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/tcp.conf" enabled)
    [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
    congestion=$(grep "^congestion=" "$CONFIG_DIR/tcp.conf" | cut -d'=' -f2)
    [ -n "$congestion" ] && echo "$congestion" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null
}

apply_process_priority_config() {
    [ ! -f "$CONFIG_DIR/process_priority.conf" ] && return
    while IFS='=' read -r process_name values; do
        [ -n "$process_name" ] && [ -n "$values" ] && {
            nice_val=$(echo "$values" | cut -d',' -f1)
            io_class=$(echo "$values" | cut -d',' -f2)
            io_level=$(echo "$values" | cut -d',' -f3)
            pids=$(pgrep -f "$process_name" 2>/dev/null)
            [ -z "$pids" ] && pids=$(for d in /proc/[0-9]*; do
                [ -r "$d/cmdline" ] || continue
                cmdline=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
                case "$cmdline" in *"$process_name"*) basename "$d";; esac
            done)
            for pid in $pids; do
                renice -n "$nice_val" -p "$pid" 2>/dev/null
                ionice -c "$io_class" -n "$io_level" -p "$pid" 2>/dev/null
            done
        }
    done < "$CONFIG_DIR/process_priority.conf"
}

package_pids_for_name() {
    target="$1"
    for d in /proc/[0-9]*; do
        [ -r "$d/cmdline" ] || continue
        cmdline=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
        case "$cmdline" in
            "$target"*|*" $target"*|*"$target:"*|*"$target/"*) basename "$d" ;;
        esac
    done | sort -u
}

thread_name_matches() {
    thread_name="$1"
    thread_pattern="$2"
    case "$thread_pattern" in
        *'*'*|*'?'*|*'['*) case "$thread_name" in $thread_pattern) return 0 ;; esac ;;
        *) [ "$thread_name" = "$thread_pattern" ] && return 0 ;;
    esac
    return 1
}

normalize_affinity_mask() {
    affinity_value="$1"
    [ -n "$affinity_value" ] || return 1
    case "$affinity_value" in
        *-*|*,*)
            result=0
            old_ifs="$IFS"
            IFS=','
            set -- $affinity_value
            IFS="$old_ifs"
            for part in "$@"; do
                case "$part" in
                    *-*)
                        start=${part%-*}
                        end=${part#*-}
                        ;;
                    *)
                        start=$part
                        end=$part
                        ;;
                esac
                [ -n "$start" ] && [ -n "$end" ] || return 1
                i=$start
                while [ "$i" -le "$end" ] 2>/dev/null; do
                    result=$((result | (1 << i)))
                    i=$((i + 1))
                done
            done
            printf '%x\n' "$result"
            return 0
            ;;
        0x*|0X*)
            printf '%s\n' "${affinity_value#0x}"
            return 0
            ;;
        *[a-fA-F]*)
            printf '%s\n' "$affinity_value"
            return 0
            ;;
        *)
            printf '%x\n' $((1 << affinity_value))
            return 0
            ;;
    esac
}

get_task_nice() {
    tid="$1"
    awk '{print $19}' "/proc/$tid/stat" 2>/dev/null
}

set_task_nice_absolute() {
    tid="$1"
    target_nice="$2"
    [ -n "$target_nice" ] || return 1
    current_nice=$(get_task_nice "$tid")
    [ -n "$current_nice" ] || return 1
    delta=$((target_nice - current_nice))
    [ "$delta" -eq 0 ] 2>/dev/null && return 0
    renice -n "$delta" -p "$tid" 2>/dev/null
}

apply_sched_policy_to_tid() {
    tid="$1"
    sched_policy="$2"
    rt_prio="$3"
    case "$sched_policy" in
        ''|other|normal)
            chrt -o -p "$tid" 0 2>/dev/null ;;
        batch)
            chrt -b -p "$tid" 0 2>/dev/null ;;
        idle)
            chrt -i -p "$tid" 0 2>/dev/null ;;
        fifo)
            [ -n "$rt_prio" ] || rt_prio=1
            chrt -f -p "$tid" "$rt_prio" 2>/dev/null ;;
        rr)
            [ -n "$rt_prio" ] || rt_prio=1
            chrt -r -p "$tid" "$rt_prio" 2>/dev/null ;;
    esac
}

apply_cpuset_to_tid() {
    tid="$1"
    cpuset_group="$2"
    [ -n "$cpuset_group" ] || return 0
    tasks_file="/dev/cpuset/$cpuset_group/tasks"
    [ -f "$tasks_file" ] || return 0
    echo "$tid" > "$tasks_file" 2>/dev/null
}

apply_uclamp_to_tid() {
    tid="$1"
    uclamp_min="$2"
    uclamp_max="$3"
    cpuctl_group="$4"
    if [ -w /proc/oplus_qos_sched/qos_task_uclamp ] && { [ -n "$uclamp_min" ] || [ -n "$uclamp_max" ]; }; then
        min_val=${uclamp_min:-0}
        max_val=${uclamp_max:-1024}
        printf '%s %s %s
' "$tid" "$min_val" "$max_val" > /proc/oplus_qos_sched/qos_task_uclamp 2>/dev/null && return 0
    fi
    [ -n "$cpuctl_group" ] || return 0
    tasks_file="/dev/cpuctl/$cpuctl_group/tasks"
    min_file="/dev/cpuctl/$cpuctl_group/cpu.uclamp.min"
    max_file="/dev/cpuctl/$cpuctl_group/cpu.uclamp.max"
    [ -f "$tasks_file" ] || return 0
    [ -n "$uclamp_min" ] && [ -f "$min_file" ] && echo "$uclamp_min" > "$min_file" 2>/dev/null
    [ -n "$uclamp_max" ] && [ -f "$max_file" ] && echo "$uclamp_max" > "$max_file" 2>/dev/null
    echo "$tid" > "$tasks_file" 2>/dev/null
}

set_walt_knob() {
    path="$1"
    value="$2"
    [ -n "$value" ] || return 0
    [ -f "$path" ] || return 0
    echo "$value" > "$path" 2>/dev/null
}

apply_thread_walt_hints() {
    enable_per_task_boost="$1"
    enable_pipeline_special="$2"
    disable_reduce_affinity="$3"
    [ "$enable_per_task_boost" = "1" ] && set_walt_knob /proc/sys/walt/sched_per_task_boost 1
    [ "$enable_pipeline_special" = "1" ] && set_walt_knob /proc/sys/walt/sched_pipeline_special 1
    [ "$disable_reduce_affinity" = "1" ] && set_walt_knob /proc/sys/walt/task_reduce_affinity 0
}

apply_thread_priority_config() {
    [ ! -f "$THREAD_PRIORITY_FILE" ] && return
    walt_per_task_boost=0
    walt_pipeline_special=0
    walt_reduce_affinity=0
    while IFS='=' read -r target values; do
        case "$target" in ''|'#'*) continue ;; esac
        [ -n "$values" ] || continue
        package_name=$(printf '%s' "$target" | cut -d'|' -f1)
        thread_pattern=$(printf '%s' "$target" | cut -d'|' -f2-)
        [ -n "$package_name" ] && [ -n "$thread_pattern" ] || continue
        IFS='|' read -r nice_val io_class io_level affinity_mask sched_policy rt_prio cpuset_group walt_boost walt_pipeline uclamp_min uclamp_max <<EOF
$values
EOF
        [ "$walt_boost" = "1" ] && walt_per_task_boost=1 && walt_reduce_affinity=1
        [ "$walt_pipeline" = "1" ] && walt_pipeline_special=1
        for pid in $(package_pids_for_name "$package_name"); do
            [ -d "/proc/$pid/task" ] || continue
            for task_dir in /proc/$pid/task/[0-9]*; do
                [ -r "$task_dir/comm" ] || continue
                tid=${task_dir##*/}
                thread_name=$(cat "$task_dir/comm" 2>/dev/null)
                thread_name_matches "$thread_name" "$thread_pattern" || continue
                [ -n "$nice_val" ] && set_task_nice_absolute "$tid" "$nice_val"
                if [ -n "$io_class" ] && [ -n "$io_level" ]; then
                    ionice -c "$io_class" -n "$io_level" -p "$tid" 2>/dev/null
                fi
                                if [ -n "$affinity_mask" ]; then
                    affinity_hex=$(normalize_affinity_mask "$affinity_mask")
                    [ -n "$affinity_hex" ] && taskset -p "$affinity_hex" "$tid" >/dev/null 2>&1
                fi
                apply_cpuset_to_tid "$tid" "$cpuset_group"
                apply_uclamp_to_tid "$tid" "$uclamp_min" "$uclamp_max" "$cpuset_group"
                apply_sched_policy_to_tid "$tid" "$sched_policy" "$rt_prio"
            done
        done
    done < "$THREAD_PRIORITY_FILE"
    apply_thread_walt_hints "$walt_per_task_boost" "$walt_pipeline_special" "$walt_reduce_affinity"
}

apply_device_config() {
    [ ! -f "$CONFIG_DIR/device.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/device.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    device_config set_sync_disabled_for_tests until_reboot 2>/dev/null
    device_config put activity_manager max_cached_processes 32768 2>/dev/null
    device_config put activity_manager max_phantom_processes 32768 2>/dev/null
    device_config put activity_manager use_compaction false 2>/dev/null
    settings put global settings_enable_monitor_phantom_procs false 2>/dev/null
}

apply_protect_config() {
    [ ! -f "$CONFIG_DIR/protect.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/protect.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    [ -d /dev/memcg/system ] && [ "$mem_total_kb" -gt 8388608 ] && {
        mkdir -p /dev/memcg/system/active_fg
        echo 0 > /dev/memcg/system/active_fg/memory.swappiness 2>/dev/null
        echo 1 > /dev/memcg/system/active_fg/memory.use_hierarchy 2>/dev/null
        for app in com.android.systemui com.android.launcher surfaceflinger system_server; do
            pid=$(pidof $app 2>/dev/null | head -n1)
            [ -n "$pid" ] && echo "$pid" > /dev/memcg/system/active_fg/cgroup.procs 2>/dev/null
        done
    }
    [ -x "$APP_POLICY_SH" ] && CORONA_CONFIG_DIR="$MODDIR/config" sh "$APP_POLICY_SH" protect-once >/dev/null 2>&1
}

apply_fstrim_config() {
    [ ! -f "$CONFIG_DIR/fstrim.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/fstrim.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    busybox=/data/adb/magisk/busybox
    [ -f /data/adb/ksu/bin/busybox ] && busybox=/data/adb/ksu/bin/busybox
    [ -f /data/adb/ap/bin/busybox ] && busybox=/data/adb/ap/bin/busybox
    [ -f "$busybox" ] && { sm fstrim 2>/dev/null; $busybox fstrim /data 2>/dev/null; }
}

normalize_zram_path() {
    requested_path="$1"
    if [ -n "$requested_path" ] && [ -e "$requested_path" ]; then
        echo "$requested_path"
        return 0
    fi
    for candidate in /dev/block/zram* /dev/zram*; do
        [ -e "$candidate" ] || continue
        echo "$candidate"
        return 0
    done
    return 1
}

get_zram_block() {
    zram_block="$1"
    zram_block=${zram_block#/dev/block/}
    zram_block=${zram_block#/dev/}
    [ -n "$zram_block" ] && [ -d "/sys/block/$zram_block" ] || return 1
    echo "$zram_block"
}

get_swap_priority() {
    awk -v dev="$1" 'NR > 1 && $1 == dev { print $5; exit }' /proc/swaps 2>/dev/null
}

get_active_zram_algorithm() {
    zram_block="$1"
    alg_raw=$(cat "/sys/block/$zram_block/comp_algorithm" 2>/dev/null)
    active=$(echo "$alg_raw" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
    [ -n "$active" ] && { echo "$active"; return; }
    echo "$alg_raw" | awk '{print $1}'
}

select_supported_zram_algorithm() {
    zram_block="$1"
    requested=${2#kernel:}
    available=$(cat "/sys/block/$zram_block/comp_algorithm" 2>/dev/null | tr -d '[]')
    for algo in $available; do
        [ "$algo" = "$requested" ] && { echo "$requested"; return 0; }
    done
    for requested in lz4 lzo-rle lzo zstd; do
        for algo in $available; do
            [ "$algo" = "$requested" ] && { echo "$requested"; return 0; }
        done
    done
    echo "$available" | awk '{print $1}'
}

set_zram_config_value() {
    key="$1"
    value="$2"
    conf="$CONFIG_DIR/zram.conf"
    [ -f "$conf" ] || return 0
    if grep -q "^${key}=" "$conf" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$conf" 2>/dev/null
    else
        echo "${key}=${value}" >> "$conf"
    fi
}

apply_zram_primary_algorithm() {
    zram_block="$1"
    requested=${2#kernel:}
    selected=$(select_supported_zram_algorithm "$zram_block" "$requested")
    [ -n "$selected" ] || return 1
    echo "$selected" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null || return 1
    active=$(get_active_zram_algorithm "$zram_block")
    active=${active#kernel:}
    if [ -z "$active" ] || [ "$active" != "$selected" ]; then
        selected=$(select_supported_zram_algorithm "$zram_block" lz4)
        [ -n "$selected" ] || return 1
        echo "$selected" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null || return 1
        active=$(get_active_zram_algorithm "$zram_block")
        active=${active#kernel:}
    fi
    [ -n "$active" ] || return 1
    [ "$active" = "$requested" ] || set_zram_config_value algorithm "$active"
    echo "$active"
}



apply_zstd_compression_level() {
    conf="$CONFIG_DIR/zram.conf"
    [ -f /sys/module/zstd/parameters/compression_level ] || return 0
    [ -f "$conf" ] || return 0
    level=$(get_conf_value "$conf" zstd_compression_level)
    [ -n "$level" ] || return 0
    echo "$level" > /sys/module/zstd/parameters/compression_level 2>/dev/null || return 1
}

apply_zram_recomp_algorithms() {
    zram_block="$1"
    conf="$CONFIG_DIR/zram.conf"
    [ -f "/sys/block/$zram_block/recomp_algorithm" ] || return 0
    [ -f "$conf" ] || return 0
    i=1
    while [ "$i" -le 3 ]; do
        algo=$(get_conf_value "$conf" "recomp_algorithm$i")
        if [ -n "$algo" ] && [ "$algo" != "none" ]; then
            echo "algo=$algo priority=$i" > "/sys/block/$zram_block/recomp_algorithm" 2>/dev/null || return 1
        fi
        i=$((i + 1))
    done
}

apply_zram_config() {
    [ ! -f "$CONFIG_DIR/zram.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/zram.conf" enabled)
    [ "$enabled" != "1" ] && return
    algorithm=$(get_conf_value "$CONFIG_DIR/zram.conf" algorithm)
    size=$(get_conf_value "$CONFIG_DIR/zram.conf" size)
    swappiness=$(get_conf_value "$CONFIG_DIR/zram.conf" swappiness)
    direct_swappiness=$(get_conf_value "$CONFIG_DIR/zram.conf" direct_swappiness)
    zram_used_limit_mb=$(get_conf_value "$CONFIG_DIR/zram.conf" zram_used_limit_mb)
    hybridswap_zram_increase=$(get_conf_value "$CONFIG_DIR/zram.conf" hybridswap_zram_increase)
    hybridswap_quota_day=$(get_conf_value "$CONFIG_DIR/zram.conf" hybridswap_quota_day)
    zram_priority=$(get_conf_value "$CONFIG_DIR/zram.conf" priority)
    [ -n "$zram_priority" ] || zram_priority=32758
    zram_writeback=$(get_loop_mode)
    writeback_size_mb=$(get_loop_size_mb)
    zram_path=$(get_conf_value "$CONFIG_DIR/zram.conf" zram_path)
    zram_path=$(normalize_zram_path "$zram_path") || return
    zram_block=$(get_zram_block "$zram_path") || return
    if [ -z "$size" ]; then
        if [ -n "$(get_conf_value "$CONFIG_DIR/zram.conf" priority)" ]; then
            swapoff "$zram_path" 2>/dev/null || return
            swapon "$zram_path" -p "$zram_priority" 2>/dev/null || return
        fi
        if [ -n "$swappiness" ] || [ -n "$direct_swappiness" ]; then
            write_zram_swappiness "$swappiness" "$direct_swappiness"
        fi
        [ -n "$zram_used_limit_mb" ] && [ -w /dev/memcg/memory.zram_used_limit_mb ] && echo "$zram_used_limit_mb" > /dev/memcg/memory.zram_used_limit_mb 2>/dev/null
        [ -n "$hybridswap_zram_increase" ] && [ -w "/sys/block/$zram_block/hybridswap_zram_increase" ] && echo "$hybridswap_zram_increase" > "/sys/block/$zram_block/hybridswap_zram_increase" 2>/dev/null
        [ -n "$hybridswap_quota_day" ] && [ -w "/sys/block/$zram_block/hybridswap_quota_day" ] && echo "$hybridswap_quota_day" > "/sys/block/$zram_block/hybridswap_quota_day" 2>/dev/null
        return
    fi
    swapoff "$zram_path" 2>/dev/null || return
    [ -x "$WRITEBACK_HELPER" ] && /system/bin/sh "$WRITEBACK_HELPER" remember "$zram_block" 2>/dev/null
    echo 1 > "/sys/block/$zram_block/reset" 2>/dev/null || return
    if [ -n "$algorithm" ]; then
        algorithm=$(apply_zram_primary_algorithm "$zram_block" "$algorithm") || return
    fi
    apply_zram_recomp_algorithms "$zram_block" || return
    apply_zstd_compression_level || return
    if [ ! -f "/sys/block/$zram_block/hybridswap_loop_device" ] && [ -x "$WRITEBACK_HELPER" ]; then
        /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" "$zram_writeback" "$writeback_size_mb" 2>/dev/null || return
    fi
    echo "$size" > "/sys/block/$zram_block/disksize" 2>/dev/null || return
    mkswap "$zram_path" 2>/dev/null || return
    swapon "$zram_path" -p "$zram_priority" 2>/dev/null || return
    if [ -f "/sys/block/$zram_block/hybridswap_loop_device" ] && [ -x "$WRITEBACK_HELPER" ]; then
        /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" "$zram_writeback" "$writeback_size_mb" 2>/dev/null || return
    fi
    [ "$(get_swap_priority "$zram_path")" = "$zram_priority" ] || return
    if [ -n "$swappiness" ] || [ -n "$direct_swappiness" ]; then
        write_zram_swappiness "$swappiness" "$direct_swappiness"
    fi
    [ -n "$zram_used_limit_mb" ] && [ -w /dev/memcg/memory.zram_used_limit_mb ] && echo "$zram_used_limit_mb" > /dev/memcg/memory.zram_used_limit_mb 2>/dev/null
    [ -n "$hybridswap_zram_increase" ] && [ -w "/sys/block/$zram_block/hybridswap_zram_increase" ] && echo "$hybridswap_zram_increase" > "/sys/block/$zram_block/hybridswap_zram_increase" 2>/dev/null
    [ -n "$hybridswap_quota_day" ] && [ -w "/sys/block/$zram_block/hybridswap_quota_day" ] && echo "$hybridswap_quota_day" > "/sys/block/$zram_block/hybridswap_quota_day" 2>/dev/null
}

apply_swap_config() {
    [ ! -f "$CONFIG_DIR/swap.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/swap.conf" enabled)
    [ "$enabled" != "1" ] && return
    swap_size=$(get_conf_value "$CONFIG_DIR/swap.conf" size)
    swap_priority=$(get_conf_value "$CONFIG_DIR/swap.conf" priority)
    swap_path=$(get_conf_value "$CONFIG_DIR/swap.conf" path)
    [ -z "$swap_path" ] && swap_path="$MODDIR/swapfile.img"
    [ -z "$swap_size" ] && return
    swapoff "$swap_path" 2>/dev/null
    rm -f "$swap_path" 2>/dev/null
    fallocate -l "${swap_size}M" "$swap_path" 2>/dev/null || dd if=/dev/zero of="$swap_path" bs=1M count="$swap_size" 2>/dev/null
    chmod 600 "$swap_path"
    mkswap "$swap_path" 2>/dev/null
    if [ "$swap_priority" != "0" ] && [ -n "$swap_priority" ]; then
        swapon "$swap_path" -p "$swap_priority" 2>/dev/null
    else
        swapon "$swap_path" 2>/dev/null
    fi
}

apply_vm_config() {
    [ ! -f "$CONFIG_DIR/vm.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/vm.conf" enabled)
    [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
    watermark=$(get_conf_value "$CONFIG_DIR/vm.conf" watermark_scale_factor)
    extra_free=$(get_conf_value "$CONFIG_DIR/vm.conf" extra_free_kbytes)
    dirty_ratio=$(get_conf_value "$CONFIG_DIR/vm.conf" dirty_ratio)
    dirty_bg=$(get_conf_value "$CONFIG_DIR/vm.conf" dirty_background_ratio)
    vfs_cache=$(get_conf_value "$CONFIG_DIR/vm.conf" vfs_cache_pressure)
    [ -n "$watermark" ] && echo "$watermark" > /proc/sys/vm/watermark_scale_factor 2>/dev/null
    [ -n "$extra_free" ] && echo "$extra_free" > /proc/sys/vm/extra_free_kbytes 2>/dev/null
    [ -n "$dirty_ratio" ] && echo "$dirty_ratio" > /proc/sys/vm/dirty_ratio 2>/dev/null
    [ -n "$dirty_bg" ] && echo "$dirty_bg" > /proc/sys/vm/dirty_background_ratio 2>/dev/null
    [ -n "$vfs_cache" ] && echo "$vfs_cache" > /proc/sys/vm/vfs_cache_pressure 2>/dev/null
}

apply_kernel_features_config() {
    [ ! -f "$CONFIG_DIR/kernel.conf" ] && return
    lru_gen=$(get_conf_value "$CONFIG_DIR/kernel.conf" lru_gen)
    thp=$(get_conf_value "$CONFIG_DIR/kernel.conf" thp)
    ksm=$(get_conf_value "$CONFIG_DIR/kernel.conf" ksm)
    compaction=$(get_conf_value "$CONFIG_DIR/kernel.conf" compaction)
    [ "$lru_gen" = "1" ] && echo Y > /sys/kernel/mm/lru_gen/enabled 2>/dev/null
    [ "$lru_gen" = "0" ] && echo N > /sys/kernel/mm/lru_gen/enabled 2>/dev/null
    [ -n "$thp" ] && echo "$thp" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
    [ "$ksm" = "1" ] && echo 1 > /sys/kernel/mm/ksm/run 2>/dev/null
    [ "$ksm" = "0" ] && echo 0 > /sys/kernel/mm/ksm/run 2>/dev/null
    [ "$compaction" = "1" ] && echo 20 > /proc/sys/vm/compaction_proactiveness 2>/dev/null
    [ "$compaction" = "0" ] && echo 0 > /proc/sys/vm/compaction_proactiveness 2>/dev/null
}

apply_le9ec_config() {
    [ ! -f "$CONFIG_DIR/le9ec.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/le9ec.conf" enabled)
    [ "$enabled" != "1" ] && return
    anon_min=$(get_conf_value "$CONFIG_DIR/le9ec.conf" anon_min)
    clean_low=$(get_conf_value "$CONFIG_DIR/le9ec.conf" clean_low)
    clean_min=$(get_conf_value "$CONFIG_DIR/le9ec.conf" clean_min)
    [ -n "$anon_min" ] && echo "$anon_min" > /proc/sys/vm/anon_min_kbytes 2>/dev/null
    [ -n "$clean_low" ] && echo "$clean_low" > /proc/sys/vm/clean_low_kbytes 2>/dev/null
    [ -n "$clean_min" ] && echo "$clean_min" > /proc/sys/vm/clean_min_kbytes 2>/dev/null
}

apply_lmk_config() {
    [ ! -f "$CONFIG_DIR/lmk.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/lmk.conf" enabled)
    [ "$enabled" != "1" ] && return
    if [ "$sdk_version" -gt 28 ] 2>/dev/null; then
        levels='4096:0,5120:100,8192:200,32768:250,65536:900,96000:950'
        [ "$mem_total_kb" -gt 8388608 ] && levels='4096:0,5120:100,32768:200,96000:250,131072:900,204800:950'
        [ "$mem_total_kb" -gt 6291456 ] && [ "$mem_total_kb" -le 8388608 ] && levels='4096:0,5120:100,8192:200,32768:250,96000:900,131072:950'
        resetprop sys.lmk.minfree_levels "$levels" 2>/dev/null
    fi
}

apply_reclaim_config() {
    [ ! -f "$CONFIG_DIR/reclaim.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/reclaim.conf" enabled)
    [ "$enabled" != "1" ] && return
    echo off > /sys/kernel/mm/damon/admin/kdamonds/0/state 2>/dev/null
    echo 0 > /sys/module/process_reclaim/parameters/enable_process_reclaim 2>/dev/null
    if [ "$is_oplus" = "1" ]; then
        echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
        dumpsys osensemanager proc debug feature 0 2>/dev/null
    fi
}

apply_kswapd_config() {
    [ ! -f "$CONFIG_DIR/kswapd.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/kswapd.conf" enabled)
    [ "$enabled" != "1" ] && return
    kswapd_pid=$(pgrep kswapd 2>/dev/null | head -1)
    [ -z "$kswapd_pid" ] && return
    echo "$kswapd_pid" > /dev/cpuset/foreground/cgroup.procs 2>/dev/null
    mkdir -p /dev/cpuctl/kswapd 2>/dev/null
    echo "$kswapd_pid" > /dev/cpuctl/kswapd/cgroup.procs 2>/dev/null
    echo 1 > /dev/cpuctl/kswapd/cpu.uclamp.latency_sensitive 2>/dev/null
}

apply_corona_kernel_config() {
    [ ! -f "$CONFIG_DIR/corona_kernel.conf" ] && return
    [ "$isCoronaKernel" != "1" ] && return
    while IFS='=' read -r key value; do
        [ -z "$key" ] && continue
        case "$key" in
            user_window_ms)
                for mod in cpufreq_bouncer task_turbo uclamp_assist suspend_timerslack; do
                    [ -f "/sys/module/$mod/parameters/user_window_ms" ] && echo "$value" > "/sys/module/$mod/parameters/user_window_ms" 2>/dev/null
                done
                ;;
            slack_off_ms)
                ns=$((value * 1000 * 1000))
                [ -f /sys/module/suspend_timerslack/parameters/slack_off_ns ] && echo "$ns" > /sys/module/suspend_timerslack/parameters/slack_off_ns 2>/dev/null
                ;;
            *)
                [ -f "/sys/module/$key/parameters/enabled" ] && {
                    v="N"; [ "$value" = "1" ] && v="Y"
                    echo "$v" > "/sys/module/$key/parameters/enabled" 2>/dev/null
                }
                ;;
        esac
    done < "$CONFIG_DIR/corona_kernel.conf"
}

update_module_description() {
    module_prop="$MODDIR/module.prop"
    [ -f "$module_prop" ] || return

    desc_parts=""

    if [ -f "$CONFIG_DIR/zram.conf" ] && [ "$(get_conf_value "$CONFIG_DIR/zram.conf" enabled)" = "1" ]; then
        current_alg="$(get_conf_value "$CONFIG_DIR/zram.conf" algorithm)"
        [ -z "$current_alg" ] && current_alg="--"
        desc_parts="ZRAM:${current_alg}"
    else
        current_zram=$(awk 'NR > 1 && ($1 ~ /^\/dev\/block\/zram/ || $1 ~ /^\/dev\/zram/) { print $1; exit }' /proc/swaps 2>/dev/null)
        if [ -n "$current_zram" ]; then
            current_zram_block=${current_zram#/dev/block/}
            current_zram_block=${current_zram_block#/dev/}
            scheduler_raw=$(cat "/sys/block/$current_zram_block/comp_algorithm" 2>/dev/null)
            current_alg=$(echo "$scheduler_raw" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
            [ -z "$current_alg" ] && current_alg=$(echo "$scheduler_raw" | awk '{print $1}')
            [ -n "$current_alg" ] && desc_parts="ZRAM:${current_alg}" || desc_parts="ZRAM:默认"
        else
            desc_parts="ZRAM:关闭"
        fi
    fi

    if [ -f "$CONFIG_DIR/io_scheduler.conf" ] && [ "$(get_conf_value "$CONFIG_DIR/io_scheduler.conf" enabled)" != "0" ]; then
        scheduler="$(get_conf_value "$CONFIG_DIR/io_scheduler.conf" scheduler)"
    else
        scheduler=""
    fi
    if [ -n "$scheduler" ]; then
        desc_parts="$desc_parts | IO:${scheduler}"
    else
        scheduler_raw=$(cat /sys/block/sda/queue/scheduler 2>/dev/null || cat /sys/block/mmcblk0/queue/scheduler 2>/dev/null)
        current_scheduler=$(echo "$scheduler_raw" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
        [ -z "$current_scheduler" ] && current_scheduler=$(echo "$scheduler_raw" | awk '{print $1}')
        [ -n "$current_scheduler" ] && desc_parts="$desc_parts | IO:${current_scheduler}" || desc_parts="$desc_parts | IO:--"
    fi

    if [ "$(get_conf_value "$CONFIG_DIR/cpu_governor.conf" enabled)" = "0" ]; then
        governor=""
    else
        governor="$(get_conf_value "$CONFIG_DIR/cpu_governor.conf" governor)"
    fi
    if [ -n "$governor" ]; then
        desc_parts="$desc_parts | CPU:${governor}"
    else
        current_governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null | tr -d '\r\n')
        [ -n "$current_governor" ] && desc_parts="$desc_parts | CPU:${current_governor}" || desc_parts="$desc_parts | CPU:--"
    fi

    if [ "$(get_conf_value "$CONFIG_DIR/tcp.conf" enabled)" = "0" ]; then
        congestion=""
    else
        congestion="$(get_conf_value "$CONFIG_DIR/tcp.conf" congestion)"
    fi
    if [ -n "$congestion" ]; then
        desc_parts="$desc_parts | TCP:${congestion}"
    else
        current_tcp=$(cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null | tr -d '\r\n')
        [ -n "$current_tcp" ] && desc_parts="$desc_parts | TCP:${current_tcp}" || desc_parts="$desc_parts | TCP:--"
    fi

    if [ -f "$CONFIG_DIR/le9ec.conf" ] && [ "$(get_conf_value "$CONFIG_DIR/le9ec.conf" enabled)" = "1" ]; then
        desc_parts="$desc_parts | LE9EC:开启"
    fi

    sed -i "s/^description=.*/description=${desc_parts//\//\\/}/" "$module_prop" 2>/dev/null
}

run_user_scripts() {
    [ -d "$SCRIPTS_DIR" ] || return
    for script in "$SCRIPTS_DIR"/*.sh; do
        [ -f "$script" ] || continue
        chmod 755 "$script"
        sh "$script" &
    done
}

should_start_app_policy() {
    [ -x "$APP_POLICY_SH" ] || return 1
    rules_file="$MODDIR/config/app_rules.conf"
    protect_file="$MODDIR/config/app_protect.list"
    profiles_file="$MODDIR/config/app_profiles.list"
    thread_file="$MODDIR/config/thread_priority.conf"
    monitor_enabled=$(get_conf_value "$rules_file" monitor_enabled)
    protect_apps=$(cat "$protect_file" 2>/dev/null | awk 'NF {print; exit}')
    profile_apps=$(cat "$profiles_file" 2>/dev/null | awk 'NF {print; exit}')
    [ "$monitor_enabled" = "1" ] && return 0
    [ -n "$protect_apps" ] && return 0
    [ -n "$profile_apps" ] && return 0
    [ -f "$thread_file" ] && awk 'NF && $0 !~ /^#/ { found=1; exit } END { exit found ? 0 : 1 }' "$thread_file" 2>/dev/null && return 0
    [ "$(get_conf_value "$MODDIR/config/memory_pressure.conf" enabled)" = "1" ] && return 0
    [ "$(get_conf_value "$MODDIR/config/auto_affinity.conf" enabled)" = "1" ] && return 0
    return 1
}

start_app_policy_daemon() {
    should_start_app_policy || return
    if [ -x "$CORONAD" ]; then
        legacy_pid=$(cat "$MODDIR/.app_policy_daemon.pid" 2>/dev/null)
        [ -n "$legacy_pid" ] && kill -TERM "$legacy_pid" 2>/dev/null
        rm -f "$MODDIR/.app_policy_daemon.pid" "$MODDIR/.app_policy_state"
        [ -f "$MODDIR/.memory_pressure.pid" ] && /system/bin/sh "$MODDIR/scripts/memory-pressure.sh" stop >/dev/null 2>&1
        CORONA_MODDIR="$MODDIR" "$CORONAD" reload >/dev/null 2>&1
        return
    fi
    if [ -f "$MODDIR/.app_policy_daemon.pid" ]; then
        daemon_pid=$(cat "$MODDIR/.app_policy_daemon.pid" 2>/dev/null)
        if [ -n "$daemon_pid" ] && [ -d "/proc/$daemon_pid" ]; then
            kill -HUP "$daemon_pid" 2>/dev/null
            return
        fi
    fi
    sh "$APP_POLICY_SH" daemon >/dev/null 2>&1 &
}

apply_memory_pressure_config() {
    helper="$MODDIR/scripts/memory-pressure.sh"
    [ -f "$helper" ] || return 0
    if [ -x "$CORONAD" ]; then
        [ -f "$MODDIR/.memory_pressure.pid" ] && /system/bin/sh "$helper" stop >/dev/null 2>&1
        if [ -f "$CONFIG_DIR/memory_pressure.conf" ]; then
            cp -f "$CONFIG_DIR/memory_pressure.conf" "$MODDIR/.memory_pressure.runtime.conf"
        else
            rm -f "$MODDIR/.memory_pressure.runtime.conf"
        fi
        corona_pid=$(cat "$MODDIR/.coronad.pid" 2>/dev/null)
        [ -n "$corona_pid" ] && [ -d "/proc/$corona_pid" ] && CORONA_MODDIR="$MODDIR" "$CORONAD" reload >/dev/null 2>&1
        return 0
    fi
    CORONA_PRESSURE_CONFIG="$CONFIG_DIR/memory_pressure.conf" /system/bin/sh "$helper" apply >/dev/null 2>&1
}

apply_runtime_configs() {
    get_system_info
    mkdir -p "$CONFIG_DIR"
    apply_swap_config
    apply_memory_pressure_config
    if ! has_mm_sys_entry; then
        apply_vm_config
        apply_kernel_features_config
        apply_lmk_config
        apply_reclaim_config
        apply_kswapd_config
    fi
    apply_le9ec_config
    apply_corona_kernel_config
    apply_io_config
    apply_cpu_governor_config
    apply_cpu_hotplug_config
    apply_tcp_config
    apply_process_priority_config
    apply_thread_priority_config
    apply_device_config
    apply_protect_config
}

runtime_config_files='swap.conf memory_pressure.conf vm.conf kernel.conf lmk.conf reclaim.conf kswapd.conf le9ec.conf corona_kernel.conf io_scheduler.conf cpu_governor.conf cpu_hotplug.conf tcp.conf process_priority.conf thread_priority.conf device.conf protect.conf'

build_effective_runtime_config() {
    target_dir="$1"
    output_dir="$2"
    rm -rf "$output_dir"
    mkdir -p "$output_dir"
    for config_name in $runtime_config_files; do
        [ -f "$MODDIR/config/$config_name" ] && cp -f "$MODDIR/config/$config_name" "$output_dir/$config_name"
    done
    if [ -n "$target_dir" ] && [ "$target_dir" != "$MODDIR/config" ] && [ -d "$target_dir" ]; then
        for config_name in $runtime_config_files; do
            [ -f "$target_dir/$config_name" ] && cp -f "$target_dir/$config_name" "$output_dir/$config_name"
        done
    fi
}

apply_runtime_config_name() {
    case "$1" in
        swap.conf) apply_swap_config ;;
        memory_pressure.conf) apply_memory_pressure_config ;;
        vm.conf) has_mm_sys_entry || apply_vm_config ;;
        kernel.conf) has_mm_sys_entry || apply_kernel_features_config ;;
        lmk.conf) has_mm_sys_entry || apply_lmk_config ;;
        reclaim.conf) has_mm_sys_entry || apply_reclaim_config ;;
        kswapd.conf) has_mm_sys_entry || apply_kswapd_config ;;
        le9ec.conf) apply_le9ec_config ;;
        corona_kernel.conf) apply_corona_kernel_config ;;
        io_scheduler.conf) apply_io_config ;;
        cpu_governor.conf) apply_cpu_governor_config ;;
        cpu_hotplug.conf) apply_cpu_hotplug_config ;;
        tcp.conf) apply_tcp_config ;;
        process_priority.conf) apply_process_priority_config ;;
        thread_priority.conf)
            corona_pid=$(cat "$MODDIR/.coronad.pid" 2>/dev/null)
            if [ -x "$CORONAD" ] && [ -n "$corona_pid" ] && [ -d "/proc/$corona_pid" ]; then
                :
            else
                apply_thread_priority_config
            fi
            ;;
        device.conf) apply_device_config ;;
        protect.conf) apply_protect_config ;;
    esac
}

apply_runtime_config_delta() {
    target_dir="$1"
    current_dir="$MODDIR/.app_policy_effective"
    next_dir="$MODDIR/.app_policy_effective.next.$$"
    [ -d "$current_dir" ] || build_effective_runtime_config "$MODDIR/config" "$current_dir"
    build_effective_runtime_config "$target_dir" "$next_dir"
    original_config_dir="$CONFIG_DIR"
    CONFIG_DIR="$next_dir"
    get_system_info
    for config_name in $runtime_config_files; do
        current_file="$current_dir/$config_name"
        next_file="$next_dir/$config_name"
        if [ -f "$current_file" ] && [ -f "$next_file" ] && cmp -s "$current_file" "$next_file"; then
            continue
        fi
        [ ! -f "$current_file" ] && [ ! -f "$next_file" ] && continue
        apply_runtime_config_name "$config_name"
    done
    CONFIG_DIR="$original_config_dir"
    rm -rf "$current_dir"
    mv "$next_dir" "$current_dir"
}

if [ "$1" = "--apply-runtime-config" ]; then
    apply_runtime_configs
    [ "$CORONA_SKIP_DESCRIPTION" = "1" ] || update_module_description
    exit 0
fi

if [ "$1" = "--apply-runtime-delta" ]; then
    apply_runtime_config_delta "$2"
    exit 0
fi

if [ "$1" = "--apply-thread-priority" ]; then
    apply_thread_priority_config
    exit 0
fi

if [ "$1" = "--apply-writeback-block" ]; then
    apply_writeback_block_config
    exit $?
fi

wait_until_boot_complete
wait_until_login
trigger_official_nandswap_once
apply_writeback_block_config
apply_runtime_configs
rm -rf "$MODDIR/.app_policy_effective" "$MODDIR"/.app_policy_effective.next.*
apply_fstrim_config
run_user_scripts
start_app_policy_daemon

sleep 30
trigger_official_nandswap_once
apply_writeback_block_config
apply_io_config
apply_cpu_governor_config
apply_process_priority_config
apply_protect_config
if ! has_mm_sys_entry; then
    apply_lmk_config
    apply_kswapd_config
fi
start_app_policy_daemon
update_module_description

exit 0
