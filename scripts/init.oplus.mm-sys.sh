#!/system/bin/sh

readonly HYB_ERR_UNSUPPORTED=1004
readonly HYB_ERR_UNSET=1009
CORONA_CONFIG="/data/adb/modules/Corona/config"
for base in /data/adb/modules /data/adb/ksu/modules /data/adb/ap/modules; do
  [ -d "$base/Corona/config" ] || continue
  CORONA_CONFIG="$base/Corona/config"
  break
done
CORONA_MODDIR=${CORONA_CONFIG%/config}
WRITEBACK_HELPER="$CORONA_MODDIR/scripts/zram-writeback.sh"

corona_get() {
  local file="$CORONA_CONFIG/$1"
  local key="$2"
  [ -f "$file" ] && grep -m1 "^${key}=" "$file" | cut -d'=' -f2-
}

normalize_zram_path() {
  local requested_path="$1"
  if [ -n "$requested_path" ] && [ -e "$requested_path" ]; then
    echo "$requested_path"
    return 0
  fi
  local candidate
  for candidate in /dev/block/zram* /dev/zram*; do
    [ -e "$candidate" ] || continue
    echo "$candidate"
    return 0
  done
  return 1
}

get_zram_block() {
  local zram_block=${1##*/}
  [ -n "$zram_block" ] && [ -d "/sys/block/$zram_block" ] || return 1
  echo "$zram_block"
}

get_zram_priority() {
  awk -v dev="$1" 'BEGIN { sub(/^.*\//, "", dev) } NR > 1 { current=$1; sub(/^.*\//, "", current); if (current == dev) { print $5; exit } }' /proc/swaps 2>/dev/null
}

get_active_zram_algorithm() {
  local zram_block="$1"
  local alg_raw=$(/system/bin/cat "/sys/block/$zram_block/comp_algorithm" 2>/dev/null)
  local active=$(echo "$alg_raw" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
  [ -n "$active" ] && {
    echo "$active"
    return
  }
  echo "$alg_raw" | awk '{print $1}'
}

select_supported_zram_algorithm() {
  local zram_block="$1"
  local requested="${2#kernel:}"
  local available=$(/system/bin/cat "/sys/block/$zram_block/comp_algorithm" 2>/dev/null | tr -d '[]')
  local algo
  for algo in $available; do
    [ "$algo" = "$requested" ] && { echo "$requested"; return 0; }
  done
  for requested in lz4 lzo-rle lzo zstd; do
    for algo in $available; do
      [ "$algo" = "$requested" ] && { echo "$requested"; return 0; }
    done
  done
  echo "$available" | awk '{print $1}'
}

set_corona_config_value() {
  local file="$CORONA_CONFIG/$1"
  local key="$2"
  local value="$3"
  [ -f "$file" ] || return 0
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file" 2>/dev/null
  else
    echo "${key}=${value}" >> "$file"
  fi
}

apply_zram_primary_algorithm() {
  local zram_block="$1"
  local requested="${2#kernel:}"
  local selected=$(select_supported_zram_algorithm "$zram_block" "$requested")
  [ -n "$selected" ] || return 1
  echo "$selected" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null || return 1
  local active=$(get_active_zram_algorithm "$zram_block")
  active=${active#kernel:}
  if [ -z "$active" ] || [ "$active" != "$selected" ]; then
    selected=$(select_supported_zram_algorithm "$zram_block" lz4)
    [ -n "$selected" ] || return 1
    echo "$selected" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null || return 1
    active=$(get_active_zram_algorithm "$zram_block")
    active=${active#kernel:}
  fi
  [ -n "$active" ] || return 1
  [ "$active" = "$requested" ] || set_corona_config_value zram.conf algorithm "$active"
  echo "$active"
}

write_zram_swappiness() {
  local corona_swappiness="$1"
  local corona_direct_swappiness="$2"
  [ -n "$corona_swappiness" ] || [ -n "$corona_direct_swappiness" ] || return
  local spt_dir=/sys/module/swappiness_pressure_throttle/parameters
  if [ -n "$corona_swappiness" ] && [ -d "$spt_dir" ] && [ -f "$spt_dir/swappiness_idle" ]; then
    echo "$corona_swappiness" > "$spt_dir/swappiness_idle" 2>/dev/null
  fi
  local oplus_swappiness
  for oplus_swappiness in /proc/oplus_mem/swappiness_para /proc/oplus_healthinfo/swappiness_para; do
    [ -w "$oplus_swappiness" ] || continue
    [ -n "$corona_direct_swappiness" ] && echo "direct_swappiness=${corona_direct_swappiness}" > "$oplus_swappiness" 2>/dev/null
    [ -n "$corona_swappiness" ] && echo "vm_swappiness=${corona_swappiness}" > "$oplus_swappiness" 2>/dev/null
    break
  done
  [ -n "$corona_swappiness" ] || return
  [ -f /proc/sys/vm/swappiness ] && echo "$corona_swappiness" > /proc/sys/vm/swappiness 2>/dev/null
  [ -f /dev/memcg/memory.swappiness ] && echo "$corona_swappiness" > /dev/memcg/memory.swappiness 2>/dev/null
  [ -f /dev/memcg/apps/memory.swappiness ] && echo "$corona_swappiness" > /dev/memcg/apps/memory.swappiness 2>/dev/null
  [ -f /sys/module/zram_opt/parameters/vm_swappiness ] && echo "$corona_swappiness" > /sys/module/zram_opt/parameters/vm_swappiness 2>/dev/null
}

apply_zram_official_extensions() {
  local zram_block="$1"
  local direct_swappiness=$(corona_get zram.conf direct_swappiness)
  local zram_used_limit_mb=$(corona_get zram.conf zram_used_limit_mb)
  local hybridswap_zram_increase=$(corona_get zram.conf hybridswap_zram_increase)
  local hybridswap_quota_day=$(corona_get zram.conf hybridswap_quota_day)

  [ -n "$direct_swappiness" ] && write_zram_swappiness "" "$direct_swappiness"
  [ -n "$zram_used_limit_mb" ] && [ -w /dev/memcg/memory.zram_used_limit_mb ] && \
    echo "$zram_used_limit_mb" > /dev/memcg/memory.zram_used_limit_mb 2>/dev/null
  [ -n "$hybridswap_zram_increase" ] && [ -w "/sys/block/$zram_block/hybridswap_zram_increase" ] && \
    echo "$hybridswap_zram_increase" > "/sys/block/$zram_block/hybridswap_zram_increase" 2>/dev/null
  [ -n "$hybridswap_quota_day" ] && [ -w "/sys/block/$zram_block/hybridswap_quota_day" ] && \
    echo "$hybridswap_quota_day" > "/sys/block/$zram_block/hybridswap_quota_day" 2>/dev/null
}



apply_zstd_compression_level() {
  [ -f /sys/module/zstd/parameters/compression_level ] || return 0
  local level=$(corona_get zram.conf zstd_compression_level)
  [ -n "$level" ] || return 0
  echo "$level" > /sys/module/zstd/parameters/compression_level 2>/dev/null || return 1
}

apply_zram_recomp_algorithms() {
  local zram_block="$1"
  [ -f "/sys/block/$zram_block/recomp_algorithm" ] || return 0
  local i=1
  local algo
  while [ "$i" -le 3 ]; do
    algo=$(corona_get zram.conf "recomp_algorithm$i")
    if [ -n "$algo" ] && [ "$algo" != "none" ]; then
      echo "algo=$algo priority=$i" > "/sys/block/$zram_block/recomp_algorithm" 2>/dev/null || return 1
    fi
    i=$((i + 1))
  done
}

configure_zram_device() {
  local zram_path="$1"
  local size="$2"
  local comp_algorithm="$3"
  local zram_writeback="$4"
  local magic="$5"
  local zram_block=$(get_zram_block "$zram_path") || return 1

  /system/bin/swapoff "$zram_path" 2>/dev/null
  echo 1 > "/sys/block/$zram_block/reset" 2>/dev/null
  if [ -n "$comp_algorithm" ]; then
    comp_algorithm=$(apply_zram_primary_algorithm "$zram_block" "$comp_algorithm") || return 1
  fi
  apply_zram_recomp_algorithms "$zram_block"
  apply_zstd_compression_level
  if [ "$zram_writeback" = "false" ]; then
    echo none > "/sys/block/$zram_block/backing_dev" 2>/dev/null
    [ -f "/sys/block/$zram_block/hybridswap_loop_device" ] && echo none > "/sys/block/$zram_block/hybridswap_loop_device" 2>/dev/null
    echo 1 > "/sys/block/$zram_block/writeback_limit_enable" 2>/dev/null
    echo 0 > "/sys/block/$zram_block/writeback_limit" 2>/dev/null
  fi
  echo "$size" > "/sys/block/$zram_block/disksize" 2>/dev/null
  /system/bin/mkswap "$zram_path" 2>/dev/null || return 1
  /system/bin/swapon "$zram_path" -p "$magic" 2>/dev/null || return 1
  [ "$(get_zram_priority "$zram_path")" = "$magic" ] || return 1
  return 0
}

zram_matches_config() {
  local zram_path="$1"
  local size="$2"
  local comp_algorithm="$3"
  local zram_writeback="$4"
  local magic="$5"
  local zram_block=$(get_zram_block "$zram_path") || return 1
  [ "$(/system/bin/cat "/sys/block/$zram_block/disksize" 2>/dev/null | tr -d ' \n')" = "$size" ] || return 1
  [ "$(get_zram_priority "$zram_path")" = "$magic" ] || return 1
  if [ -n "$comp_algorithm" ]; then
    local current_alg=$(get_active_zram_algorithm "$zram_block")
    [ "$current_alg" = "$comp_algorithm" ] || [ "$current_alg" = "kernel:$comp_algorithm" ] || return 1
  fi
  if [ "$zram_writeback" = "false" ] && [ -f "/sys/block/$zram_block/backing_dev" ]; then
    [ "$(/system/bin/cat "/sys/block/$zram_block/backing_dev" 2>/dev/null | tr -d ' \n')" = "none" ] || return 1
  fi
  return 0
}

write_kthread_to_cpuset() {
  local path_kthread=$1
  local path_cpuset=$2

  if [[ ! -f "${path_kthread}" ]] || [[ ! -f "${path_cpuset}" ]]; then
    return
  fi

  for pid in $(cat "${path_kthread}" | awk 'NR>1 {print $2}'); do
    echo ${pid} > ${path_cpuset}
  done
}

configure_sys_params() {
  local direct_swappiness=60
  local vm_swappiness=160

  echo 0 > /proc/sys/vm/compaction_proactiveness
  echo "direct_swappiness=${direct_swappiness}" > "/proc/oplus_mem/swappiness_para"
  echo "vm_swappiness=${vm_swappiness}" > "/proc/oplus_mem/swappiness_para"
  write_kthread_to_cpuset "/proc/osvelte/bg_kthread" "/dev/cpuset/background/tasks"
  write_kthread_to_cpuset "/proc/osvelte/kswapd_like_kthread" "/dev/cpuset/kswapd-like/tasks"
}

write_hybridswap_errcode() {
  setprop persist.sys.oplus.nandswap.err "$1"
  setprop persist.sys.oplus.nandswap.condition false
}

init_zram() {
  local magic=32758
  local zram_conf="$CORONA_CONFIG/zram.conf"
  local loop_conf="$CORONA_CONFIG/loop.conf"
  local corona_zram_enabled=$(corona_get zram.conf enabled)
  [ "$corona_zram_enabled" = "1" ] || return 0

  local has_size=0
  local has_algorithm=0
  local has_writeback=0
  local has_swappiness=0
  local has_priority=0
  local has_path=0
  local has_recomp=0
  local has_zstd=0
  local has_extensions=0
  [ -f "$zram_conf" ] && grep -q '^size=' "$zram_conf" && has_size=1
  [ -f "$zram_conf" ] && grep -q '^algorithm=' "$zram_conf" && has_algorithm=1
  if [ -f "$loop_conf" ]; then
    local loop_enabled=$(corona_get loop.conf enabled)
    local loop_size=$(corona_get loop.conf size_mb)
    if [ "$loop_enabled" = "0" ] || { [ "$loop_enabled" = "1" ] && [ -n "$loop_size" ]; }; then
      has_writeback=1
    fi
  else
    [ -f "$zram_conf" ] && grep -q '^zram_writeback=' "$zram_conf" && has_writeback=1
  fi
  [ -f "$zram_conf" ] && grep -q '^swappiness=' "$zram_conf" && has_swappiness=1
  [ -f "$zram_conf" ] && grep -q '^priority=' "$zram_conf" && has_priority=1
  [ -f "$zram_conf" ] && grep -q '^zram_path=' "$zram_conf" && has_path=1
  [ -f "$zram_conf" ] && grep -Eq '^recomp_algorithm[123]=' "$zram_conf" && has_recomp=1
  [ -f "$zram_conf" ] && grep -q '^zstd_compression_level=' "$zram_conf" && has_zstd=1
  [ -f "$zram_conf" ] && grep -Eq '^(direct_swappiness|zram_used_limit_mb|hybridswap_zram_increase|hybridswap_quota_day)=' "$zram_conf" && has_extensions=1

  if [ "$has_size" -eq 0 ] && [ "$has_algorithm" -eq 0 ] && [ "$has_writeback" -eq 0 ] && [ "$has_swappiness" -eq 0 ] && [ "$has_priority" -eq 0 ] && [ "$has_path" -eq 0 ] && [ "$has_recomp" -eq 0 ] && [ "$has_zstd" -eq 0 ] && [ "$has_extensions" -eq 0 ]; then
    return
  fi

  local requested_path=$(corona_get zram.conf zram_path)
  local zram_path=$(normalize_zram_path "$requested_path")
  [ -n "$zram_path" ] || zram_path=$(normalize_zram_path "")
  [ -n "$zram_path" ] || return
  local zram_block=$(get_zram_block "$zram_path") || return

  local current_size=$(/system/bin/cat "/sys/block/$zram_block/disksize" 2>/dev/null | tr -d ' \n')
  local current_algorithm=$(get_active_zram_algorithm "$zram_block")
  local current_priority=$(get_zram_priority "$zram_path")
  [ -n "$current_priority" ] || current_priority="$magic"

  local corona_size=$(corona_get zram.conf size)
  local corona_algorithm=$(corona_get zram.conf algorithm)
  local corona_writeback=$(corona_get zram.conf zram_writeback)
  local corona_writeback_size=$(corona_get zram.conf writeback_size_mb)
  if [ -f "$loop_conf" ]; then
    [ "$(corona_get loop.conf enabled)" = "1" ] && corona_writeback=true || corona_writeback=false
    corona_writeback_size=$(corona_get loop.conf size_mb)
  fi
  local corona_swappiness=$(corona_get zram.conf swappiness)
  local corona_priority=$(corona_get zram.conf priority)

  local target_size="$current_size"
  local target_algorithm="$current_algorithm"
  local target_priority="$current_priority"
  [ "$has_size" -eq 1 ] && [ -n "$corona_size" ] && target_size="$corona_size"
  [ "$has_algorithm" -eq 1 ] && [ -n "$corona_algorithm" ] && target_algorithm="$corona_algorithm"
  [ "$has_priority" -eq 1 ] && [ -n "$corona_priority" ] && target_priority="$corona_priority"

  if [[ ! -d /dev/memcg ]] || [[ ! -e /proc/oplus_mem/hybridswap_enable ]]; then
    write_hybridswap_errcode $HYB_ERR_UNSUPPORTED
  else
    echo 1 > /proc/oplus_mem/hybridswap_enable 2>/dev/null
    echo 0 > /dev/memcg/memory.app_score 2>/dev/null
    setprop persist.sys.oplus.hybridswap_app_uid_memcg true
  fi

  local rebuild=0
  [ "$has_size" -eq 1 ] && rebuild=1
  [ "$has_algorithm" -eq 1 ] && rebuild=1
  [ "$has_recomp" -eq 1 ] && rebuild=1

  if [ "$rebuild" -eq 1 ]; then
    [ -x "$WRITEBACK_HELPER" ] && /system/bin/sh "$WRITEBACK_HELPER" remember "$zram_block" 2>/dev/null
    /system/bin/swapoff "$zram_path" 2>/dev/null || return 1
    echo 1 > "/sys/block/$zram_block/reset" 2>/dev/null || return 1
    if [ -n "$target_algorithm" ]; then
      target_algorithm=$(apply_zram_primary_algorithm "$zram_block" "$target_algorithm") || return
    fi
    apply_zram_recomp_algorithms "$zram_block" || return 1
    apply_zstd_compression_level || return 1
    [ -n "$target_size" ] && echo "$target_size" > "/sys/block/$zram_block/disksize" 2>/dev/null || return 1
    if [ ! -f "/sys/block/$zram_block/hybridswap_loop_device" ] && [ -x "$WRITEBACK_HELPER" ]; then
      /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" "$corona_writeback" "$corona_writeback_size" 2>/dev/null || return 1
    fi
    /system/bin/mkswap "$zram_path" 2>/dev/null || return
    /system/bin/swapon "$zram_path" -p "$target_priority" 2>/dev/null || return
    if [ -f "/sys/block/$zram_block/hybridswap_loop_device" ] && [ -x "$WRITEBACK_HELPER" ]; then
      /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" "$corona_writeback" "$corona_writeback_size" 2>/dev/null || return 1
    fi
  else
    if [ "$has_writeback" -eq 1 ] && [ -x "$WRITEBACK_HELPER" ]; then
      /system/bin/sh "$WRITEBACK_HELPER" apply "$zram_block" "$corona_writeback" "$corona_writeback_size" 2>/dev/null || return 1
    fi
    if [ "$has_priority" -eq 1 ]; then
      /system/bin/swapoff "$zram_path" 2>/dev/null || return 1
      /system/bin/swapon "$zram_path" -p "$target_priority" 2>/dev/null || return
    fi
    if [ "$has_zstd" -eq 1 ]; then
      apply_zstd_compression_level || return 1
    fi
  fi

  [ "$has_swappiness" -eq 1 ] && write_zram_swappiness "$corona_swappiness" ""
  [ "$has_extensions" -eq 1 ] && apply_zram_official_extensions "$zram_block"
  return 0
}
apply_corona_vm_config() {
  [ ! -f "$CORONA_CONFIG/vm.conf" ] && return
  local enabled=$(corona_get vm.conf enabled)
  [ -n "$enabled" ] && [ "$enabled" != "1" ] && return
  local watermark=$(corona_get vm.conf watermark_scale_factor)
  local extra_free=$(corona_get vm.conf extra_free_kbytes)
  local dirty_ratio=$(corona_get vm.conf dirty_ratio)
  local dirty_bg=$(corona_get vm.conf dirty_background_ratio)
  local vfs_pressure=$(corona_get vm.conf vfs_cache_pressure)
  [ -n "$watermark" ] && echo "$watermark" > /proc/sys/vm/watermark_scale_factor 2>/dev/null
  [ -n "$extra_free" ] && echo "$extra_free" > /proc/sys/vm/extra_free_kbytes 2>/dev/null
  [ -n "$dirty_ratio" ] && echo "$dirty_ratio" > /proc/sys/vm/dirty_ratio 2>/dev/null
  [ -n "$dirty_bg" ] && echo "$dirty_bg" > /proc/sys/vm/dirty_background_ratio 2>/dev/null
  [ -n "$vfs_pressure" ] && echo "$vfs_pressure" > /proc/sys/vm/vfs_cache_pressure 2>/dev/null
}

apply_corona_kernel_features() {
  [ ! -f "$CORONA_CONFIG/kernel.conf" ] && return
  local lru_gen=$(corona_get kernel.conf lru_gen)
  local thp=$(corona_get kernel.conf thp)
  local ksm=$(corona_get kernel.conf ksm)
  local compaction=$(corona_get kernel.conf compaction)
  [ -f /sys/kernel/mm/lru_gen/enabled ] && [ -n "$lru_gen" ] && {
    [ "$lru_gen" = "1" ] && echo Y > /sys/kernel/mm/lru_gen/enabled 2>/dev/null || echo N > /sys/kernel/mm/lru_gen/enabled 2>/dev/null
  }
  [ -f /sys/kernel/mm/transparent_hugepage/enabled ] && [ -n "$thp" ] && echo "$thp" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
  [ -f /sys/kernel/mm/ksm/run ] && [ -n "$ksm" ] && echo "$ksm" > /sys/kernel/mm/ksm/run 2>/dev/null
  [ -f /proc/sys/vm/compaction_proactiveness ] && [ -n "$compaction" ] && {
    [ "$compaction" = "1" ] && echo 20 > /proc/sys/vm/compaction_proactiveness 2>/dev/null || echo 0 > /proc/sys/vm/compaction_proactiveness 2>/dev/null
  }
}

apply_corona_le9ec() {
  [ ! -f "$CORONA_CONFIG/le9ec.conf" ] && return
  local enabled=$(corona_get le9ec.conf enabled)
  [ "$enabled" != "1" ] && return
  local anon_min=$(corona_get le9ec.conf anon_min)
  local clean_low=$(corona_get le9ec.conf clean_low)
  local clean_min=$(corona_get le9ec.conf clean_min)
  [ -n "$anon_min" ] && echo "$anon_min" > /proc/sys/vm/anon_min_kbytes 2>/dev/null
  [ -n "$clean_low" ] && echo "$clean_low" > /proc/sys/vm/clean_low_kbytes 2>/dev/null
  [ -n "$clean_min" ] && echo "$clean_min" > /proc/sys/vm/clean_min_kbytes 2>/dev/null
}

apply_corona_lmk() {
  [ ! -f "$CORONA_CONFIG/lmk.conf" ] && return
  local enabled=$(corona_get lmk.conf enabled)
  [ "$enabled" != "1" ] && return
  local mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  local sdk_version=$(getprop ro.build.version.sdk)
  local lowmemorykiller='/sys/module/lowmemorykiller/parameters'
  [ -d "$lowmemorykiller" ] && {
    if [ "$mem_total_kb" -gt 20971520 ]; then echo "4096,8192,65536,184320,262144,393216" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 12582912 ]; then echo "4096,8192,32768,122880,184320,262144" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 8388608 ]; then echo "4096,5120,32768,96000,131072,204800" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 6291456 ]; then echo "4096,5120,8192,32768,96000,131072" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 4194304 ]; then echo "4096,5120,8192,32768,65536,96000" > $lowmemorykiller/minfree 2>/dev/null
    else echo "4096,5120,8192,16384,24576,39936" > $lowmemorykiller/minfree 2>/dev/null; fi
    echo 0 > $lowmemorykiller/enable_adaptive_lmk 2>/dev/null
  }
  [ "$sdk_version" -gt 28 ] && {
    local minfree_levels
    if [ "$mem_total_kb" -gt 20971520 ]; then minfree_levels="4096:0,8192:100,65536:200,184320:250,262144:900,393216:950"
    elif [ "$mem_total_kb" -gt 12582912 ]; then minfree_levels="4096:0,8192:100,32768:200,122880:250,184320:900,262144:950"
    elif [ "$mem_total_kb" -gt 8388608 ]; then minfree_levels="4096:0,5120:100,32768:200,96000:250,131072:900,204800:950"
    elif [ "$mem_total_kb" -gt 6291456 ]; then minfree_levels="4096:0,5120:100,8192:200,32768:250,96000:900,131072:950"
    else minfree_levels="4096:0,5120:100,8192:200,32768:250,65536:900,96000:950"; fi
    setprop sys.lmk.minfree_levels "$minfree_levels"
  }
}

