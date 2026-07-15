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
chmod 755 "$MODPATH/odm/etc/init.oplus.mm-sys.sh" 2>/dev/null
chmod 755 "$MODPATH"/app_policy/*.sh 2>/dev/null
mem_total_str=$(cat /proc/meminfo | grep MemTotal)
mem_total_kb=${mem_total_str:16:8}
mem_total_gb=$(((mem_total_kb/1024+2047)/2048*2))
ui_print "- RAM: ${mem_total_gb}GB"

OLD_MODDIR="/data/adb/modules/Corona"
mkdir -p "$MODPATH/config"
mkdir -p "$MODPATH/scripts.d"
if [ -d "$OLD_MODDIR/config" ]; then
    ui_print "- 迁移已有配置"
    cp -af "$OLD_MODDIR/config/." "$MODPATH/config/"
fi
if [ -d "$OLD_MODDIR/scripts.d" ]; then
    cp -af "$OLD_MODDIR/scripts.d/." "$MODPATH/scripts.d/"
fi

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
