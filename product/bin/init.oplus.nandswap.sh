#!/system/bin/sh

nandswap_tool=/product/bin/nandswap_tool
swapfile_path=/data/nandswap/swapfile
swap_size_mb=0
fn_enable=false
data_type=erofs
prop_condition="persist.sys.oplus.nandswap.condition"
prop_nandswap_err="persist.sys.oplus.nandswap.err"
prop_nandswap_curr="persist.sys.oplus.nandswap.swapsize.curr"
prop_nandswap_size="persist.sys.oplus.nandswap.swapsize"
prop_zram_compalgo_base="persist.sys.oplus.zram_comp_algorithm_rus_"
cfg_nandswap_path="/odm/etc/nandswap.cfg"
zram_increase=0
hybridswap_has_insmod=0
hybridswap_init=0
zram2ufs_ratio=30
zram_critical_threshold=0
threshold_wakeup_hybridswapd="0 0 0 0"
nandswap_sz_mb=0
mem_total=0
zram_increase_limit=2048
vm_swappiness=160
direct_swappiness=60
comp_algorithm="lz4"
zram1_comp_algorithm="zstd"
emmc_device=0
chp_supported=0
mem_gb=0
my_engineering_type=`getprop ro.oplus.image.my_engineering.type`
oplus_blo_level_type=`getprop ro.oplus.blo.level`
fg_protect_enable=false
exit_mm_optimize_enable=false
hybridswap_enable=1
ERR_FS=1001
ERR_NOT_UFS=1002
ERR_SET_LOOP=1003
ERR_UNSUPPORTED=1004
ERR_PINNED=1005
ERR_CHECKSZ=1006
ERR_SET_DIO=1007
ERR_SET_ZRAM=1008
NANDSWAP_SZ_RATIO=2
hybridswap_partition="/dev/block/by-name/hybridswap"
nandswapV2_supported=0
zram0_limit_size=0

ZRAM0_RET=0
ZRAM0_DISK_SIZE_MB=0
ZRAM0_INCREASE_LIMIT=0
ZRAM0_LIMIT_SIZE=0
ZRAM0_COMP_ALGORITHM=""
ZRAM0_HYBRIDSWAP_ENABLE=0

CHP_ZRAM_RET=0
CHP_ZRAM0_DISK_SIZE_MB=0
CHP_ZRAM0_COMP_ALGORITHM=""
CHP_ZRAM1_DISK_SIZE_MB=0
CHP_ZRAM1_COMP_ALGORITHM=""
CHP_ZRAM_LIMIT_SIZE=0

ZRAM_OPT_RET=0
ZRAM_OPT_VM_SWAPPINESS=0
ZRAM_OPT_DIRECT_SWAPPINESS=0
PROP_MM_CONFIG_ERR="persist.sys.oplus.mm_config.err"

function load_mm_config()
{
	local config_file="/odm/etc/oplus_mm_config.xml"
	local osvelte_tool="/system_ext/bin/osvelte"

	if [ ! -f $config_file ]; then
		echo "Error: Failed to find ${config_file}"
		setprop $PROP_MM_CONFIG_ERR "EFIND"
		return -1
	fi

	TMP=$(${osvelte_tool} config --load zram_opt --file ${config_file})
	local ret=$?
	if [ $ret -ne 0 ]; then
		echo "Error: Failed to parse zram_opt"
		setprop $PROP_MM_CONFIG_ERR "EREAD_ZRAM_OPT"
		return -1
	fi
	ZRAM_OPT_RET=1
	ZRAM_OPT_VM_SWAPPINESS=$(echo "$TMP" | awk -F': ' '/vm_swappiness/ {print $2}')
	ZRAM_OPT_DIRECT_SWAPPINESS=$(echo "$TMP" | awk -F': ' '/direct_swappiness/ {print $2}')
	echo "[zram_opt] '${ZRAM_OPT_VM_SWAPPINESS}' '${ZRAM_OPT_DIRECT_SWAPPINESS}'"

	TMP=$(${osvelte_tool} config --load zram0 --file ${config_file})
	local ret=$?
	if [ $ret -ne 0 ]; then
		echo "Error: Failed to parse zram0"
		setprop $PROP_MM_CONFIG_ERR "EREAD_ZRAM0"
		return -1
	fi
	ZRAM0_RET=1
	ZRAM0_DISK_SIZE_MB=$(echo "$TMP" | awk -F': ' '/disk_size_mb/ {print $2}')
	ZRAM0_INCREASE_LIMIT=$(echo "$TMP" | awk -F': ' '/increase_limit/ {print $2}')
	ZRAM0_COMP_ALGORITHM=$(echo "$TMP" | awk -F': ' '/comp_algorithm/ {print $2}')
	ZRAM0_LIMIT_SIZE=$(echo "$TMP" | awk -F': ' '/limit_size/ {print $2}')
	ZRAM0_HYBRIDSWAP_ENABLE=$(echo "$TMP" | awk -F': ' '/hybridswap_enable/ {print $2}')
	echo "[zram0] '${ZRAM0_DISK_SIZE_MB}' '${ZRAM0_INCREASE_LIMIT}' '${ZRAM0_LIMIT_SIZE}' '${ZRAM0_COMP_ALGORITHM}'"

	TMP=$(${osvelte_tool} config --load chp_zram --file ${config_file})
	local ret=$?
	if [ $ret -ne 0 ]; then
		echo "Error: Failed to parse chp_zram"
		setprop $PROP_MM_CONFIG_ERR "EREAD_CHP_ZRAM"
		return -1
	fi
	CHP_ZRAM_RET=1
	CHP_ZRAM0_DISK_SIZE_MB=$(echo "$TMP" | awk -F': ' '/zram0_disk_size_mb/ {print $2}')
	CHP_ZRAM0_COMP_ALGORITHM=$(echo "$TMP" | awk -F': ' '/zram0_comp_algorithm/ {print $2}')
	CHP_ZRAM1_DISK_SIZE_MB=$(echo "$TMP" | awk -F': ' '/zram1_disk_size_mb/ {print $2}')
	CHP_ZRAM1_COMP_ALGORITHM=$(echo "$TMP" | awk -F': ' '/zram1_comp_algorithm/ {print $2}')
	CHP_ZRAM_LIMIT_SIZE=$(echo "$TMP" | awk -F': ' '/limit_size/ {print $2}')
	echo "[chp_zram] '${CHP_ZRAM0_DISK_SIZE_MB}' '${CHP_ZRAM0_COMP_ALGORITHM}'"
	echo "[chp_zram] '${CHP_ZRAM1_DISK_SIZE_MB}' '${CHP_ZRAM1_COMP_ALGORITHM}'"
	echo "[chp_zram] '${CHP_ZRAM_LIMIT_SIZE}'"
	setprop $PROP_MM_CONFIG_ERR "0"
}

