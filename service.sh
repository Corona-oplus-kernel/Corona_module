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
            
            swapoff /dev/block/zram0 2>/dev/null
            echo 1 > /sys/block/zram0/reset 2>/dev/null
            
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

apply_le9ec_config() {
    if [ -f "$CONFIG_DIR/le9ec.conf" ]; then
        enabled=$(grep "^enabled=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
        if [ "$enabled" = "1" ]; then
            anon_min=$(grep "^anon_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            clean_low=$(grep "^clean_low=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            clean_min=$(grep "^clean_min=" "$CONFIG_DIR/le9ec.conf" | cut -d'=' -f2)
            
            if [ -n "$anon_min" ]; then
                echo "$anon_min" > /proc/sys/vm/anon_min_kbytes 2>/dev/null
            fi
            if [ -n "$clean_low" ]; then
                echo "$clean_low" > /proc/sys/vm/clean_low_kbytes 2>/dev/null
            fi
            if [ -n "$clean_min" ]; then
                echo "$clean_min" > /proc/sys/vm/clean_min_kbytes 2>/dev/null
            fi
        fi
    fi
}

apply_io_config() {
    if [ -f "$CONFIG_DIR/io_scheduler.conf" ]; then
        scheduler=$(grep "^scheduler=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
        readahead=$(grep "^readahead=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
        
        if [ -n "$scheduler" ]; then
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

wait_until_boot_complete
wait_until_login
sleep 10

mkdir -p "$CONFIG_DIR"

apply_zram_config
sleep 1

apply_le9ec_config
sleep 1

apply_io_config
sleep 1

apply_cpu_governor_config
sleep 1

apply_cpu_hotplug_config
sleep 1

apply_tcp_config
sleep 1

apply_cpu_affinity_config
sleep 1

apply_process_priority_config

sleep 30
apply_cpu_affinity_config
apply_process_priority_config
