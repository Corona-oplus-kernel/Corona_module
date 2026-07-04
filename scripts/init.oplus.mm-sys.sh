#!system/bin/sh

readonly HYB_ERR_UNSUPPORTED=1004
readonly HYB_ERR_UNSET=1009
readonly LOG_TAG="init_oplus_mm-sys"
CORONA_CONFIG="/data/adb/modules/Corona/config"
for base in /data/adb/modules /data/adb/ksu/modules /data/adb/ap/modules; do
  [ -d "$base/Corona/config" ] || continue
  CORONA_CONFIG="$base/Corona/config"
  break
done

logi() {
  /system/bin/log -p i -t ${LOG_TAG} "$1"
  echo "${LOG_TAG}: $1"
}

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
  local zram_block="$1"
  zram_block=${zram_block#/dev/block/}
  zram_block=${zram_block#/dev/}
  [ -n "$zram_block" ] && [ -d "/sys/block/$zram_block" ] || return 1
  echo "$zram_block"
}

get_zram_priority() {
  awk -v dev="$1" 'NR > 1 && $1 == dev { print $5; exit }' /proc/swaps 2>/dev/null
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

run_default_nandswap_main() {
  local script=/product/bin/init.oplus.nandswap.sh
  [ -r "$script" ] || return 1
  /system/bin/sh -c '. "$1"; main' sh "$script"
}

write_zram_swappiness() {
  local corona_swappiness="$1"
  [ -n "$corona_swappiness" ] || return
  local spt_dir=/sys/module/swappiness_pressure_throttle/parameters
  if [ -d "$spt_dir" ] && [ -f "$spt_dir/swappiness_idle" ]; then
    echo "$corona_swappiness" > "$spt_dir/swappiness_idle" 2>/dev/null
  fi
  echo "$corona_swappiness" > /proc/sys/vm/swappiness 2>/dev/null
  echo "$corona_swappiness" > /dev/memcg/memory.swappiness 2>/dev/null
  echo "$corona_swappiness" > /dev/memcg/apps/memory.swappiness 2>/dev/null
  echo "$corona_swappiness" > /sys/module/zram_opt/parameters/vm_swappiness 2>/dev/null
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
  [ -n "$comp_algorithm" ] && echo "$comp_algorithm" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null
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

  logi "config sys params"
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
  local corona_zram_enabled=$(corona_get zram.conf enabled)
  [ "$corona_zram_enabled" = "1" ] || return

  local has_size=0
  local has_algorithm=0
  local has_writeback=0
  local has_swappiness=0
  local has_path=0
  [ -f "$zram_conf" ] && grep -q '^size=' "$zram_conf" && has_size=1
  [ -f "$zram_conf" ] && grep -q '^algorithm=' "$zram_conf" && has_algorithm=1
  [ -f "$zram_conf" ] && grep -q '^zram_writeback=' "$zram_conf" && has_writeback=1
  [ -f "$zram_conf" ] && grep -q '^swappiness=' "$zram_conf" && has_swappiness=1
  [ -f "$zram_conf" ] && grep -q '^zram_path=' "$zram_conf" && has_path=1

  if [ "$has_size" -eq 0 ] && [ "$has_algorithm" -eq 0 ] && [ "$has_writeback" -eq 0 ] && [ "$has_swappiness" -eq 0 ] && [ "$has_path" -eq 0 ]; then
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
  local corona_swappiness=$(corona_get zram.conf swappiness)

  local target_size="$current_size"
  local target_algorithm="$current_algorithm"
  [ "$has_size" -eq 1 ] && [ -n "$corona_size" ] && target_size="$corona_size"
  [ "$has_algorithm" -eq 1 ] && [ -n "$corona_algorithm" ] && target_algorithm="$corona_algorithm"

  if [[ ! -d /dev/memcg ]] || [[ ! -e /proc/oplus_mem/hybridswap_enable ]]; then
    write_hybridswap_errcode $HYB_ERR_UNSUPPORTED
  else
    echo 1 > /proc/oplus_mem/hybridswap_enable 2>/dev/null
    echo 0 > /dev/memcg/memory.app_score 2>/dev/null
    setprop persist.sys.oplus.hybridswap_app_uid_memcg true
  fi

  if [ "$has_size" -eq 1 ] || [ "$has_algorithm" -eq 1 ] || [ "$has_writeback" -eq 1 ] || [ "$has_path" -eq 1 ]; then
    /system/bin/swapoff "$zram_path" 2>/dev/null
    echo 1 > "/sys/block/$zram_block/reset" 2>/dev/null
    [ -n "$target_algorithm" ] && echo "$target_algorithm" > "/sys/block/$zram_block/comp_algorithm" 2>/dev/null
    if [ "$has_writeback" -eq 1 ] && [ "$corona_writeback" = "false" ]; then
      echo none > "/sys/block/$zram_block/backing_dev" 2>/dev/null
      [ -f "/sys/block/$zram_block/hybridswap_loop_device" ] && echo none > "/sys/block/$zram_block/hybridswap_loop_device" 2>/dev/null
      echo 1 > "/sys/block/$zram_block/writeback_limit_enable" 2>/dev/null
      echo 0 > "/sys/block/$zram_block/writeback_limit" 2>/dev/null
    fi
    [ -n "$target_size" ] && echo "$target_size" > "/sys/block/$zram_block/disksize" 2>/dev/null
    /system/bin/mkswap "$zram_path" 2>/dev/null || return
    /system/bin/swapon "$zram_path" -p "$current_priority" 2>/dev/null || return
  fi

  [ "$has_swappiness" -eq 1 ] && write_zram_swappiness "$corona_swappiness"
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
  logi "Corona: vm params applied"
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
  logi "Corona: kernel features applied"
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
  logi "Corona: le9ec applied"
}

apply_corona_lmk() {
  [ ! -f "$CORONA_CONFIG/lmk.conf" ] && return
  local enabled=$(corona_get lmk.conf enabled)
  [ "$enabled" != "1" ] && return
  local mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  local sdk_version=$(getprop ro.build.version.sdk)
  local lowmemorykiller='/sys/module/lowmemorykiller/parameters'
  [ -d "$lowmemorykiller" ] && {
    if [ "$mem_total_kb" -gt 8388608 ]; then echo "4096,5120,32768,96000,131072,204800" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 6291456 ]; then echo "4096,5120,8192,32768,96000,131072" > $lowmemorykiller/minfree 2>/dev/null
    elif [ "$mem_total_kb" -gt 4194304 ]; then echo "4096,5120,8192,32768,65536,96000" > $lowmemorykiller/minfree 2>/dev/null
    else echo "4096,5120,8192,16384,24576,39936" > $lowmemorykiller/minfree 2>/dev/null; fi
    echo 0 > $lowmemorykiller/enable_adaptive_lmk 2>/dev/null
  }
  [ "$sdk_version" -gt 28 ] && {
    local minfree_levels
    if [ "$mem_total_kb" -gt 8388608 ]; then minfree_levels="4096:0,5120:100,32768:200,96000:250,131072:900,204800:950"
    elif [ "$mem_total_kb" -gt 6291456 ]; then minfree_levels="4096:0,5120:100,8192:200,32768:250,96000:900,131072:950"
    else minfree_levels="4096:0,5120:100,8192:200,32768:250,65536:900,96000:950"; fi
    setprop sys.lmk.minfree_levels "$minfree_levels"
  }
  logi "Corona: lmk applied"
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
  logi "Corona: reclaim disabled"
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
  logi "Corona: kswapd boosted"
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
  logi "Corona: kernel modules configured"
}

configure_aizerofs_parameters() {
  local aizerofs_supported=0
  local aizerofs_rus_disable=$(cat /sys/module/oplus_bsp_aizerofs/parameters/rus_disable 2>/dev/null)
  local my_engineering_type=$(getprop ro.oplus.image.my_engineering.type)

  if [ -e "/sys/module/oplus_bsp_aizerofs/parameters/enabled" ]; then
    aizerofs_supported=1
  fi

  logi "config aizerofs params"
  if [ "$aizerofs_supported" -eq "1" ]; then
    local val=0
    if [ "$my_engineering_type" != "release" ]; then
      val=1
    fi
    echo $val > /sys/kernel/aizerofs/bug_on 2>/dev/null

    if [ "$aizerofs_rus_disable" -ne "1" ] 2>/dev/null; then
      logi "aizerofs enabled"
      echo 1 > /sys/module/oplus_bsp_aizerofs/parameters/enabled 2>/dev/null

      if [ "$aizerofs_rus_disable" -ne "2" ] 2>/dev/null; then
        logi "aizerofs write_enabled"
        echo 1 > /sys/module/oplus_bsp_aizerofs/parameters/write_enabled 2>/dev/null
      fi
    fi
  fi
}

main() {
  configure_sys_params
  init_zram
  apply_corona_vm_config
  apply_corona_kernel_features
  apply_corona_lmk
  apply_corona_reclaim
  apply_corona_kswapd
  configure_aizerofs_parameters
}
main "$@"
