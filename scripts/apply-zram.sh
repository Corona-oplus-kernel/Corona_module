#!/system/bin/sh
MODDIR=${0%/*}
MODDIR=${MODDIR%/scripts}
MM_SYS_SCRIPT="$MODDIR/scripts/init.oplus.mm-sys.sh"
ZRAM_CONF="$MODDIR/config/zram.conf"
LOOP_CONF="$MODDIR/config/loop.conf"

official_zram_ready() {
  awk 'NR > 1 { dev=$1; sub(/^.*\//, "", dev); if (dev ~ /^zram[0-9]+$/) { found=1; exit } } END { exit found ? 0 : 1 }' /proc/swaps 2>/dev/null
}

wait_for_official_zram() {
  official_zram_ready && return 0
  setprop ctl.start init.oplus.nandswap.sh 2>/dev/null
  local attempt=0
  while [ "$attempt" -lt 20 ]; do
    sleep 1
    official_zram_ready && return 0
    attempt=$((attempt + 1))
  done
  return 1
}

wait_for_official_zram || exit 1
[ -f "$MM_SYS_SCRIPT" ] && /system/bin/sh "$MM_SYS_SCRIPT" --zram-only >/dev/null 2>&1
