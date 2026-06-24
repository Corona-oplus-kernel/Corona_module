#!/system/bin/sh
MODDIR=${0%/*}

BRAND=$(getprop ro.product.brand | tr '[:upper:]' '[:lower:]')
MANUFACTURER=$(getprop ro.product.manufacturer | tr '[:upper:]' '[:lower:]')
if [ "$BRAND" != "oneplus" ] && [ "$MANUFACTURER" != "oneplus" ] && [ "$BRAND" != "oplus" ] && [ "$MANUFACTURER" != "oplus" ]; then
    touch "$MODDIR/disable"
    exit 0
fi

ODM_SCRIPT="$MODDIR/odm/etc/init.oplus.mm-sys.sh"
TARGET="/odm/etc/init.oplus.mm-sys.sh"
if [ -f "$ODM_SCRIPT" ] && [ -f "$TARGET" ]; then
    mount --bind "$ODM_SCRIPT" "$TARGET" 2>/dev/null
fi