function set_mm_config() {
	if [ $ZRAM0_RET -eq 0 ] || [ $CHP_ZRAM_RET -eq 0 ]; then
		return
	fi

	vm_swappiness=$ZRAM_OPT_VM_SWAPPINESS
	direct_swappiness=$ZRAM_OPT_DIRECT_SWAPPINESS

	swap_size_mb=$ZRAM0_DISK_SIZE_MB
	comp_algorithm=$ZRAM0_COMP_ALGORITHM
	hybridswap_enable=$ZRAM0_HYBRIDSWAP_ENABLE
	zram_limit_size=$ZRAM0_LIMIT_SIZE
	zram_increase_limit=$ZRAM0_INCREASE_LIMIT
	# introduced by kernel-6.6
	zram0_limit_size=$ZRAM0_LIMIT_SIZE
}
function configure_platform_parameters()
{
	platform_id=`cat /sys/devices/soc0/soc_id`
	case "$platform_id" in
		"415"|"475"|"356"|"400"|"459")
		# SM8350 | SM7325 | SM8250 | SM7250 | SM7225
			if [[ $mem_total -gt 6291456 ]]; then
				comp_algorithm="zstd"
				vm_swappiness=200
			fi
			;;
		"457"|"506"|"530"|"608")
		# SM8450 SM7450 SM8475 SM7550
			if [[ $mem_total -gt 6291456 ]] && [[ $mem_total -le 12582912 ]]; then
				comp_algorithm="zstdn"
				vm_swappiness=200
			fi
			;;
		"507")
		# SM6375
			mem_gb=`expr ${mem_total_str:16:2} + 1`
			prop_zram_compalgo="${prop_zram_compalgo_base}${mem_gb}g"
			comp_algorithm=`getprop $prop_zram_compalgo`
			if [ -z "$comp_algorithm" ]; then
				comp_algorithm="lz4"
			fi
			;;
		"444")
		# SM6115
			if [[ $mem_total -le 6291456 ]]; then
				comp_algorithm="zstdn"
			fi
			;;
		*)
			echo -e "***WARNING***: Invalid SoC ID\n"
			;;
	esac

	product_id=`getprop ro.boot.prjname`
	case "$product_id" in
		"22635"|"22714"|"23603"|"23667"|"23607")
			if [[ $mem_total -gt 16777216 ]]; then
				swap_size_mb=10240
			fi
			;;
		"24301"|"24302"|"24309"|"24289")
			if [[ $mem_total -le 4194304 ]]; then
				zram_increase_limit=1024
			fi
			;;
		"23023")
			if [[ $mem_total -gt 6291456 ]]; then
				comp_algorithm="lz4"
			fi
			;;
		"22071"|"22072")
			if [[ $mem_total -le 6291456 ]]; then
				zram_increase_limit=3072
			fi
			;;
		"23619"|"23625"|"23715"|"23716"|"23725"|"23726"|"24682"|"24704")
			if [[ $mem_total -gt 6291456 ]] && [[ $mem_total -le 8388608 ]]; then
				vm_swappiness=100
			fi
			;;
		"23631")
			if [[ $mem_total -le 12582912 ]]; then
				zram_increase_limit=512
				swap_size_mb=7168
			elif [[ $mem_total -le 16777216 ]]; then
				zram_increase_limit=1024
				swap_size_mb=8704
			fi
			;;
		"22111")
			if [[ $mem_total -le 12582912 ]]; then
				comp_algorithm="zstd"
			fi
			;;
		"23609"|"23622"|"23718"|"24687")
				comp_algorithm="zstdn_o"
			;;
		"22737"|"22623")
		#Senna-A
			if [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=5120
			else
				swap_size_mb=7168
			fi
			;;
		"24676"|"24675"|"25665"|"25666"|"25667"|"25695"|"25696"|"25697")
		# Tacoo-F&Moscow-A&Moscow-B
			comp_algorithm="zstdn_o"
			if [ $mem_total -le 6291456 ]; then
				swap_size_mb=3072
			elif [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=5120
			else
				swap_size_mb=7168
			fi
			;;
		"25698"|"25699"|"25700"|"25704")
		# Moscow-C
			if [ $mem_total -le 6291456 ]; then
				swap_size_mb=3072
			elif [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=5120
			else
				swap_size_mb=7168
			fi
			;;
		"24612"|"24621"|"24607")
			#dongfeng&piaget domestic
				comp_algorithm="zstdn_o"
			if [[ $mem_total -le 6291456 ]]; then
				swap_size_mb=4096
				hybridswap_enable=0
			elif [[ $mem_total -le 8388608 ]]; then
				swap_size_mb=5632
			elif [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=7168
			elif [[ $mem_total -le 16777216 ]]; then
				swap_size_mb=8704
			else
				swap_size_mb=8704
			fi
			;;
		"24744"|"24718"|"24771"|"24772"|"24697"|"24698"|"24724"|"24623")
			#dongfeng&piaget export
				comp_algorithm="zstdn_o"
			if [[ $mem_total -le 6291456 ]]; then
				swap_size_mb=4096
				hybridswap_enable=0
			elif [[ $mem_total -le 8388608 ]]; then
				swap_size_mb=5632
			elif [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=7680
			elif [[ $mem_total -le 16777216 ]]; then
				swap_size_mb=8704
			else
				swap_size_mb=8704
			fi
			;;
		"24811")
			# Hummer
			if [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=6656
				zram_increase_limit=0
			else
				swap_size_mb=8704
				zram_increase_limit=0
			fi
			;;
		"24055"|"24279"|"24281"|"24282"|"24283"|"24284")
			# Alpha-M
			if [[ $mem_total -le 8388608 ]]; then
				mem_gb=`expr ${mem_total_str:16:2} + 1`
				prop_zram_compalgo="${prop_zram_compalgo_base}${mem_gb}g"
				comp_algorithm=`getprop $prop_zram_compalgo`
				if [ -z "$comp_algorithm" ]; then
					comp_algorithm="zstdn_o"
				fi
			fi
			;;
		"25258"|"25243"|"25031"|"25320"|"25251"|"25253"|"25310"|"25280"|"25891")
			# Baikal-B4-LX Baikal-B4 & BB4-O
			echo 1 > /proc/oplus_mem/order3_opt
			comp_algorithm="zstdn"
			mem_gb=`expr ${mem_total_str:16:2} + 1`
			prop_zram_compalgo="${prop_zram_compalgo_base}${mem_gb}g"
			comp_algorithm=`getprop $prop_zram_compalgo`
			if [ -z "$comp_algorithm" ]; then
				comp_algorithm="zstdn_o"
			fi

			if [[ $mem_total -gt 3145728 ]] && [[ $mem_total -le 4194304 ]]; then
				#config 3GB zramsize with ramsize 4GB
				swap_size_mb=3072
				zram_increase_limit=0
			fi
			;;
		"24018"|"24019")
			#zhufeng
			zram_increase_limit=3072
			;;
		"24756"|"24757"|"25674"|"25675"|"24625")
			#neutron neutron-p
			comp_algorithm="zstdn_o"
			;;
		"25688"|"25689"|"25690"|"25691"|"25692"|"25611"|"25742"|"25743")
			#zenith
			comp_algorithm="zstdn_o"
			echo 1 > /proc/oplus_mem/mask_kswapd_reclaim
			;;
		"23821"|"23893")
			if [[ $mem_total -le 12582912 ]]; then
				comp_algorithm="zstdn"
				swap_size_mb=7680
			fi
			echo 1 > /proc/oplus_mem/mask_kswapd_reclaim
			;;
		"24001"|"24002"|"24201"|"24924"|"24926"|"24976")
			# haiyan & erhai
			if [[ $mem_total -le 12582912 ]]; then
				swap_size_mb=6656
				if [ -f /dev/memcg/memory.zram_used_limit_mb ]; then
					zram_increase_limit=0
					swap_size_mb=12288
					zram0_limit_size=7680
				fi
			elif [[ $mem_total -le 16777216 ]]; then
				swap_size_mb=7680
				if [ -f /dev/memcg/memory.zram_used_limit_mb ]; then
					zram_increase_limit=0
					swap_size_mb=12288
					zram0_limit_size=9728
				fi
			fi
			;;
		*)
			echo -e "***WARNING***: zram doesn't modify by project"
			;;
	esac
}

