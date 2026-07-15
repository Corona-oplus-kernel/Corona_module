#!/system/bin/sh
MODDIR=${0%/*}
MODDIR=${MODDIR%/scripts}
MM_SYS_SCRIPT="$MODDIR/scripts/init.oplus.mm-sys.sh"
ZRAM_CONF="$MODDIR/config/zram.conf"
LOOP_CONF="$MODDIR/config/loop.conf"

zram_enabled=$(grep -m1 '^enabled=' "$ZRAM_CONF" 2>/dev/null | cut -d'=' -f2-)
if [ "$zram_enabled" = "1" ] && ! grep -Eq '^(algorithm|recomp_algorithm[123]|zstd_compression_level|size|swappiness|zram_path)=' "$ZRAM_CONF" 2>/dev/null; then
  exit 0
fi

[ -f "$MM_SYS_SCRIPT" ] && /system/bin/sh "$MM_SYS_SCRIPT" >/dev/null 2>&1
writeback_mode=$(grep -m1 '^zram_writeback=' "$ZRAM_CONF" 2>/dev/null | cut -d'=' -f2-)
if [ ! -f "$LOOP_CONF" ] && { [ -z "$writeback_mode" ] || [ "$writeback_mode" = "default" ]; }; then
  [ -f /product/bin/init.oplus.nandswap.sh ] && /system/bin/sh /product/bin/init.oplus.nandswap.sh boot_completed >/dev/null 2>&1
fi
