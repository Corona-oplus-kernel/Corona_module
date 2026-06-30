#!/system/bin/sh
MODDIR=${0%/*}
CONFIG_DIR="$MODDIR/config"
RUNTIME_CONF="$CONFIG_DIR/runtime.conf"
SCRIPTS_DIR="$MODDIR/scripts.d"

BRAND=$(getprop ro.product.brand | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(getprop ro.product.manufacturer | tr '[:upper:]' '[:lower:]')
if [ "$BRAND" != "oneplus" ] && [ "$MANUFACTURER" != "oneplus" ] && [ "$BRAND" != "oplus" ] && [ "$MANUFACTURER" != "oplus" ]; then
    exit 0
fi

set_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null; }
lock_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null && chmod 444 "$2" 2>/dev/null; }
get_conf_value() { [ -f "$1" ] && grep -m1 "^$2=" "$1" | cut -d'=' -f2-; }

wait_until_boot_complete() { until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 5; done; }
wait_until_login() { until [ -d "/data/data/android" ]; do sleep 5; done; }

get_system_info() {
    mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    sdk_version=$(getprop ro.build.version.sdk)
    kernel_version=$(uname -r | cut -d'-' -f1)
    kernel_version1=$(echo "$kernel_version" | cut -d'.' -f1)
    is_oplus=0; find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | grep -q . && is_oplus=1
    isCoronaKernel=0
    [ -f /proc/corona ] && [ "$(cat /proc/corona 2>/dev/null)" = "1" ] && isCoronaKernel=1
}

apply_io_config() {
    [ ! -f "$CONFIG_DIR/io_scheduler.conf" ] && return
    scheduler=$(grep "^scheduler=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    readahead=$(grep "^readahead=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    [ "$isCoronaKernel" = "1" ] && [ -n "$scheduler" ] && scheduler="kernel:$scheduler"
    [ -n "$scheduler" ] && for f in /sys/block/*/queue/scheduler; do echo "$scheduler" > "$f" 2>/dev/null; done
    [ -n "$readahead" ] && for f in /sys/block/*/queue/read_ahead_kb; do echo "$readahead" > "$f" 2>/dev/null; done
}

apply_cpu_governor_config() {
    [ ! -f "$CONFIG_DIR/cpu_governor.conf" ] && return
    governor=$(grep "^governor=" "$CONFIG_DIR/cpu_governor.conf" | cut -d'=' -f2)
    [ -n "$governor" ] && for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "$governor" > "$f" 2>/dev/null; done
}

apply_cpu_hotplug_config() {
    [ ! -f "$CONFIG_DIR/cpu_hotplug.conf" ] && return
    while IFS='=' read -r cpu state; do
        [ -n "$cpu" ] && [ -n "$state" ] && {
            cpu_num=$(echo "$cpu" | sed 's/cpu//')
            [ "$cpu_num" != "0" ] && echo "$state" > "/sys/devices/system/cpu/$cpu/online" 2>/dev/null
        }
    done < "$CONFIG_DIR/cpu_hotplug.conf"
}

apply_tcp_config() {
    [ ! -f "$CONFIG_DIR/tcp.conf" ] && return
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

apply_zram_config() {
    [ ! -f "$CONFIG_DIR/zram.conf" ] && return
    enabled=$(get_conf_value "$CONFIG_DIR/zram.conf" enabled)
    [ "$enabled" != "1" ] && return
    algorithm=$(get_conf_value "$CONFIG_DIR/zram.conf" algorithm)
    size=$(get_conf_value "$CONFIG_DIR/zram.conf" size)
    swappiness=$(get_conf_value "$CONFIG_DIR/zram.conf" swappiness)
    zram_writeback=$(get_conf_value "$CONFIG_DIR/zram.conf" zram_writeback)
    zram_path=$(get_conf_value "$CONFIG_DIR/zram.conf" zram_path)
    zram_path=$(normalize_zram_path "$zram_path") || return
    zram_block=$(get_zram_block "$zram_path") || return
    [ -z "$size" ] && return
    swapoff "$zram_path" 2>/dev/null
    echo 1 > "/sys/block/$zram_block/reset" 2>/dev/null
    [ -n "$algorithm" ] && echo "$algorithm" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null
    [ "$zram_writeback" = "false" ] && echo none > "/sys/block/$zram_block/backing_dev" 2>/dev/null
    echo "$size" > "/sys/block/$zram_block/disksize" 2>/dev/null
    mkswap "$zram_path" 2>/dev/null || return
    swapon "$zram_path" -p 32758 2>/dev/null || return
    [ "$(get_swap_priority "$zram_path")" = "32758" ] || return
    [ -n "$swappiness" ] && echo "$swappiness" > /proc/sys/vm/swappiness
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
        desc_parts="ZRAM:关闭"
    fi

    if [ -f "$CONFIG_DIR/io_scheduler.conf" ]; then
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

    governor="$(get_conf_value "$CONFIG_DIR/cpu_governor.conf" governor)"
    if [ -n "$governor" ]; then
        desc_parts="$desc_parts | CPU:${governor}"
    else
        current_governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null | tr -d '\r\n')
        [ -n "$current_governor" ] && desc_parts="$desc_parts | CPU:${current_governor}" || desc_parts="$desc_parts | CPU:--"
    fi

    congestion="$(get_conf_value "$CONFIG_DIR/tcp.conf" congestion)"
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

wait_until_boot_complete
wait_until_login
get_system_info
mkdir -p "$CONFIG_DIR"

apply_zram_config
apply_swap_config
apply_vm_config
apply_kernel_features_config
apply_le9ec_config
apply_lmk_config
apply_reclaim_config
apply_kswapd_config
apply_corona_kernel_config
apply_io_config
apply_cpu_governor_config
apply_cpu_hotplug_config
apply_tcp_config
apply_process_priority_config
apply_device_config
apply_protect_config
apply_fstrim_config
run_user_scripts

sleep 30
apply_io_config
apply_cpu_governor_config
apply_process_priority_config
apply_protect_config
apply_lmk_config
apply_kswapd_config
update_module_description

exit 0