function configure_hybridswap_parameters()
{
	if [ $mem_total -le 3145728 ]; then
		zram2ufs_ratio=30
		threshold_wakeup_hybridswapd="200 100 200 512"
	elif [ $mem_total -le 4194304 ]; then
		zram2ufs_ratio=30
		threshold_wakeup_hybridswapd="1200 1000 1200 716"
	elif [ $mem_total -le 6291456 ]; then
		zram2ufs_ratio=20
		threshold_wakeup_hybridswapd="2000 1600 2000 1536"
	else
		zram2ufs_ratio=15
		threshold_wakeup_hybridswapd="2200 1800 2200 1536"
	fi

	if [ $emmc_device -eq 1 ]; then
		zram2ufs_ratio=5
	fi

	zram_critical_threshold=$(expr $swap_size_mb \- 128)
}

function write_kthread_to_cpuset()
{
	local file_kthread=$1
	local file_cpuset=$2

	echo "write_kthread_to_cpuset"

	if [ ! -f "$file_kthread" ] || [ ! -f "$file_cpuset" ]; then
		return
	fi
	for pid in `cat $file_kthread | awk 'NR>1 {print $2}'`; do
		echo $pid > $file_cpuset
	done
}

function configure_chp_zram_parameters()
{
	local disksize
	local limitsize
	prjname=`getprop ro.boot.prjname`

	if [[ $mem_total -gt 12582912 ]]; then
		disksize=8704M
		limitsize=8704
	else
		if [[ "$prjname" == "22101" || "$prjname" == "22811" || "$prjname" == "21131"|| "$prjname" == "24744" || "$prjname" == "24718" || "$prjname" == "24771" || "$prjname" == "24772" ]]; then
			disksize=7680M
			limitsize=7680
		else
			disksize=7168M
			limitsize=7168
		fi
	fi

	if [ $CHP_ZRAM_RET -eq 1 ]; then
		disksize="$CHP_ZRAM0_DISK_SIZE_MB"M
		limitsize="$CHP_ZRAM_LIMIT_SIZE"
		comp_algorithm=$CHP_ZRAM0_COMP_ALGORITHM
		zram1_comp_algorithm=$CHP_ZRAM1_COMP_ALGORITHM
	fi


	if [ -f /sys/block/zram0/disksize ]; then
		echo $comp_algorithm > /sys/block/zram0/comp_algorithm
		echo $disksize > /sys/block/zram0/disksize
	fi

	if [ -f /sys/block/zram1/disksize ]; then
		echo $zram1_comp_algorithm > /sys/block/zram1/comp_algorithm
		echo $disksize > /sys/block/zram1/disksize
	fi

	if [ -f /dev/memcg/memory.zram_used_limit_mb ]; then
		echo $limitsize > /dev/memcg/memory.zram_used_limit_mb
	fi

	if [ -f /dev/memcg/memory.num_to_reclaim ]; then
		if [ "$prjname" == "22101" ]; then
			echo 64 > /dev/memcg/memory.num_to_reclaim
		else
			echo 128 > /dev/memcg/memory.num_to_reclaim
		fi
	fi

	if [ -f  /sys/kernel/msm-ion/hugepage_enable ]; then
		echo 1 > /sys/kernel/msm-ion/hugepage_enable
	fi
}

