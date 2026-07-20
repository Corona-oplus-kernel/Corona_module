#!/system/bin/sh
SKIPMOUNT=true
PROPFILE=false
POSTFSDATA=false

DEVICE_BRAND=$(getprop ro.product.brand)
DEVICE_MANUFACTURER=$(getprop ro.product.manufacturer)
BRAND=$(printf '%s' "$DEVICE_BRAND" | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(printf '%s' "$DEVICE_MANUFACTURER" | tr '[:upper:]' '[:lower:]')
is_supported_brand() {
    case "$1" in
        oneplus|oplus|oppo|realme) return 0 ;;
        *) return 1 ;;
    esac
}
if ! is_supported_brand "$BRAND" && ! is_supported_brand "$MANUFACTURER"; then
    ui_print "================================================"
    ui_print " 错误：此模块仅支持 OPPO / 一加 / 真我 设备"
    ui_print " 当前品牌: $DEVICE_BRAND"
    ui_print "================================================"
    abort "不支持的设备，安装中止"
fi

MODULE_NAME=$(grep -E '^name=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
MODULE_VERSION=$(grep -E '^version=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
ui_print "================================================"
ui_print " ${MODULE_NAME} ${MODULE_VERSION}"
ui_print "================================================"
DEVICE_NAME=$(getprop ro.vendor.oplus.market.name)
[ -n "$DEVICE_NAME" ] || DEVICE_NAME=$(getprop ro.product.model)
ANDROID_VERSION=$(getprop ro.build.version.release)
ANDROID_SDK=$(getprop ro.build.version.sdk)
KERNEL_VERSION=$(uname -r)
ZRAM_BLOCK=$(basename "$(ls -d /sys/block/zram* 2>/dev/null | head -n 1)")
[ -n "$ZRAM_BLOCK" ] && [ -f "/sys/block/$ZRAM_BLOCK/recomp_algorithm" ] && ZRAM_RECOMP=是 || ZRAM_RECOMP=否
[ -n "$ZRAM_BLOCK" ] && { [ -f "/sys/block/$ZRAM_BLOCK/hybridswap_loop_device" ] || [ -f "/sys/block/$ZRAM_BLOCK/backing_dev" ]; } && ZRAM_WRITEBACK=是 || ZRAM_WRITEBACK=否
[ -r /proc/pressure/memory ] && PSI_SUPPORT=是 || PSI_SUPPORT=否
if [ -d /proc/oplus_mem ] || [ -d /proc/oplus_healthinfo ] || [ -d /proc/oplus_qos_sched ]; then
    OPLUS_EXTENSIONS=是
else
    OPLUS_EXTENSIONS=否
fi
ui_print "- 设备: ${DEVICE_BRAND:-未知} ${DEVICE_NAME:-未知}"
[ -n "$DEVICE_MANUFACTURER" ] && [ "$DEVICE_MANUFACTURER" != "$DEVICE_BRAND" ] && ui_print "- 制造商: $DEVICE_MANUFACTURER"
ui_print "- 系统: Android ${ANDROID_VERSION:-未知} (SDK ${ANDROID_SDK:-未知})"
ui_print "- 内核: ${KERNEL_VERSION:-未知}"
ui_print "- 能力: ZRAM重压缩=$ZRAM_RECOMP ZRAM回写=$ZRAM_WRITEBACK"
ui_print "- 能力: PSI=$PSI_SUPPORT OPlus扩展=$OPLUS_EXTENSIONS"
set_perm_recursive $MODPATH 0 0 0755 0644
chmod 755 "$MODPATH/customize.sh" 2>/dev/null
chmod 755 "$MODPATH/service.sh" 2>/dev/null
chmod 755 "$MODPATH/uninstall.sh" 2>/dev/null
chmod 755 "$MODPATH/app_policy.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/zram-writeback.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/apply-loop.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/memory-pressure.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/auto-affinity.sh" 2>/dev/null
chmod 755 "$MODPATH/bin/coronad" 2>/dev/null
chmod 755 "$MODPATH/odm/etc/init.oplus.mm-sys.sh" 2>/dev/null
chmod 755 "$MODPATH"/app_policy/*.sh 2>/dev/null
find "$MODPATH" -type f -name '*.log' -delete 2>/dev/null
rm -rf "$MODPATH/scripts.d/.logs"
mem_total_str=$(cat /proc/meminfo | grep MemTotal)
mem_total_kb=${mem_total_str:16:8}
mem_total_gb=$(((mem_total_kb/1024+2047)/2048*2))
ui_print "- RAM: ${mem_total_gb}GB"

is_legacy_default_auto_affinity() {
    legacy_config="$1"
    [ -f "$legacy_config" ] || return 1
    for expected in \
        enabled=1 \
        ebpf=1 \
        default_class=balanced \
        exclude_packages= \
        scan_interval_ms=1000 \
        load_learning=1 \
        thermal_control=1 \
        thermal_warm_c=75 \
        thermal_severe_c=100; do
        grep -qx "$expected" "$legacy_config" || return 1
    done
    grep -Ev '^(enabled=1|ebpf=1|default_class=balanced|efficiency_cpus=|balanced_cpus=|performance_cpus=|exclude_packages=|scan_interval_ms=1000|load_learning=1|thermal_control=1|thermal_warm_c=75|thermal_severe_c=100|[[:space:]]*)$' "$legacy_config" | grep -q . && return 1
    return 0
}

OLD_MODDIR="/data/adb/modules/Corona"
mkdir -p "$MODPATH/config"
mkdir -p "$MODPATH/scripts.d"
if [ -x "$OLD_MODDIR/app_policy.sh" ]; then
    /system/bin/sh "$OLD_MODDIR/app_policy.sh" daemon-stop >/dev/null 2>&1
else
    old_daemon_pid_file="$OLD_MODDIR/config/.app_policy_daemon.pid"
    [ -f "$old_daemon_pid_file" ] || old_daemon_pid_file="$OLD_MODDIR/.app_policy_daemon.pid"
    old_daemon_pid=$(cat "$old_daemon_pid_file" 2>/dev/null)
    [ -n "$old_daemon_pid" ] && kill -TERM "$old_daemon_pid" 2>/dev/null
fi
if [ -d "$OLD_MODDIR/config" ]; then
    ui_print "- 迁移已有配置"
    cp -af "$OLD_MODDIR/config/." "$MODPATH/config/"
fi
if [ -d "$OLD_MODDIR/scripts.d" ]; then
    cp -af "$OLD_MODDIR/scripts.d/." "$MODPATH/scripts.d/"
fi
if is_legacy_default_auto_affinity "$MODPATH/config/auto_affinity.conf"; then
    rm -f "$MODPATH/config/auto_affinity.conf" "$MODPATH/config/.auto_affinity_state"
    ui_print "- 移除旧版默认自动优化配置"
fi

rm -rf "$MODPATH/config/.app_policy_effective" "$MODPATH/config"/.app_policy_effective.next.* "$MODPATH/.app_policy_effective" "$MODPATH"/.app_policy_effective.next.*
rm -f "$MODPATH/config/.app_policy_daemon.pid" "$MODPATH/config/.app_policy_state" "$MODPATH/.app_policy_daemon.pid" "$MODPATH/.app_policy_state"
find "$MODPATH/config" -type f \( -name '*.tmp.*' -o -name '*.bak' \) -delete 2>/dev/null

get_config_value() {
    [ -f "$1" ] && grep -m1 "^$2=" "$1" 2>/dev/null | cut -d'=' -f2-
}

zram_conf="$MODPATH/config/zram.conf"
loop_conf="$MODPATH/config/loop.conf"
if [ ! -f "$loop_conf" ] && [ -f "$zram_conf" ]; then
    legacy_loop=$(get_config_value "$zram_conf" zram_writeback)
    legacy_size=$(get_config_value "$zram_conf" writeback_size_mb)
    : > "$loop_conf"
    case "$legacy_loop" in
        true|1) printf 'enabled=1\n' >> "$loop_conf" ;;
        false|0) printf 'enabled=0\n' >> "$loop_conf" ;;
    esac
    case "$legacy_size" in ''|*[!0-9]*) ;; *) printf 'size_mb=%s\n' "$legacy_size" >> "$loop_conf" ;; esac
    [ -s "$loop_conf" ] || rm -f "$loop_conf"
fi
if [ -f "$loop_conf" ]; then
    loop_enabled=$(get_config_value "$loop_conf" enabled)
    loop_size=$(get_config_value "$loop_conf" size_mb)
    : > "$loop_conf"
    case "$loop_enabled" in 1|0) printf 'enabled=%s\n' "$loop_enabled" >> "$loop_conf" ;; esac
    case "$loop_size" in ''|*[!0-9]*) ;; *) printf 'size_mb=%s\n' "$loop_size" >> "$loop_conf" ;; esac
    [ -s "$loop_conf" ] || rm -f "$loop_conf"
fi
[ -f "$zram_conf" ] && sed -i '/^zram_writeback=/d;/^writeback_size_mb=/d' "$zram_conf"

ui_print "- Done"

touch "$MODPATH/scripts.d/.placeholder"
cat > "$MODPATH/config/runtime.conf" <<EOI
module_id=$(grep -E '^id=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
module_name=$MODULE_NAME
swapfile_path=$MODPATH/swapfile.img
EOI

if [ -d "$OLD_MODDIR" ] && [ -f "$OLD_MODDIR/module.prop" ]; then
    sed -i 's|^description=.*|description=等待重启|' "$MODPATH/module.prop"
else
    sed -i 's|^description=.*|description=等待首次设置……|' "$MODPATH/module.prop"
fi
