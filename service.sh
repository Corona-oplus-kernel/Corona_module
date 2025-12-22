#!/system/bin/sh
MODDIR=${0%/*}
CONFIG_DIR="$MODDIR/config"

until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 1; done
sleep 5

mkdir -p "$CONFIG_DIR"

sleep 10
if [ -f "$CONFIG_DIR/zram.conf" ]; then
    enabled=$(grep "^enabled=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
    if [ "$enabled" = "1" ]; then
        algorithm=$(grep "^algorithm=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
        size=$(grep "^size=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
        swappiness=$(grep "^swappiness=" "$CONFIG_DIR/zram.conf" | cut -d'=' -f2)
        su -c insmod $MODDIR/zsmalloc.ko
        sleep 3
        su -c insmod $MODDIR/zram.ko
        sleep 2        
        swapoff /dev/block/zram0 2>/dev/null
        echo 1 > /sys/block/zram0/reset 2>/dev/null
        echo "${algorithm:-lz4}" > /sys/block/zram0/comp_algorithm 2>/dev/null
        echo "${size:-4294967296}" > /sys/block/zram0/disksize 2>/dev/null
        mkswap /dev/block/zram0 2>/dev/null
        swapon /dev/block/zram0 -p 32758 2>/dev/null || swapon /dev/block/zram0 2>/dev/null
        echo "${swappiness:-100}" > /proc/sys/vm/swappiness 2>/dev/null
    fi
fi

sleep 10
if [ -f "$CONFIG_DIR/io_scheduler.conf" ]; then
    scheduler=$(grep "^scheduler=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    readahead=$(grep "^readahead=" "$CONFIG_DIR/io_scheduler.conf" | cut -d'=' -f2)
    [ -n "$scheduler" ] && for f in /sys/block/*/queue/scheduler; do echo "$scheduler" > "$f" 2>/dev/null; done
    [ -n "$readahead" ] && for f in /sys/block/*/queue/read_ahead_kb; do echo "$readahead" > "$f" 2>/dev/null; done
fi

sleep 10
if [ -f "$CONFIG_DIR/cpu_governor.conf" ]; then
    governor=$(grep "^governor=" "$CONFIG_DIR/cpu_governor.conf" | cut -d'=' -f2)
    [ -n "$governor" ] && for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo "$governor" > "$f" 2>/dev/null; done
fi

sleep 10
if [ -f "$CONFIG_DIR/tcp.conf" ]; then
    congestion=$(grep "^congestion=" "$CONFIG_DIR/tcp.conf" | cut -d'=' -f2)
    [ -n "$congestion" ] && echo "$congestion" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null
fi

sleep 10
if [ -f "$CONFIG_DIR/cpu_hotplug.conf" ]; then
    while IFS='=' read -r key value; do
        [ -z "$key" ] && continue
        cpu_id=$(echo "$key" | grep -o '[0-9]*')
        [ -n "$cpu_id" ] && [ "$cpu_id" != "0" ] && echo "$value" > /sys/devices/system/cpu/cpu${cpu_id}/online 2>/dev/null
    done < "$CONFIG_DIR/cpu_hotplug.conf"
fi

sleep 10
zram_desc="ZRAM:关闭"
[ -f /sys/block/zram0/comp_algorithm ] && {
    alg=$(cat /sys/block/zram0/comp_algorithm 2>/dev/null | grep -o '\[.*\]' | tr -d '[]')
    [ -n "$alg" ] && zram_desc="ZRAM:$alg"
}
io_desc=$(cat /sys/block/sda/queue/scheduler 2>/dev/null || cat /sys/block/mmcblk0/queue/scheduler 2>/dev/null)
io_desc=$(echo "$io_desc" | grep -o '\[.*\]' | tr -d '[]')
cpu_desc=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null)
tcp_desc=$(cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null)

desc="$zram_desc | IO:${io_desc:---} | CPU:${cpu_desc:---} | TCP:${tcp_desc:---}"
sed -i "s/^description=.*/description=$desc/" "$MODDIR/module.prop" 2>/dev/null