apply_corona_reclaim() {
  [ ! -f "$CORONA_CONFIG/reclaim.conf" ] && return
  local enabled=$(corona_get reclaim.conf enabled)
  [ "$enabled" != "1" ] && return
  echo off > /sys/kernel/mm/damon/admin/kdamonds/0/state 2>/dev/null
  echo off > /sys/kernel/mm/damon/admin/kdamonds/1/state 2>/dev/null
  echo 0 > /sys/kernel/mm/damon/admin/kdamonds/nr_kdamonds 2>/dev/null
  chmod 444 /sys/kernel/mm/damon/admin/kdamonds/nr_kdamonds 2>/dev/null
  [ -d /sys/module/process_reclaim/parameters ] && echo 0 > /sys/module/process_reclaim/parameters/enable_process_reclaim 2>/dev/null
  local is_oplus=0; [ -d /proc/oplus_mem ] && is_oplus=1
  [ "$is_oplus" = "1" ] && {
    echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null
    echo never > /sys/kernel/mm/transparent_hugepage/defrag 2>/dev/null
    echo 32768 > /dev/memcg/memory.zram_used_limit_mb 2>/dev/null
    echo 99 > /dev/memcg/memory.cpuload_threshold 2>/dev/null
  }
}

apply_corona_kswapd() {
  [ ! -f "$CORONA_CONFIG/kswapd.conf" ] && return
  local enabled=$(corona_get kswapd.conf enabled)
  [ "$enabled" != "1" ] && return
  local kswapd_pid=$(pgrep kswapd)
  local hybridswapd_pid=$(pgrep hybridswapd)
  [ -n "$kswapd_pid" ] && echo "$kswapd_pid" > /dev/cpuset/foreground/cgroup.procs 2>/dev/null
  [ -n "$hybridswapd_pid" ] && echo "$hybridswapd_pid" > /dev/cpuset/foreground/cgroup.procs 2>/dev/null
  [ -d /dev/cpuctl ] && {
    mkdir -p /dev/cpuctl/kswapd
    [ -n "$kswapd_pid" ] && echo "$kswapd_pid" > /dev/cpuctl/kswapd/cgroup.procs 2>/dev/null
    echo 1 > /dev/cpuctl/kswapd/cpu.uclamp.latency_sensitive 2>/dev/null
    echo 100 > /dev/cpuctl/kswapd/cpu.uclamp.min 2>/dev/null
  }
}