function configure_zram_parameters()
{
	if [ $chp_supported -eq 1 ]; then
		configure_chp_zram_parameters
		return
	fi

	if [ ! -e "/dev/memcg/memory.stat" ]; then
		# if memcg-v1 not found disable hybridswap_enable
		hybridswap_enable=0
	fi

	echo $comp_algorithm > /sys/block/zram0/comp_algorithm
	if [ -f /sys/block/zram0/disksize ]; then
		if [ -f /sys/block/zram0/use_dedup ]; then
			echo 1 > /sys/block/zram0/use_dedup
		fi

		if [ $swap_size_mb -gt 0 ]; then
			echo "swap_size_mb was already defined"
		elif [ $mem_total -le 524288 ]; then
			#config 384MB zramsize with ramsize 512MB
			swap_size_mb=384
		elif [ $mem_total -le 1048576 ]; then
			#config 768MB zramsize with ramsize 1GB
			swap_size_mb=768
		elif [ $mem_total -le 2097152 ]; then
			#config 1GB+256MB zramsize with ramsize 2GB
			swap_size_mb=1280
		elif [ $mem_total -le 3145728 ]; then
			#config 1GB+512MB zramsize with ramsize 3GB
			swap_size_mb=1536
		elif [ $mem_total -le 4194304 ]; then
			#config 2GB+512MB zramsize with ramsize 4GB
			swap_size_mb=2560
		elif [ $mem_total -le 6291456 ]; then
			#config 3GB zramsize with ramsize 6GB
			swap_size_mb=3072
		elif [ $mem_total -le 8388608 ]; then
			#config 5GB zramsize with ramsize 8GB
			swap_size_mb=5632
		elif [ $mem_total -le 12582912 ]; then
			#config 5GB zramsize with ramsize 12GB
			swap_size_mb=5632
			if [ "$oplus_blo_level_type" == "2" ] && [ -f /dev/memcg/memory.zram_used_limit_mb ] && [ "$fn_enable" == "true" ]; then
				swap_size_mb=10240
				zram0_limit_size=6656
			fi
		else
			#config 7GB zramsize with ramsize 16GB or larger devices
			swap_size_mb=7680
			if [ -f /dev/memcg/memory.zram_used_limit_mb ] && [ "$oplus_blo_level_type" == "2" ] && [ "$fn_enable" == "true" ]; then
				swap_size_mb=14336
				zram0_limit_size=9728
			fi
		fi

		zram_increase=$nandswap_sz_mb
		if [ $zram_increase -gt $zram_increase_limit ]; then
			zram_increase=$zram_increase_limit
		fi

		if [[ "$fn_enable" == "false" || $hybridswap_has_insmod -eq 0 ]]; then
			zram_increase=0

			#Lexus/24881/24882, 8GB, force add 1GB zram more when disabled nandswap
			product_id=`getprop ro.boot.prjname`
			case "$product_id" in
				"24881"|"24882")
					if [[ $mem_total -le 8388608 ]]; then
						zram_increase=1024
					fi
					;;
				"23821"|"23893")
					zram_increase=1024
					;;
				"23851")
					if [[ $mem_total -le 12582912 ]]; then
						zram_increase=2048
					fi
					;;
			esac
		fi

		disksize=$(expr $swap_size_mb \+ $zram_increase)
		echo "$disksize""M" > /sys/block/zram0/disksize
	fi

	if [ -f /dev/memcg/memory.zram_used_limit_mb ]; then
		echo $zram0_limit_size > /dev/memcg/memory.zram_used_limit_mb
	fi

	if [ $hybridswap_has_insmod -eq 1 ]; then
		configure_hybridswap_parameters
	fi
}

