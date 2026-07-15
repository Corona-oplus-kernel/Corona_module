#!/system/bin/sh
SKIPMOUNT=true
PROPFILE=false
POSTFSDATA=false

BRAND=$(getprop ro.product.brand | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(getprop ro.product.manufacturer | tr '[:upper:]' '[:lower:]')
if [ "$BRAND" != "oneplus" ] && [ "$MANUFACTURER" != "oneplus" ] && [ "$BRAND" != "oplus" ] && [ "$MANUFACTURER" != "oplus" ]; then
    ui_print "================================================"
    ui_print " 错误：此模块仅支持 OnePlus/一加 设备"
    ui_print " 当前品牌: $(getprop ro.product.brand)"
    ui_print "================================================"
    abort "不支持的设备，安装中止"
fi

MODULE_NAME=$(grep -E '^name=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
MODULE_VERSION=$(grep -E '^version=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
ui_print "================================================"
ui_print " ${MODULE_NAME} ${MODULE_VERSION}"
ui_print "================================================"
set_perm_recursive $MODPATH 0 0 0755 0644
chmod 755 "$MODPATH/customize.sh" 2>/dev/null
chmod 755 "$MODPATH/service.sh" 2>/dev/null
chmod 755 "$MODPATH/uninstall.sh" 2>/dev/null
chmod 755 "$MODPATH/app_policy.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/zram-writeback.sh" 2>/dev/null
chmod 755 "$MODPATH/scripts/apply-loop.sh" 2>/dev/null
chmod 755 "$MODPATH/odm/etc/init.oplus.mm-sys.sh" 2>/dev/null
chmod 755 "$MODPATH"/app_policy/*.sh 2>/dev/null
mem_total_str=$(cat /proc/meminfo | grep MemTotal)
mem_total_kb=${mem_total_str:16:8}
mem_total_gb=$(((mem_total_kb/1024+2047)/2048*2))
ui_print "- RAM: ${mem_total_gb}GB"

OLD_MODDIR="/data/adb/modules/Corona"
mkdir -p "$MODPATH/config"
mkdir -p "$MODPATH/scripts.d"
if [ -x "$OLD_MODDIR/app_policy.sh" ]; then
    /system/bin/sh "$OLD_MODDIR/app_policy.sh" daemon-stop >/dev/null 2>&1
elif [ -f "$OLD_MODDIR/.app_policy_daemon.pid" ]; then
    old_daemon_pid=$(cat "$OLD_MODDIR/.app_policy_daemon.pid" 2>/dev/null)
    [ -n "$old_daemon_pid" ] && kill -TERM "$old_daemon_pid" 2>/dev/null
fi
if [ -d "$OLD_MODDIR/config" ]; then
    ui_print "- 迁移已有配置"
    cp -af "$OLD_MODDIR/config/." "$MODPATH/config/"
fi
if [ -d "$OLD_MODDIR/scripts.d" ]; then
    cp -af "$OLD_MODDIR/scripts.d/." "$MODPATH/scripts.d/"
fi

rm -rf "$MODPATH/.app_policy_effective" "$MODPATH"/.app_policy_effective.next.*
rm -f "$MODPATH/.app_policy_daemon.pid" "$MODPATH/.app_policy_state"
rm -rf "$MODPATH/scripts.d/.logs"
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
