#!/system/bin/sh
MODDIR=${0%/*}
ODM_SCRIPT="$MODDIR/odm/etc/init.oplus.mm-sys.sh"
TARGET="/odm/etc/init.oplus.mm-sys.sh"
[ -f "$ODM_SCRIPT" ] || exit 0
[ -f "$TARGET" ] || exit 0

BRAND=$(getprop ro.product.brand | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(getprop ro.product.manufacturer | tr '[:upper:]' '[:lower:]')
if [ "$BRAND" != "oneplus" ] && [ "$MANUFACTURER" != "oneplus" ] && [ "$BRAND" != "oplus" ] && [ "$MANUFACTURER" != "oplus" ]; then
    touch "$MODDIR/disable"
    exit 0
fi

mount --bind "$ODM_SCRIPT" "$TARGET" 2>/dev/null
grep -F " $TARGET " /proc/self/mountinfo >/dev/null 2>&1 || mount --bind "$ODM_SCRIPT" "$TARGET" 2>/dev/null
