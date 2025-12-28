#!/system/bin/sh
MODDIR=${0%/*}
CONFIG_DIR="$MODDIR/config"

wait_until_boot_complete() {
    until [ "$(getprop sys.boot_completed)" = "1" ]; do
        sleep 5
    done
}

wait_until_login() {
    until [ -d "/data/data/android" ]; do
        sleep 5
    done
}

apply_zram_config() {
    if [ -f "$CONFIG_DIR/zram.conf" ]; then
        enabled=$(grep "^enabled=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
        if [ "$enabled" = "1" ]; then
            algorithm=$(grep "^algorithm=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
            size=$(grep "^size=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
            swappiness=$(grep "^swappiness=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
            zram_writeback=$(grep "^zram_writeback=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
            
            swapoff /dev/block/zram0 2>/dev/null
            echo 1 > /sys/block/zram0/reset 2>/dev/null
            
            bd_path=/sys/block/zram0/backing_dev
            if [ -f /sys/block/zram0/hybridswap_loop_device ]; then
                bd_path=/sys/block/zram0/hybridswap_loop_device
            fi
            if [ -f "$bd_path" ]; then
                if [ "$zram_writeback" = "true" ]; then
                    echo 0 > /sys/block/zram0/writeback_limit_enable 2>/dev/null
                elif [ "$zram_writeback" = "false" ]; then
                    echo none > "$bd_path" 2>/dev/null
                    echo 1 > /sys/block/zram0/writeback_limit_enable 2>/dev/null
                    echo 0 > /sys/block/zram0/writeback_limit 2>/dev/null
                fi
            fi
            
            if [ -n "$algorithm" ]; then
                echo "$algorithm" > /sys/block/zram0/comp_algorithm 2>/dev/null
            fi
            
            if [ -n "$size" ]; then
                echo "$size" > /sys/block/zram0/disksize 2>/dev/null
            fi
            
            mkswap /dev/block/zram0 2>/dev/null
            swapon /dev/block/zram0 -p 32758 2>/dev/null || swapon /dev/block/zram0 2>/dev/null
            
            if [ -n "$swappiness" ]; then
                echo "$swappiness" > /proc/sys/vm/swappiness 2>/dev/null
            fi
        fi
    fi
}

apply_swap_config() {
    if [ -f "$CONFIG_DIR/swap.conf" ]; then
        enabled=$(grep "^enabled=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
        size=$(grep "^size=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
        priority=$(grep "^priority=" "$CONFIG_DIR/swap.conf" | cut -d'=' -f2)
        swapfile="/data/swapfile"
        if [ "$enabled" = "1" ] && [ -n "$size" ]; then
            if [ -f "$swapfile" ]; then
                current_size=$(($(stat -c %s "$swapfile" 2>/dev/null || echo 0) / 1024 / 1024))
                if [ "$current_size" != "$size" ]; then
                    swapoff "$swapfile" 2>/dev/null
                    rm -f "$swapfile"
                fi
            fi
            if [ ! -f "$swapfile" ]; then
                dd if=/dev/zero of="$swapfile" bs=1M count="$size" 2>/dev/null
                chmod 600 "$swapfile"
            fi
            mkswap "$swapfile" 2>/dev/null
            if [ -n "$priority" ] && [ "$priority" != "0" ]; then
                swapon "$swapfile" -p "$priority" 2>/dev/null
            else
                swapon "$swapfile" 2>/dev/null
            fi
        else
            swapoff "$swapfile" 2>/dev/null
        fi
    fi
}

apply_vm_config() {
    if [ -f "$CONFIG_DIR/vm.conf" ]; then
        watermark=$(grep "^watermark_scale_factor=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
        extra_free=$(grep "^extra_free_kbytes=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
        dirty_ratio=$(grep "^dirty_ratio=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
        dirty_bg=$(grep "^dirty_background_ratio=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
        vfs_pressure=$(grep "^vfs_cache_pressure=" "$CONFIG_DIR/vm.conf" | cut -d'=' -f2)
        
        [ -n "$watermark" ] && echo "$watermark" > /proc/sys/vm/watermark_scale_factor 2>/dev/null
        [ -n "$extra_free" ] && echo "$extra_free" > /proc/sys/vm/extra_free_kbytes 2>/dev/null
        [ -n "$dirty_ratio" ] && echo "$dirty_ratio" > /proc/sys/vm/dirty_ratio 2>/dev/null
        [ -n "$dirty_bg" ] && echo "$dirty_bg" > /proc/sys/vm/dirty_background_ratio 2>/dev/null
        [ -n "$vfs_pressure" ] && echo "$vfs_pressure" > /proc/sys/vm/vfs_cache_pressure 2>/dev/null
    fi
}

apply_kernel_features_config() {
    if [ -f "$CONFIG_DIR/kernel.conf" ]; then
        lru_gen=$(grep "^lru_gen=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
        thp=$(grep "^thp=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
        ksm=$(grep "^ksm=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
        compaction=$(grep "^compaction=" "$CONFIG_DIR/kernel.conf" | cut -d'=' -f2)
        
        if [ -f /sys/kernel/mm/lru_gen/enabled ] && [ -n "$lru_gen" ]; then
            if [ "$lru_gen" = "1" ]; then
                echo Y > /sys/kernel/mm/lru_gen/enabled 2>/dev/null
            else
                echo N > /sys/kernel/mm/lru_gen/enabled 2>/dev/null
            fi
        fi
        
        if [ -f /sys/kernel/mm/transparent_hugepage/enabled ] && [ -n "$thp" ]; then
            echo "$thp" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
        fi
        
        if [ -f /sys/kernel/mm/ksm/run ] && [ -n "$ksm" ]; then
            echo "$ksm" > /sys/kernel/mm/ksm/run 2>/dev/null
        fi
        
        if [ -f /proc/sys/vm/compaction_proactiveness ] && [ -n "$compaction" ]; then
            if [ "$compaction" = "1" ]; then
                echo 20 > /proc/sys/vm/compaction_proactiveness 2>/dev/null
            else
                echo 0 > /proc/sys/vm/compaction_proactiveness 2>/dev/null
            fi
        fi
    fi
}

apply_le9ec_config() {
    if [ -f "$CONFIG_DIR/le9ec.conf" ]; then
        enabled=$(grep "^enabled=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
        if [ "$enabled" = "1" ]; then
            anon_min=$(grep "^anon_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            clean_low=$(grep "^clean_low=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            clean_min=$(grep "^clean_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            
            [ -n "$anon_min" ] && echo "$anon_min" > /proc/sys/vm/anon_min_kbytes 2>/dev/null
            [ -n "$clean_low" ] && echo "$clean_low" > /proc/sys/vm/clean_low_kbytes 2>/dev/null
            [ -n "$clean_min" ] && echo "$clean_min" > /proc/sys/vm/clean_min_kbytes 2>/dev/null
        fi
    fi
}

is_corona_kernel() {
    uname -r | grep -qi "corona"
}

apply_io_config() {
    if [ -f "$CONFIG_DIR/io_scheduler.conf" ]; then
        scheduler=$(grep "^scheduler=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
        readahead=$(grep "^readahead=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
        
        if [ -n "$scheduler" ]; then
            if is_corona_kernel; then
                scheduler="kernel:$scheduler"
            fi
            for f in /sys/block/*/queue/scheduler; do
                echo "$scheduler" > "$f" 2>/dev/null
            done
        fi
        
        if [ -n "$readahead" ]; then
            for f in /sys/block/*/queue/read_ahead_kb; do
                echo "$readahead" > "$f" 2>/dev/null
            done
        fi
    fi
}

apply_cpu_governor_config() {
    if [ -f "$CONFIG_DIR/cpu_governor.conf" ]; then
        governor=$(grep "^governor=" "$CONFIG_DIR/cpu_governor.conf" | cut -d'=' -f2)
        if [ -n "$governor" ]; then
            for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
                echo "$governor" > "$f" 2>/dev/null
            done
        fi
    fi
}

apply_cpu_hotplug_config() {
    if [ -f "$CONFIG_DIR/cpu_hotplug.conf" ]; then
        while IFS='=' read -r cpu state; do
            if [ -n "$cpu" ] && [ -n "$state" ]; then
                cpu_num=$(echo "$cpu" | sed 's/cpu//')
                if [ "$cpu_num" != "0" ]; then
                    echo "$state" > "/sys/devices/system/cpu/$cpu/online" 2>/dev/null
                fi
            fi
        done < "$CONFIG_DIR/cpu_hotplug.conf"
    fi
}

apply_tcp_config() {
    if [ -f "$CONFIG_DIR/tcp.conf" ]; then
        congestion=$(grep "^congestion=" "$CONFIG_DIR/tcp.conf" | cut -d'=' -f2)
        if [ -n "$congestion" ]; then
            echo "$congestion" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null
        fi
    fi
}

cpu_mask_to_hex() {
    mask_str="$1"
    result=0
    
    IFS=','
    for part in $mask_str; do
        if echo "$part" | grep -q "-"; then
            start=$(echo "$part" | cut -d'-' -f1)
            end=$(echo "$part" | cut -d'-' -f2)
            i=$start
            while [ "$i" -le "$end" ]; do
                result=$((result | (1 << i)))
                i=$((i + 1))
            done
        else
            result=$((result | (1 << part)))
        fi
    done
    unset IFS
    
    printf "0x%x" "$result"
}

apply_affinity_to_process() {
    process_name="$1"
    cpu_mask="$2"
    
    hex_mask=$(cpu_mask_to_hex "$cpu_mask")
    
    pids=$(pgrep -f "$process_name" 2>/dev/null)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            taskset -p "$hex_mask" "$pid" 2>/dev/null
        done
    fi
}

apply_cpu_affinity_config() {
    if [ -f "$CONFIG_DIR/cpu_affinity.conf" ]; then
        while IFS='=' read -r process_name cpu_mask; do
            if [ -n "$process_name" ] && [ -n "$cpu_mask" ]; then
                apply_affinity_to_process "$process_name" "$cpu_mask"
            fi
        done < "$CONFIG_DIR/cpu_affinity.conf"
    fi
}

apply_priority_to_process() {
    process_name="$1"
    nice_val="$2"
    io_class="$3"
    io_level="$4"
    
    pids=$(pgrep -f "$process_name" 2>/dev/null)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            renice -n "$nice_val" -p "$pid" 2>/dev/null
            ionice -c "$io_class" -n "$io_level" -p "$pid" 2>/dev/null
        done
    fi
}

apply_process_priority_config() {
    if [ -f "$CONFIG_DIR/process_priority.conf" ]; then
        while IFS='=' read -r process_name values; do
            if [ -n "$process_name" ] && [ -n "$values" ]; then
                nice_val=$(echo "$values" | cut -d',' -f1)
                io_class=$(echo "$values" | cut -d',' -f2)
                io_level=$(echo "$values" | cut -d',' -f3)
                apply_priority_to_process "$process_name" "$nice_val" "$io_class" "$io_level"
            fi
        done < "$CONFIG_DIR/process_priority.conf"
    fi
}

apply_freq_lock_config() {
    if [ -f "$CONFIG_DIR/freq_lock.conf" ]; then
        mode=$(grep "^mode=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
        
        if [ "$mode" = "global" ]; then
            min_freq=$(grep "^global_min=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
            max_freq=$(grep "^global_max=" "$CONFIG_DIR/freq_lock.conf" | cut -d'=' -f2)
            if [ -n "$min_freq" ] && [ -n "$max_freq" ]; then
                for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; do
                    echo "$min_freq" > "$f" 2>/dev/null
                done
                for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; do
                    echo "$max_freq" > "$f" 2>/dev/null
                done
            fi
        elif [ "$mode" = "per-core" ]; then
            grep "^core" "$CONFIG_DIR/freq_lock.conf" | while IFS='=' read -r key values; do
                core_num=$(echo "$key" | sed 's/core//')
                min_freq=$(echo "$values" | cut -d',' -f1)
                max_freq=$(echo "$values" | cut -d',' -f2)
                if [ -n "$min_freq" ] && [ -n "$max_freq" ]; then
                    echo "$min_freq" > "/sys/devices/system/cpu/cpu${core_num}/cpufreq/scaling_min_freq" 2>/dev/null
                    echo "$max_freq" > "/sys/devices/system/cpu/cpu${core_num}/cpufreq/scaling_max_freq" 2>/dev/null
                fi
            done
        fi
    fi
}

apply_user_scripts() {
    if [ -f "$CONFIG_DIR/user_scripts.sh" ]; then
        chmod 755 "$CONFIG_DIR/user_scripts.sh"
        sh "$CONFIG_DIR/user_scripts.sh" 2>/dev/null &
    fi
}


wait_until_boot_complete
wait_until_login
sleep 10

mkdir -p "$CONFIG_DIR"

apply_zram_config
sleep 5

apply_swap_config
sleep 5

apply_vm_config
sleep 3

apply_kernel_features_config
sleep 3

apply_le9ec_config
sleep 5

apply_io_config
sleep 5

apply_cpu_governor_config
sleep 5

apply_cpu_hotplug_config
sleep 5

apply_tcp_config
sleep 5

apply_cpu_affinity_config
sleep 5

apply_process_priority_config
sleep 5

apply_freq_lock_config

sleep 5

apply_user_scripts

sleep 30
apply_cpu_affinity_config
sleep 2
apply_process_priority_config
sleep 2
apply_freq_lock_config

start_auto_clean() {
    while true; do
        sleep 3600
        if [ -f "$CONFIG_DIR/autoclean.conf" ]; then
            enabled=$(grep "^enabled=" "$CONFIG_DIR/autoclean.conf" | cut -d'=' -f2)
            if [ "$enabled" = "1" ]; then
                sync
                echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
                sed -i "s/last_clean=.*/last_clean=$(date +%s)000/" "$CONFIG_DIR/autoclean.conf"
            fi
        fi
    done
}

start_auto_clean &
