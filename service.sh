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
    is_xiaomi=0; [ "$(getprop ro.miui.ui.version.name)" != "" ] && is_xiaomi=1
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
sleep 10
get_system_info
mkdir -p "$CONFIG_DIR"

apply_io_config; sleep 1
apply_cpu_governor_config; sleep 1
apply_cpu_hotplug_config; sleep 1
apply_tcp_config; sleep 1
apply_process_priority_config; sleep 1
apply_device_config; sleep 1
apply_protect_config; sleep 1
apply_fstrim_config; sleep 1
run_user_scripts

sleep 30
apply_io_config
apply_cpu_governor_config
apply_process_priority_config
apply_protect_config

exit 0
