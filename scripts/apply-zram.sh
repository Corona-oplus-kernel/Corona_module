#!/system/bin/sh
MODDIR=${0%/*}
MODDIR=${MODDIR%/scripts}
MM_SYS_SCRIPT="$MODDIR/scripts/init.oplus.mm-sys.sh"
ZRAM_CONF="$MODDIR/config/zram.conf"

[ -f "$MM_SYS_SCRIPT" ] && /system/bin/sh "$MM_SYS_SCRIPT" >/dev/null 2>&1
writeback_mode=$(grep -m1 '^zram_writeback=' "$ZRAM_CONF" 2>/dev/null | cut -d'=' -f2-)
if [ -z "$writeback_mode" ] || [ "$writeback_mode" = "default" ]; then
  [ -f /product/bin/init.oplus.nandswap.sh ] && /system/bin/sh /product/bin/init.oplus.nandswap.sh boot_completed >/dev/null 2>&1
fi