function configure_swappiness()
{
	kernel_version=`uname -r`
	oplus_path=oplus_healthinfo

	if [[ "$kernel_version" == "6."* || "$kernel_version" == "5.1"* ]]; then
		oplus_path=oplus_mem
	fi

	echo "direct_swappiness=${direct_swappiness}" > /proc/${oplus_path}/swappiness_para
	echo "vm_swappiness=${vm_swappiness}" > /proc/${oplus_path}/swappiness_para
}

function zram_init()
{
	local magic=32758

	if [ $# -eq 1 ]; then
		magic=$1
	fi

	configure_swappiness

	mkswap /dev/block/zram0
	swapon /dev/block/zram0 -p $magic

	if [ $chp_supported -eq 1 ]; then
		# magic must be eqaul to 7853 for chp zram1
		magic=7853
		mkswap /dev/block/zram1
		swapon /dev/block/zram1 -p $magic

		chmod o+w `ls -l /sys/block/zram0/hybridswap_* | grep ^'\-rw\-' | awk '{print $NF}'`
		echo "3 0 99 0 0 0 100 399 60 0 0 400 499 50 0 0 " > /dev/memcg/memory.swapd_memcgs_param
		echo 400 > /dev/memcg/memory.app_score
		echo 300 > /dev/memcg/apps/memory.app_score
		echo root > /dev/memcg/memory.name
		echo apps > /dev/memcg/apps/memory.name

		echo "$threshold_wakeup_hybridswapd" > /dev/memcg/memory.avail_buffers
		echo $zram_critical_threshold > /dev/memcg/memory.zram_critical_threshold
		echo 50 > /dev/memcg/memory.swapd_max_reclaim_size
		echo "1000 50" > /dev/memcg/memory.swapd_shrink_parameter
		echo 5000 > /dev/memcg/memory.max_skip_interval
		echo 50 > /dev/memcg/memory.reclaim_exceed_sleep_ms
		echo 60 > /dev/memcg/memory.cpuload_threshold
		echo 30 > /dev/memcg/memory.max_reclaimin_size_mb
		echo 80 > /dev/memcg/memory.zram_wm_ratio
		echo 512 > /dev/memcg/memory.empty_round_skip_interval
		echo 20 > /dev/memcg/memory.empty_round_check_threshold
		echo 1 > /sys/block/zram0/hybridswap_loglevel
		if [ $nandswapV2_supported -eq 1 ]; then
			echo -n "$hybridswap_partition" > /sys/block/zram0/hybridswap_loop_device
		else
			echo "chp" > /sys/block/zram0/hybridswap_loop_device
		fi
		# always enable hybridswapd for chp
		echo ${hybridswap_enable} > /sys/block/zram0/hybridswap_enable
		echo "0-3" > /dev/memcg/memory.swapd_bind
		hybridswap_init=1
	fi

	# zram&hybridswapd is initlialized at here
	write_kthread_to_cpuset "/proc/osvelte/bg_kthread" "/dev/cpuset/background/tasks"
	write_kthread_to_cpuset "/proc/osvelte/kswapd_like_kthread" "/dev/cpuset/kswapd-like/tasks"
}

function write_nandswap_err()
{
	setprop $prop_nandswap_err $1
	setprop $prop_condition false
}

function configure_nandswap_parameters()
{
	init=`getprop sys.oplus.nandswap.init`
	[ "$init" == "true" ] && exit
	setprop sys.oplus.nandswap.init true

	data_type=`mount |grep -E " /data " |awk '{print $5}'`
	[ $data_type != "f2fs" ] && [ $data_type != "ext4" ] && write_nandswap_err $ERR_FS && return 22

	is_ufs=`find /sys/bus/platform/devices/ |grep ufshc`
	if [ ! -n "$is_ufs" ]; then
 		prjname=`getprop ro.boot.prjname`
 		if [ -n "$prjname" ]; then
 			case $prjname in
 				"2331"[1-9])
					emmc_device=1
 					;;
 				"2332"[5-8])
					emmc_device=1
 					;;
			*)
 					write_nandswap_err $ERR_NOT_UFS
 					return 22
 			esac
 		else
 			write_nandswap_err $ERR_NOT_UFS
 			return 22
 		fi
 	fi

	if [ -f /sys/block/zram0/hybridswap_core_enable ]; then
		hybridswap_has_insmod=1
	fi

	$nandswap_tool -r ${cfg_nandswap_path}
	condition=`getprop $prop_condition`
	[ "$condition" == "true" ] || return 22

	local nandswap_sz_gb=`getprop $prop_nandswap_curr`
	nandswap_sz_mb=$(expr $nandswap_sz_gb \* 1024)

	dev_life=`getprop persist.sys.oplus.nandswap.devlife`
	if [ "$dev_life" == "false" ]; then
		if [ -f /sys/block/zram0/hybridswap_dev_life ]; then
			echo 1 > /sys/block/zram0/hybridswap_dev_life
		elif [ -f /proc/nandswap/dev_life ]; then
			echo 1 > /proc/nandswap/dev_life
		fi
	else
		if [ -f "/proc/nandswap/fn_enable" ] && [ $avail -gt $threshold ]; then
			[ "$condition" == "true" ] && fn_enable=`getprop "persist.sys.oplus.nandswap"`
			echo 0 > /proc/nandswap/dev_life
		fi
	fi

	return 0
}