apply_corona_kernel_modules() {
  [ ! -f "$CORONA_CONFIG/corona_kernel.conf" ] && return
  corona_node_value="$(cat /proc/corona 2>/dev/null)"
  case "$corona_node_value" in
    ''|*[!0-9]*) return ;;
    *) [ "$corona_node_value" -gt 0 ] || return ;;
  esac
  local user_window_ms=$(corona_get corona_kernel.conf user_window_ms)
  local slack_off_ms=$(corona_get corona_kernel.conf slack_off_ms)
  case "$user_window_ms" in ''|*[!0-9]*) user_window_ms="" ;; esac
  case "$slack_off_ms" in ''|*[!0-9]*) slack_off_ms="" ;; esac
  local mod
  for mod in wake_aware \
             idle_writeback idle_vmstat \
             suspend_pm_tunables suspend_timerslack suspend_sched_slack \
             suspend_rcu_normalize suspend_dirty_freeze suspend_compact_freeze \
             suspend_softlockup_disable suspend_net_quiesce suspend_swappiness_zero \
             swappiness_pressure_throttle \
             resume_freq_burst; do
    local param_dir="/sys/module/$mod/parameters"
    [ ! -d "$param_dir" ] && continue
    local v=$(corona_get corona_kernel.conf "${mod}_enabled")
    case "$v" in
      1|Y|y) echo Y > "$param_dir/enabled" 2>/dev/null ;;
      0|N|n) echo N > "$param_dir/enabled" 2>/dev/null ;;
    esac
    case "$mod" in
      suspend_swappiness_zero|suspend_dirty_freeze|suspend_compact_freeze|\
      suspend_net_quiesce|suspend_softlockup_disable|suspend_sched_slack|\
      resume_freq_burst|swappiness_pressure_throttle)
        [ -n "$user_window_ms" ] && [ -f "$param_dir/user_window_ms" ] && \
          echo "$user_window_ms" > "$param_dir/user_window_ms" 2>/dev/null
        ;;
    esac
    if [ "$mod" = "suspend_timerslack" ] && [ -n "$slack_off_ms" ] && \
       [ -f "$param_dir/slack_off_ns" ]; then
      echo $(( slack_off_ms * 1000 * 1000 )) > "$param_dir/slack_off_ns" 2>/dev/null
    fi
  done
}

