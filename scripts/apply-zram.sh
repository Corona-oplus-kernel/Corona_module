#!/system/bin/sh
MODDIR=${0%/*}
MODDIR=${MODDIR%/scripts}
MM_SYS_SCRIPT="$MODDIR/scripts/init.oplus.mm-sys.sh"

[ -f /product/bin/init.oplus.nandswap.sh ] && /system/bin/sh /product/bin/init.oplus.nandswap.sh boot_completed >/dev/null 2>&1
[ -f "$MM_SYS_SCRIPT" ] && /system/bin/sh "$MM_SYS_SCRIPT" >/dev/null 2>&1
