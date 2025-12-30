#!/system/bin/sh
MODDIR=${0%/*}
CONFIG_DIR="$MODDIR/config"

set_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null; }
lock_value() { [ -f "$2" ] && chmod 644 "$2" 2>/dev/null && echo "$1" > "$2" 2>/dev/null && chmod 444 "$2" 2>/dev/null; }

wait_until_boot_complete() { until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 5; done; }
wait_until_login() { until [ -d "/data/data/android" ]; do sleep 5; done; }

load_kernel_modules() {
    [ -f "$MODDIR/zksmalloc.ko" ] && insmod "$MODDIR/zksmalloc.ko" 2>/dev/null
    [ -f "$MODDIR/zakom.ko" ] && insmod "$MODDIR/zakom.ko" 2>/dev/null
}

get_system_info() {
    mem_total_str=$(cat /proc/meminfo | grep MemTotal)
    mem_total_kb=${mem_total_str:16:8}
    sdk_version=$(getprop ro.build.version.sdk)
    kernel_version=$(uname -r | cut -d'-' -f1)
    kernel_version1=$(echo $kernel_version | cut -d'.' -f1)
    is_oplus=0; find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | grep -q . && is_oplus=1
    is_xiaomi=0; [ "$(getprop ro.miui.ui.version.name)" != "" ] && is_xiaomi=1
}

apply_zram_config() {
    [ ! -f "$CONFIG_DIR/zram.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    algorithm=$(grep "^algorithm=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    size=$(grep "^size=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    swappiness=$(grep "^swappiness=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    zram_writeback=$(grep "^zram_writeback=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    zram_path=$(grep "^zram_path=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    [ -z "$zram_path" ] && zram_path="/dev/block/zram0"
    zram_block=$(echo "$zram_path" | sed 's|/dev/block/||' | sed 's|/dev/||')
    swapoff "$zram_path" 2>/dev/null
    echo 1 > /sys/block/$zram_block/reset 2>/dev/null
    bd_path=/sys/block/$zram_block/backing_dev
    [ -f /sys/block/$zram_block/hybridswap_loop_device ] && bd_path=/sys/block/$zram_block/hybridswap_loop_device
    if [ -f "$bd_path" ]; then
        if [ "$zram_writeback" = "true" ]; then
            set_value 0 /sys/block/$zram_block/writeback_limit_enable
        elif [ "$zram_writeback" = "false" ]; then
            set_value none "$bd_path"
            set_value 1 /sys/block/$zram_block/writeback_limit_enable
            set_value 0 /sys/block/$zram_block/writeback_limit
        fi
    fi
    set_value 4 /sys/block/$zram_block/max_comp_streams
    [ -n "$algorithm" ] && grep -q "$algorithm" /sys/block/$zram_block/comp_algorithm && echo "$algorithm" > /sys/block/$zram_block/comp_algorithm 2>/dev/null
    [ -n "$size" ] && echo "$size" > /sys/block/$zram_block/disksize 2>/dev/null
    mkswap "$zram_path" 2>/dev/null
    swapon "$zram_path" -p 32758 2>/dev/null || swapon "$zram_path" 2>/dev/null
    [ -n "$swappiness" ] && {
        lock_value "$swappiness" /proc/sys/vm/swappiness
        lock_value "$swappiness" /dev/memcg/memory.swappiness
        lock_value "$swappiness" /dev/memcg/apps/memory.swappiness
        lock_value "$swappiness" /sys/fs/cgroup/memory/memory.swappiness
        set_value "$swappiness" /sys/module/zram_opt/parameters/vm_swappiness
        [ -d /sys/module/oplus_bsp_zram_opt/parameters ] && {
            set_value 200 /sys/module/oplus_bsp_zram_opt/parameters/hybridswapd_swappiness
            set_value 160 /sys/module/oplus_bsp_zram_opt/parameters/vm_swappiness_threshold1
        }
    }
}

apply_swap_config() {
    [ ! -f "$CONFIG_DIR/swap.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
    size=$(grep "^size=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
    priority=$(grep "^priority=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
    swapfile="/data/swapfile"
    if [ "$enabled" = "1" ] && [ -n "$size" ]; then
        [ -f "$swapfile" ] && {
            current_size=$(($(stat -c %s "$swapfile" 2>/dev/null || echo 0) / 1024 / 1024))
            [ "$current_size" != "$size" ] && swapoff "$swapfile" 2>/dev/null && rm -f "$swapfile"
        }
        [ ! -f "$swapfile" ] && {
            [ "$kernel_version1" -ge 5 ] && fallocate -l ${size}M "$swapfile" 2>/dev/null || dd if=/dev/zero of="$swapfile" bs=1M count="$size" 2>/dev/null
            chmod 600 "$swapfile"
        }
        mkswap "$swapfile" 2>/dev/null
        [ -n "$priority" ] && [ "$priority" != "0" ] && swapon "$swapfile" -p "$priority" 2>/dev/null || swapon "$swapfile" 2>/dev/null
    else
        swapoff "$swapfile" 2>/dev/null
    fi
}

apply_vm_config() {
    [ ! -f "$CONFIG_DIR/vm.conf" ] && return
    watermark=$(grep "^watermark_scale_factor=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
    extra_free=$(grep "^extra_free_kbytes=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
    dirty_ratio=$(grep "^dirty_ratio=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
    dirty_bg=$(grep "^dirty_background_ratio=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
    vfs_pressure=$(grep "^vfs_cache_pressure=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
    [ -n "$watermark" ] && set_value "$watermark" /proc/sys/vm/watermark_scale_factor
    [ -n "$extra_free" ] && set_value "$extra_free" /proc/sys/vm/extra_free_kbytes
    [ -n "$dirty_ratio" ] && set_value "$dirty_ratio" /proc/sys/vm/dirty_ratio
    [ -n "$dirty_bg" ] && set_value "$dirty_bg" /proc/sys/vm/dirty_background_ratio
    [ -n "$vfs_pressure" ] && set_value "$vfs_pressure" /proc/sys/vm/vfs_cache_pressure
}

apply_kernel_features_config() {
    [ ! -f "$CONFIG_DIR/kernel.conf" ] && return
    lru_gen=$(grep "^lru_gen=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
    thp=$(grep "^thp=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
    ksm=$(grep "^ksm=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
    compaction=$(grep "^compaction=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
    [ -f /sys/kernel/mm/lru_gen/enabled ] && [ -n "$lru_gen" ] && { [ "$lru_gen" = "1" ] && echo Y > /sys/kernel/mm/lru_gen/enabled 2>/dev/null || echo N > /sys/kernel/mm/lru_gen/enabled 2>/dev/null; }
    [ -f /sys/kernel/mm/transparent_hugepage/enabled ] && [ -n "$thp" ] && echo "$thp" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
    [ -f /sys/kernel/mm/ksm/run ] && [ -n "$ksm" ] && echo "$ksm" > /sys/kernel/mm/ksm/run 2>/dev/null
    [ -f /proc/sys/vm/compaction_proactiveness ] && [ -n "$compaction" ] && { [ "$compaction" = "1" ] && echo 20 > /proc/sys/vm/compaction_proactiveness 2>/dev/null || echo 0 > /proc/sys/vm/compaction_proactiveness 2>/dev/null; }
}

apply_le9ec_config() {
    [ ! -f "$CONFIG_DIR/le9ec.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    anon_min=$(grep "^anon_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
    clean_low=$(grep "^clean_low=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
    clean_min=$(grep "^clean_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
    [ -n "$anon_min" ] && echo "$anon_min" > /proc/sys/vm/anon_min_kbytes 2>/dev/null
    [ -n "$clean_low" ] && echo "$clean_low" > /proc/sys/vm/clean_low_kbytes 2>/dev/null
    [ -n "$clean_min" ] && echo "$clean_min" > /proc/sys/vm/clean_min_kbytes 2>/dev/null
}

apply_io_config() {
    [ ! -f "$CONFIG_DIR/io_scheduler.conf" ] && return
    scheduler=$(grep "^scheduler=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    readahead=$(grep "^readahead=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    uname -r | grep -qi "corona" && scheduler="kernel:$scheduler"
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

cpu_mask_to_hex() {
    mask_str="$1"; result=0; IFS=','
    for part in $mask_str; do
        if echo "$part" | grep -q "-"; then
            start=$(echo "$part" | cut -d'-' -f1); end=$(echo "$part" | cut -d'-' -f2); i=$start
            while [ "$i" -le "$end" ]; do result=$((result | (1 << i))); i=$((i + 1)); done
        else result=$((result | (1 << part))); fi
    done; unset IFS; printf "0x%x" "$result"
}

apply_cpu_affinity_config() {
    [ ! -f "$CONFIG_DIR/cpu_affinity.conf" ] && return
    while IFS='=' read -r process_name cpu_mask; do
        [ -n "$process_name" ] && [ -n "$cpu_mask" ] && {
            hex_mask=$(cpu_mask_to_hex "$cpu_mask")
            for pid in $(pgrep -f "$process_name" 2>/dev/null); do taskset -p "$hex_mask" "$pid" 2>/dev/null; done
        }
    done < "$CONFIG_DIR/cpu_affinity.conf"
}

apply_process_priority_config() {
    [ ! -f "$CONFIG_DIR/process_priority.conf" ] && return
    while IFS='=' read -r process_name values; do
        [ -n "$process_name" ] && [ -n "$values" ] && {
            nice_val=$(echo "$values" | cut -d',' -f1)
            io_class=$(echo "$values" | cut -d',' -f2)
            io_level=$(echo "$values" | cut -d',' -f3)
            for pid in $(pgrep -f "$process_name" 2>/dev/null); do
                renice -n "$nice_val" -p "$pid" 2>/dev/null
                ionice -c "$io_class" -n "$io_level" -p "$pid" 2>/dev/null
            done
        }
    done < "$CONFIG_DIR/process_priority.conf"
}

apply_freq_lock_config() {
    [ ! -f "$CONFIG_DIR/freq_lock.conf" ] && return
    mode=$(grep "^mode=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
    if [ "$mode" = "global" ]; then
        min_freq=$(grep "^global_min=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
        max_freq=$(grep "^global_max=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
        [ -n "$min_freq" ] && [ -n "$max_freq" ] && {
            for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; do echo "$min_freq" > "$f" 2>/dev/null; done
            for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do echo "$max_freq" > "$f" 2>/dev/null; done
        }
    elif [ "$mode" = "per-core" ]; then
        grep "^core" "$CONFIG_DIR/freq_lock.conf" | while IFS='=' read -r key values; do
            core_num=$(echo "$key" | sed 's/core//')
            min_freq=$(echo "$values" | cut -d',' -f1)
            max_freq=$(echo "$values" | cut -d',' -f2)
            [ -n "$min_freq" ] && [ -n "$max_freq" ] && {
                echo "$min_freq" > "/sys/devices/system/cpu/cpu${core_num}/cpufreq/scaling_min_freq" 2>/dev/null
                echo "$max_freq" > "/sys/devices/system/cpu/cpu${core_num}/cpufreq/scaling_max_freq" 2>/dev/null
            }
        done
    fi
}

apply_user_scripts() {
    [ -f "$CONFIG_DIR/user_scripts.sh" ] && chmod 755 "$CONFIG_DIR/user_scripts.sh" && sh "$CONFIG_DIR/user_scripts.sh" 2>/dev/null &
}

apply_lmk_config() {
    [ ! -f "$CONFIG_DIR/lmk.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/lmk.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    [ "$is_xiaomi" = "1" ] && {
        resetprop persist.sys.minfree_6g "16384,20480,32768,131072,262144,384000"
        resetprop persist.sys.minfree_8g "16384,20480,32768,131072,384000,524288"
        resetprop persist.sys.minfree_12g "16384,20480,131072,384000,524288,819200"
    }
    lowmemorykiller='/sys/module/lowmemorykiller/parameters'
    [ -d "$lowmemorykiller" ] && {
        if [ "$mem_total_kb" -gt 8388608 ]; then set_value "4096,5120,32768,96000,131072,204800" $lowmemorykiller/minfree
        elif [ "$mem_total_kb" -gt 6291456 ]; then set_value "4096,5120,8192,32768,96000,131072" $lowmemorykiller/minfree
        elif [ "$mem_total_kb" -gt 4194304 ]; then set_value "4096,5120,8192,32768,65536,96000" $lowmemorykiller/minfree
        else set_value "4096,5120,8192,16384,24576,39936" $lowmemorykiller/minfree; fi
        set_value 0 $lowmemorykiller/enable_adaptive_lmk
    }
    [ "$sdk_version" -gt 28 ] && {
        if [ "$mem_total_kb" -gt 8388608 ]; then minfree_levels="4096:0,5120:100,32768:200,96000:250,131072:900,204800:950"
        elif [ "$mem_total_kb" -gt 6291456 ]; then minfree_levels="4096:0,5120:100,8192:200,32768:250,96000:900,131072:950"
        else minfree_levels="4096:0,5120:100,8192:200,32768:250,65536:900,96000:950"; fi
        resetprop sys.lmk.minfree_levels "$minfree_levels"
    }
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

apply_reclaim_config() {
    [ ! -f "$CONFIG_DIR/reclaim.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/reclaim.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    set_value off /sys/kernel/mm/damon/admin/kdamonds/0/state
    set_value off /sys/kernel/mm/damon/admin/kdamonds/1/state
    lock_value 0 /sys/kernel/mm/damon/admin/kdamonds/nr_kdamonds
    [ -d /sys/module/process_reclaim/parameters ] && set_value 0 /sys/module/process_reclaim/parameters/enable_process_reclaim
    set_value 0 /sys/kernel/mi_reclaim/enable
    mi_rtmm=""; [ -d "/d/rtmm" ] && mi_rtmm=/d/rtmm; [ -d "/sys/kernel/mm/rtmm" ] && mi_rtmm=/sys/kernel/mm/rtmm
    [ -n "$mi_rtmm" ] && {
        chmod 000 $mi_rtmm/reclaim/auto_reclaim 2>/dev/null
        chmod 000 $mi_rtmm/reclaim/global_reclaim 2>/dev/null
        chmod 000 $mi_rtmm/reclaim/proc_reclaim 2>/dev/null
    }
    [ -d /sys/module/perf_helper/mimd ] && { lock_value -1 /sys/module/perf_helper/mimd/mimdtrigger; stop mimd-service 2>/dev/null; }
    [ "$is_oplus" = "1" ] && {
        echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
        echo never > /sys/kernel/mm/transparent_hugepage/defrag 2>/dev/null
        set_value 32768 /dev/memcg/memory.zram_used_limit_mb
        set_value 99 /dev/memcg/memory.cpuload_threshold
        dumpsys osensemanager proc debug feature 0 2>/dev/null
        dumpsys osensemanager memory resrelease switch 0 2>/dev/null
    }
}

apply_kswapd_config() {
    [ ! -f "$CONFIG_DIR/kswapd.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/kswapd.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    kswapd_pid=$(pgrep kswapd); hybridswapd_pid=$(pgrep hybridswapd)
    [ -n "$kswapd_pid" ] && echo "$kswapd_pid" > /dev/cpuset/foreground/cgroup.procs 2>/dev/null
    [ -n "$hybridswapd_pid" ] && echo "$hybridswapd_pid" > /dev/cpuset/foreground/cgroup.procs 2>/dev/null
    [ -d /dev/cpuctl ] && {
        mkdir -p /dev/cpuctl/kswapd
        [ -n "$kswapd_pid" ] && echo "$kswapd_pid" > /dev/cpuctl/kswapd/cgroup.procs 2>/dev/null
        echo 1 > /dev/cpuctl/kswapd/cpu.uclamp.latency_sensitive 2>/dev/null
        echo 100 > /dev/cpuctl/kswapd/cpu.uclamp.min 2>/dev/null
    }
}

apply_protect_config() {
    [ ! -f "$CONFIG_DIR/protect.conf" ] && return
    enabled=$(grep "^enabled=" "$CONFIG_DIR/protect.conf" | cut -d'=' -f2)
    [ "$enabled" != "1" ] && return
    [ -d /dev/memcg/system ] && [ "$mem_total_kb" -gt 8388608 ] && {
        mkdir -p /dev/memcg/system/active_fg
        echo 0 > /dev/memcg/system/active_fg/memory.swappiness 2>/dev/null
        echo 1 > /dev/memcg/system/active_fg/memory.use_hierarchy 2>/dev/null
        for app in com.android.systemui com.miui.home com.android.launcher surfaceflinger system_server; do
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

start_auto_clean() {
    while true; do
        sleep 3600
        [ -f "$CONFIG_DIR/autoclean.conf" ] && {
            enabled=$(grep "^enabled=" "$CONFIG_DIR/autoclean.conf" | cut -d'=' -f2)
            [ "$enabled" = "1" ] && { sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; sed -i "s/last_clean=.*/last_clean=$(date +%s)000/" "$CONFIG_DIR/autoclean.conf"; }
        }
    done
}

wait_until_boot_complete
load_kernel_modules
wait_until_login
sleep 10
get_system_info
mkdir -p "$CONFIG_DIR"

apply_zram_config; sleep 2
apply_swap_config; sleep 2
apply_vm_config; sleep 1
apply_kernel_features_config; sleep 1
apply_le9ec_config; sleep 1
apply_io_config; sleep 1
apply_cpu_governor_config; sleep 1
apply_cpu_hotplug_config; sleep 1
apply_tcp_config; sleep 1
apply_cpu_affinity_config; sleep 1
apply_process_priority_config; sleep 1
apply_freq_lock_config; sleep 1
apply_lmk_config; sleep 1
apply_device_config; sleep 1
apply_reclaim_config; sleep 1
apply_kswapd_config; sleep 1
apply_protect_config; sleep 1
apply_fstrim_config; sleep 1
apply_user_scripts

sleep 30
apply_cpu_affinity_config
apply_process_priority_config
apply_freq_lock_config
apply_protect_config

start_auto_clean &
