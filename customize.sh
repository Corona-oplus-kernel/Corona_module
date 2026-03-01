#!/system/bin/sh
SKIPMOUNT=false
PROPFILE=false
POSTFSDATA=false
MODULE_NAME=$(grep -E '^name=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
MODULE_VERSION=$(grep -E '^version=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
ui_print "================================================"
ui_print " ${MODULE_NAME} ${MODULE_VERSION}"
ui_print "================================================"
set_perm_recursive $MODPATH 0 0 0755 0644
mem_total_str=$(cat /proc/meminfo | grep MemTotal)
mem_total_kb=${mem_total_str:16:8}
mem_total_gb=$(((mem_total_kb/1024+2047)/2048*2))
ui_print "- RAM: ${mem_total_gb}GB"
ui_print "- Done"

mkdir -p "$MODPATH/config"
cat > "$MODPATH/config/runtime.conf" <<EOF
module_id=$(grep -E '^id=' "${MODPATH}/module.prop" | cut -d'=' -f2-)
module_name=$MODULE_NAME
swapfile_path=$MODPATH/swapfile.img
EOF

DESC_TEXT='description="等待首次设置……"'
if [ -f "$MODPATH/module.prop" ]; then
    if grep -q '^description=' "$MODPATH/module.prop"; then
        sed -i "s|^description=.*|$DESC_TEXT|" "$MODPATH/module.prop"
    fi
fi