function nandswapV2_init()
{
	if [ $hybridswap_has_insmod -eq 1 ]; then
		chmod o+w `ls -l /sys/block/zram0/hybridswap_* | grep ^'\-rw\-' | awk '{print $NF}'`
		memcg_root_path="/dev/memcg/"
		if [ -e "/sys/fs/cgroup/memory.swapd_memcgs_param" ]; then
			memcg_root_path="/sys/fs/cgroup/"
		else
			echo apps > /dev/memcg/apps/memory.name
			echo 300 > /dev/memcg/apps/memory.app_score
		fi
		echo "3 0 99 0 0 0 100 399 60 0 0 400 499 50 0 0 " > "${memcg_root_path}memory.swapd_memcgs_param"
		echo 400 > "${memcg_root_path}memory.app_score"
		echo root > "${memcg_root_path}memory.name"
		# FIXME: set system memcg pata in init.kernel.post_boot-lahaina.sh temporary
		# echo 500 > /dev/memcg/system/memory.app_score
		# echo systemserver > /dev/memcg/system/memory.name
		echo "$threshold_wakeup_hybridswapd" > "${memcg_root_path}memory.avail_buffers"
		echo "$zram_critical_threshold" > "${memcg_root_path}memory.zram_critical_threshold"
		echo 50 > "${memcg_root_path}memory.swapd_max_reclaim_size"
		echo "1000 50" > "${memcg_root_path}memory.swapd_shrink_parameter"
		echo 5000 > "${memcg_root_path}memory.max_skip_interval"
		echo 50 > "${memcg_root_path}memory.reclaim_exceed_sleep_ms"
		echo 60 > "${memcg_root_path}memory.cpuload_threshold"
		echo 30 > "${memcg_root_path}memory.max_reclaimin_size_mb"
		echo 80 > "${memcg_root_path}memory.zram_wm_ratio"
		echo 512 > "${memcg_root_path}memory.empty_round_skip_interval"
		echo 20 > "${memcg_root_path}memory.empty_round_check_threshold"
		echo 1 > /sys/block/zram0/hybridswap_loglevel
		echo -n "$hybridswap_partition" > /sys/block/zram0/hybridswap_loop_device
		echo ${hybridswap_enable} > /sys/block/zram0/hybridswap_enable
		echo "0-3" > "${memcg_root_path}memory.swapd_bind"
		echo "$zram_increase" > /sys/block/zram0/hybridswap_zram_increase
		hybridswap_init=1
	else
		write_nandswap_err $ERR_UNSUPPORTED
	fi
}