configure_aizerofs_parameters() {
  local aizerofs_supported=0
  local aizerofs_rus_disable=$(cat /sys/module/oplus_bsp_aizerofs/parameters/rus_disable 2>/dev/null)
  local my_engineering_type=$(getprop ro.oplus.image.my_engineering.type)

  if [ -e "/sys/module/oplus_bsp_aizerofs/parameters/enabled" ]; then
    aizerofs_supported=1
  fi

  if [ "$aizerofs_supported" -eq "1" ]; then
    local val=0
    if [ "$my_engineering_type" != "release" ]; then
      val=1
    fi
    echo $val > /sys/kernel/aizerofs/bug_on 2>/dev/null

    if [ "$aizerofs_rus_disable" -ne "1" ] 2>/dev/null; then
      echo 1 > /sys/module/oplus_bsp_aizerofs/parameters/enabled 2>/dev/null

      if [ "$aizerofs_rus_disable" -ne "2" ] 2>/dev/null; then
        echo 1 > /sys/module/oplus_bsp_aizerofs/parameters/write_enabled 2>/dev/null
      fi
    fi
  fi
}

main() {
  if [ "$1" = "--zram-only" ]; then
    init_zram
    return
  fi
  init_zram
  apply_corona_vm_config
  apply_corona_kernel_features
  apply_corona_lmk
  apply_corona_reclaim
  apply_corona_kswapd
  configure_aizerofs_parameters
}
main "$@"
