#!/system/bin/sh
SKIPMOUNT=false
PROPFILE=false
POSTFSDATA=false
LATESTARTSERVICE=true
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
is_oplus=0; find /proc -maxdepth 1 -name "oplus*" 2>/dev/null | grep -q . && is_oplus=1
is_xiaomi=0; [ "$(getprop ro.miui.ui.version.name)" != "" ] && is_xiaomi=1
[ "$is_oplus" = "1" ] && ui_print "- OPLUS/ColorOS"
[ "$is_xiaomi" = "1" ] && ui_print "- Xiaomi/MIUI/HyperOS"
ui_print "- Done"