function nandswap_init()
{
	# santi check here
	if [ $zram2ufs_ratio -gt 100 ]; then
		write_nandswap_err $ERR_CHECKSZ
		return 22
	fi

	if [ $chp_supported -eq 1 ]; then
		# chp devices and swap partition: init in zram_init
		# chp devices and swapfile: not init
		return 0
	fi

	if [ $nandswapV2_supported -eq 1 ]; then
		nandswapV2_init
		return 0
	fi

	local real_sz=$(expr $nandswap_sz_mb \* 1024 \* 1024 \/ $NANDSWAP_SZ_RATIO)
	local offs=$(expr $real_sz \* $zram2ufs_ratio \/ 100)

	touch $swapfile_path
	[ "$data_type" == "f2fs" ] && $nandswap_tool -s1 $swapfile_path
	fallocate -l ${real_sz} -o 0 $swapfile_path
	#if [[ $hybridswap_has_insmod -eq 1 ]]; then
	#	dd if=/dev/zero of=$swapfile_path bs=1M count=$(expr $offs \/ 1024 \/ 1024)
	#fi

	if [ "$data_type" == "f2fs" ]; then
		local pin_ret=`$nandswap_tool -g $swapfile_path |awk '{print $2}'`
		if [ "$pin_ret" != "pinned" ]; then
			rm -rf $swapfile_path && write_nandswap_err $ERR_PINNED && return 22
		fi
	fi

	local file_sz=`ls -al $swapfile_path |awk '{print $5}'`
	if [ "$file_sz" != "$real_sz" ]; then
		rm -rf $swapfile_path && write_nandswap_err $ERR_CHECKSZ && return 22
	fi

	for i in {0..2} ; do
		losetup -f
		sleep 1
		loop_device=$(losetup -f -s $swapfile_path 2>&1)
		loop_device_ret=`echo $loop_device |awk -Floop '{print $1}'`
		if [ "$loop_device_ret" == "/dev/block/" ]; then
			break
		fi
		sleep 1
	done

	[ "$loop_device_ret" != "/dev/block/" ] && rm -rf $swapfile_path && write_nandswap_err $ERR_SET_LOOP && return 22

	set_dio=`$nandswap_tool -l $loop_device |awk '{print $2}'`
	if [ "$set_dio" == "success" ]; then
		if [ $hybridswap_has_insmod -eq 1 ]; then

			chmod o+w `ls -l /sys/block/zram0/hybridswap_* | grep ^'\-rw\-' | awk '{print $NF}'`
			memcg_root_path="/dev/memcg/"
			if [ -e "/sys/fs/cgroup/memory.swapd_memcgs_param" ]; then
				memcg_root_path="/sys/fs/cgroup/"
			else
				echo apps > /dev/memcg/apps/memory.name
				echo 300 > /dev/memcg/apps/memory.app_score
			fi
			echo "3 0 99 0 0 0 100 399 60 0 0 400 499 50 0 0 " > "${memcg_root_path}memory.swapd_memcgs_param"
			echo 400 > "${memcg_root_path}memory.app_score"
			echo root > "${memcg_root_path}memory.name"
			# FIXME: set system memcg pata in init.kernel.post_boot-lahaina.sh temporary
			# echo 500 > /dev/memcg/system/memory.app_score
			# echo systemserver > /dev/memcg/system/memory.name
			echo "$threshold_wakeup_hybridswapd" > "${memcg_root_path}memory.avail_buffers"
			echo $zram_critical_threshold > "${memcg_root_path}memory.zram_critical_threshold"
			echo 50 > "${memcg_root_path}memory.swapd_max_reclaim_size"
			echo "1000 50" > "${memcg_root_path}memory.swapd_shrink_parameter"
			echo 5000 > "${memcg_root_path}memory.max_skip_interval"
			echo 50 > "${memcg_root_path}memory.reclaim_exceed_sleep_ms"
			echo 60 > "${memcg_root_path}memory.cpuload_threshold"
			echo 30 > "${memcg_root_path}memory.max_reclaimin_size_mb"
			echo 80 > "${memcg_root_path}memory.zram_wm_ratio"
			echo 512 > "${memcg_root_path}memory.empty_round_skip_interval"
			echo 20 > "${memcg_root_path}memory.empty_round_check_threshold"
			echo 1 > /sys/block/zram0/hybridswap_loglevel
			echo -n $loop_device > /sys/block/zram0/hybridswap_loop_device
			echo ${hybridswap_enable} > /sys/block/zram0/hybridswap_enable
			echo "0-3" > "${memcg_root_path}memory.swapd_bind"
			echo "$zram_increase" > /sys/block/zram0/hybridswap_zram_increase
			#Qun.Lin@AD.Performancee, 2022/4/4, change cfg to mq-deadline
			loop_device_num=`echo $loop_device |awk -F/ '{print $4}'`
			echo mq-deadline > /sys/block/$loop_device_num/queue/scheduler
			hybridswap_init=1
		elif [ -f /proc/nandswap/fn_enable ]; then
			mkswap $loop_device
			# 2020 is just a magic number, must be consistent with the definition SWAP_NANDSWAP_PRIO in include/linux/swap.h
			swapon $loop_device -p 2020
			echo 1 > /proc/nandswap/fn_enable
		else
			losetup -d $loop_device
			rm -rf $swapfile_path
			write_nandswap_err $ERR_UNSUPPORTED
		fi
	else
		write_nandswap_err $ERR_SET_DIO
		losetup -d $loop_device
		rm -rf $swapfile_path
	fi

	return 0;
}

function support_memory_nirvana_feature()
{
	local file_product_feature="/my_product/etc/extension/com.oplus.oplus-feature.xml"
	local file_stock_feature="/my_stock/etc/extension/com.oplus.oplus-feature.xml"

	if [ -f "$file_product_feature" ]; then
		config_type=`cat $file_product_feature | grep "oplus.software.memory_nirvana.enable" | awk '{print $1}' | sed 's/<//'`
		echo "product: ${config_type}"
		if [ "$config_type" == "oplus-feature" ]; then
			echo "available product feature"
			return 1
		fi
		if [ "$config_type" == "unavailable-oplus-feature" ]; then
			echo "unavailable product feature"
			return 0
		fi
	fi

	if [ -f "$file_stock_feature" ]; then
		config_type=`cat $file_stock_feature | grep "oplus.software.memory_nirvana.enable" | awk '{print $1}' | sed 's/<//'`
		echo "stock: ${config_type}"
		if [ "$config_type" == "oplus-feature" ]; then
			echo "available stock feature"
			return 1
		fi
		if [ "$config_type" == "unavailable-oplus-feature" ]; then
			echo "unavailable stock feature"
			return 0
		fi
	fi

	return 0
}

