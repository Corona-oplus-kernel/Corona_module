#!system/bin/sh

readonly HYB_ERR_UNSUPPORTED=1004
readonly HYB_ERR_UNSET=1009
readonly LOG_TAG="init_oplus_mm-sys"
readonly CORONA_CONFIG="/data/adb/modules/Corona/config"

MEM_TOTAL=$(awk '/MemTotal/ {print $2}' /proc/meminfo)

logi() {
  /system/bin/log -p i -t ${LOG_TAG} "$1"
  echo "${LOG_TAG}: $1"
}

corona_get() {
  local file="$CORONA_CONFIG/$1"
  local key="$2"
  [ -f "$file" ] && grep -m1 "^${key}=" "$file" | cut -d'=' -f2-
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
  local zram_increase_limit=2048
  local magic=32758
  local comp_algorithm="lz4"
  local force_enable="true"
  local hybridswap_enable=$(getprop persist.sys.oplus.nandswap)

  if [[ $(getprop sys.oplus.nandswap.init) == "true" ]]; then
    logi "zram already init, just return"
    return
  fi

  setprop sys.oplus.nandswap.init true
  logi "setup zram"

  if [[ $MEM_TOTAL -le 524288 ]]; then
    swap_size_mb=384
  elif [[ $MEM_TOTAL -le 1048576 ]]; then
    swap_size_mb=768
  elif [[ $MEM_TOTAL -le 2097152 ]]; then
    swap_size_mb=1280
  elif [[ $MEM_TOTAL -le 3145728 ]]; then
    swap_size_mb=1536
  elif [[ $MEM_TOTAL -le 4194304 ]]; then
    swap_size_mb=2560
  elif [[ $MEM_TOTAL -le 6291456 ]]; then
    swap_size_mb=3072
  elif [[ $MEM_TOTAL -le 8388608 ]]; then
    comp_algorithm="zstdn"
    swap_size_mb=5120
  elif [[ $MEM_TOTAL -le 12582912 ]]; then
    comp_algorithm="zstdn"
    swap_size_mb=8192
  else
    comp_algorithm="zstdn"
    swap_size_mb=16384
  fi

  # Corona overlay: read user ZRAM config
  local corona_zram_enabled=$(corona_get zram.conf enabled)
  if [ "$corona_zram_enabled" = "1" ]; then
    local corona_size=$(corona_get zram.conf size)
    local corona_alg=$(corona_get zram.conf algorithm)
    [ -n "$corona_size" ] && swap_size_mb=$(( corona_size / 1024 / 1024 ))
    [ -n "$corona_alg" ] && comp_algorithm="$corona_alg"
    logi "Corona ZRAM override: size=${swap_size_mb}MB alg=${comp_algorithm}"
  fi

  local zram_increase_size=$(( swap_size_mb - $(/system/bin/cat /sys/block/zram0/disksize 2>/dev/null | awk '{print int($1/1024/1024)}') ))
  [[ $zram_increase_size -lt 0 ]] && zram_increase_size=0

  if [[ ! -d /dev/memcg ]] || [[ ! -e /proc/oplus_mem/hybridswap_enable ]]; then
    logi "hybridswap not supported"
    write_hybridswap_errcode $HYB_ERR_UNSUPPORTED

    /system/bin/swapoff /dev/block/zram0 2>/dev/null
    echo 1 > /sys/block/zram0/reset 2>/dev/null
    echo $comp_algorithm > /sys/block/zram0/comp_algorithm 2>/dev/null
    echo $(( swap_size_mb * 1024 * 1024 )) > /sys/block/zram0/disksize 2>/dev/null
    /system/bin/mkswap /dev/block/zram0 2>/dev/null
    /system/bin/swapon /dev/block/zram0 -p $magic 2>/dev/null
    return
  fi

  if [[ "$hybridswap_enable" == "true" ]] || [[ "$force_enable" == "true" ]]; then
    logi "hybridswap enabled"
    echo 1 > /proc/oplus_mem/hybridswap_enable 2>/dev/null
    echo $comp_algorithm > /sys/block/zram0/comp_algorithm 2>/dev/null
    echo 0 > /dev/memcg/memory.app_score 2>/dev/null

    if [[ $zram_increase_size -le 0 ]]; then
      logi "zram already larger"
    elif [[ $zram_increase_size -le $zram_increase_limit ]]; then
      echo $(( zram_increase_size * 1024 * 1024 )) > /sys/block/zram0/disksize 2>/dev/null
      /system/bin/mkswap /dev/block/zram0 2>/dev/null
      /system/bin/swapon /dev/block/zram0 -p $magic 2>/dev/null
    else
      /system/bin/swapoff /dev/block/zram0 2>/dev/null
      echo 1 > /sys/block/zram0/reset 2>/dev/null
      echo $comp_algorithm > /sys/block/zram0/comp_algorithm 2>/dev/null
      echo $(( swap_size_mb * 1024 * 1024 )) > /sys/block/zram0/disksize 2>/dev/null
      /system/bin/mkswap /dev/block/zram0 2>/dev/null
      /system/bin/swapon /dev/block/zram0 -p $magic 2>/dev/null
    fi

    # Corona overlay: writeback control
    local corona_writeback=$(corona_get zram.conf zram_writeback)
    if [ "$corona_writeback" = "false" ]; then
      echo none > /sys/block/zram0/backing_dev 2>/dev/null
      [ -f /sys/block/zram0/hybridswap_loop_device ] && echo none > /sys/block/zram0/hybridswap_loop_device 2>/dev/null
      echo 1 > /sys/block/zram0/writeback_limit_enable 2>/dev/null
      echo 0 > /sys/block/zram0/writeback_limit 2>/dev/null
      logi "Corona: hybridswap writeback disabled"
    fi
  else
    logi "hybridswap disabled by user"
    write_hybridswap_errcode $HYB_ERR_UNSET

    /system/bin/swapoff /dev/block/zram0 2>/dev/null
    echo 1 > /sys/block/zram0/reset 2>/dev/null
    echo $comp_algorithm > /sys/block/zram0/comp_algorithm 2>/dev/null
    echo $(( swap_size_mb * 1024 * 1024 )) > /sys/block/zram0/disksize 2>/dev/null
    /system/bin/mkswap /dev/block/zram0 2>/dev/null
    /system/bin/swapon /dev/block/zram0 -p $magic 2>/dev/null
  fi

  # Corona overlay: swappiness
  local corona_swappiness=$(corona_get zram.conf swappiness)
  if [ -n "$corona_swappiness" ]; then
    local spt_dir=/sys/module/swappiness_pressure_throttle/parameters
    if [ -d "$spt_dir" ] && [ -f "$spt_dir/swappiness_idle" ]; then
      echo "$corona_swappiness" > "$spt_dir/swappiness_idle" 2>/dev/null
    fi
    echo "$corona_swappiness" > /proc/sys/vm/swappiness 2>/dev/null
    echo "$corona_swappiness" > /dev/memcg/memory.swappiness 2>/dev/null
    echo "$corona_swappiness" > /dev/memcg/apps/memory.swappiness 2>/dev/null
    echo "$corona_swappiness" > /sys/module/zram_opt/parameters/vm_swappiness 2>/dev/null
    logi "Corona: swappiness=${corona_swappiness}"
  fi

  logi "zram setup done, size=${swap_size_mb}MB"
  setprop persist.sys.oplus.hybridswap_app_uid_memcg true
}

apply_corona_vm_config() {
  [ ! -f "$CORONA_CONFIG/vm.conf" ] && return
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
  local is_xiaomi=0
  [ "$(getprop ro.miui.ui.version.name)" != "" ] && is_xiaomi=1

  [ "$is_xiaomi" = "1" ] && {
    setprop persist.sys.minfree_6g "16384,20480,32768,131072,262144,384000"
    setprop persist.sys.minfree_8g "16384,20480,32768,131072,384000,524288"
    setprop persist.sys.minfree_12g "16384,20480,131072,384000,524288,819200"
  }
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
  echo 0 > /sys/kernel/mi_reclaim/enable 2>/dev/null
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
  [ ! -f /proc/corona ] && return
  [ "$(cat /proc/corona 2>/dev/null)" != "1" ] && return
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
  apply_corona_le9ec
  apply_corona_lmk
  apply_corona_reclaim
  apply_corona_kswapd
  apply_corona_kernel_modules
  configure_aizerofs_parameters
}
main "$@"