function main()
{
	mem_total_str=`cat /proc/meminfo |grep MemTotal`
	mem_total=${mem_total_str:16:8}
	fn_enable=`getprop persist.sys.oplus.nandswap`
	os_type=$(getprop ro.oplus.os_type)
	if [ "$os_type" = "light_base" ]; then
		fn_enable=false
	fi
	kernel_version=`uname -r`
	fg_protect_enable=`getprop persist.sys.oplus.fg.protect.condition`
	exit_mm_optimize_enable=`getprop persist.sys.oplus.exit_mm_optimize_enable`

	product_id=`getprop ro.boot.prjname`
	if [ -n "$product_id" ]; then
		case $product_id in
			"24055"|"24279")
				echo 1 > /proc/oplus_mem/mask_kswapd_reclaim
				;;
			*)
			;;
		esac
	fi

	#disable compaction_proactivenss
	echo 0 > /proc/sys/vm/compaction_proactiveness

	if [ -z "$fg_protect_enable" ]; then
		fg_protect_enable=0
	fi

	# if kernel_version is 5.1*, use zstdn for better performance
	if [[ "$kernel_version" == "5.1"* ]]; then
		zram1_comp_algorithm="zstdn"
	fi

	# We will double per-cpu pages in our uxmem ko. Our ko is loaded after
	# pcp pages set. So here we write something to percpu_pagelist_fraction
	# then we write it back immediatelly to trigger a pcp pages update.
	# It is not needed for kernels above 5.15 as their pcp pages is quite large.
	if [[ "$kernel_version" == "5.10"* ]]; then
		percpu_pagelist_fraction=`cat /proc/sys/vm/percpu_pagelist_fraction`
		echo 10000 > /proc/sys/vm/percpu_pagelist_fraction
		echo $percpu_pagelist_fraction > /proc/sys/vm/percpu_pagelist_fraction
	fi

	if [ -e "/sys/kernel/mm/chp/enabled" ]; then
		chp_supported=1
	fi

	if [ -z $mem_total ]; then
		echo -e "read meminfo failed\n"
		exit -1
	fi

	if [ $chp_supported -eq 1 ]; then
		local val=0
		if [ "$my_engineering_type" != "release" ]; then
			val=1
		fi
		echo $val > /sys/kernel/mm/chp/bug_on
	fi

	if [ -L "/dev/block/mapper/hybridswap_crypto" ]; then
		hybridswap_partition="/dev/block/mapper/hybridswap_crypto"
	fi

	if [ -L $hybridswap_partition -a "$fn_enable" == "true" ]; then
		nandswapV2_supported=1
	fi

	load_mm_config
	configure_platform_parameters
	set_mm_config

	configure_nandswap_parameters
	ret=$?
	if [ $ret -eq 22 ]; then
		nandswap_sz_mb=0
		nandswapV2_supported=0
		configure_zram_parameters
		setprop $prop_nandswap_curr 0
		zram_init
		exit
	fi

	configure_zram_parameters
	zram_init
	if [ "$fn_enable" == "true" -a "$nandswap_sz_mb" != "0" ]; then
		nandswap_init
	else
		write_nandswap_err $ERR_SET_ZRAM
		setprop $prop_nandswap_curr 0
	fi

	setprop persist.sys.oplus.hybridswap_app_memcg false
	setprop persist.sys.oplus.hybridswap_app_uid_memcg false
	if [ ! -e "/dev/memcg/memory.stat" ]; then
		# if memcg-v1 not found disable memcg
		exit 0
	fi

	if [ $hybridswap_init -eq 1 ]; then
		if [[ "$kernel_version" == "5.1"* ]]; then
			if [ $chp_supported -eq 0 ] && [ $mem_total -gt 4194304 ] && [ ! -f /my_product/etc/extension/sys_mt_config_list.xml ]; then
				setprop persist.sys.oplus.hybridswap_app_uid_memcg true
			fi
		fi
		support_memory_nirvana_feature
		support_nirvana=$?
		if [ "$support_nirvana" -eq 1 ] && [ $mem_total -gt 6291456 ]; then
			setprop persist.sys.oplus.hybridswap_app_uid_memcg true
		fi
		setprop persist.sys.oplus.hybridswap_app_memcg true
	fi

	if [ $fg_protect_enable -eq 1 ]; then
		setprop persist.sys.oplus.hybridswap_app_uid_memcg true
		setprop persist.sys.oplus.hybridswap_app_memcg true
	fi

	if [ $exit_mm_optimize_enable -eq 1 ]; then
		setprop persist.sys.oplus.hybridswap_app_uid_memcg true
		setprop persist.sys.oplus.hybridswap_app_memcg true
		echo 1 > /proc/oplus_exit_mm_opitimize/enable
	fi
}

function post_fs_data()
{
	ezr_str=`cat /proc/meminfo | grep "Ezr:"`

	#multi-gen LRU should never be disabled when ERZ is enabled
	if [ -z "$ezr_str" ]; then
		echo 0 > /sys/kernel/mm/lru_gen/enabled
	fi
}

stage="$1"
case "$stage" in
	"post-fs-data")
		post_fs_data
	;;
	"__corona_main")
		main
	;;
	"boot_completed")
		sh "$0" "__corona_main"
		# run mm-sys as a post-official overlay so native nandswap optimizations stay intact.
		if [ -f "/odm/etc/init.oplus.mm-sys.sh" ]; then
			sh "/odm/etc/init.oplus.mm-sys.sh"
		fi
	;;
esac
