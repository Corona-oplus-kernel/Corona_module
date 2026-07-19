#!/system/bin/sh

MODDIR=$(CDPATH= cd -- "${0%/*}/.." 2>/dev/null && pwd)
CONFIG_DIR=${CORONA_CONFIG_DIR:-"$MODDIR/config"}
CONFIG_FILE="$CONFIG_DIR/auto_affinity.conf"
THREAD_RULES_FILE="$CONFIG_DIR/thread_priority.conf"
STATE_FILE="$MODDIR/.auto_affinity_state"
PROC_ROOT=${CORONA_PROC_ROOT:-/proc}
CPU_ROOT=${CORONA_CPU_ROOT:-/sys/devices/system/cpu}
TASKSET_BIN=${CORONA_TASKSET_BIN:-taskset}

enabled=0
ebpf=1
default_class=balanced
efficiency_cpus=
balanced_cpus=
performance_cpus=
exclude_packages=

trim_value() {
    printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

load_config() {
    [ -f "$CONFIG_FILE" ] || return 0
    while IFS='=' read -r config_key config_value; do
        config_key=$(trim_value "$config_key")
        config_value=$(trim_value "$config_value")
        case "$config_key" in
            enabled) enabled="$config_value" ;;
            default_class) default_class="$config_value" ;;
            efficiency_cpus) efficiency_cpus="$config_value" ;;
            balanced_cpus) balanced_cpus="$config_value" ;;
            performance_cpus) performance_cpus="$config_value" ;;
            exclude_packages) exclude_packages="$config_value" ;;
        esac
    done < "$CONFIG_FILE"
    case "$default_class" in
        efficiency|balanced|performance) ;;
        *) default_class=balanced ;;
    esac
}

write_default_config() {
    mkdir -p "$CONFIG_DIR"
    [ -f "$CONFIG_FILE" ] && return 0
    cat > "$CONFIG_FILE" <<'EOF'
enabled=0
ebpf=1
default_class=balanced
efficiency_cpus=
balanced_cpus=
performance_cpus=
exclude_packages=
scan_interval_ms=1000
load_learning=1
thermal_control=1
thermal_warm_c=65
thermal_severe_c=75
EOF
}

set_enabled() {
    case "$1" in
        0|1) ;;
        *) return 1 ;;
    esac
    write_default_config
    if grep -q '^enabled=' "$CONFIG_FILE"; then
        sed -i "s/^enabled=.*/enabled=$1/" "$CONFIG_FILE"
    else
        printf 'enabled=%s\n' "$1" >> "$CONFIG_FILE"
    fi
}

normalize_cpu_list() {
    printf '%s' "$1" | tr ' ' ',' | sed 's/,,*/,/g;s/^,//;s/,$//'
}

detect_topology() {
    online_cpus=$(cat "$CPU_ROOT/online" 2>/dev/null)
    [ -n "$online_cpus" ] || online_cpus=0
    topology_entries=
    for policy_dir in "$CPU_ROOT"/cpufreq/policy*; do
        [ -d "$policy_dir" ] || continue
        policy_cpus=$(cat "$policy_dir/related_cpus" 2>/dev/null)
        [ -n "$policy_cpus" ] || policy_cpus=$(cat "$policy_dir/affected_cpus" 2>/dev/null)
        [ -n "$policy_cpus" ] || continue
        policy_freq=$(cat "$policy_dir/cpuinfo_max_freq" 2>/dev/null)
        [ -n "$policy_freq" ] || policy_freq=$(cat "$policy_dir/scaling_max_freq" 2>/dev/null)
        [ -n "$policy_freq" ] || policy_freq=0
        topology_entries="${topology_entries}${policy_freq}|$(normalize_cpu_list "$policy_cpus")
"
    done
    sorted_topology=$(printf '%s' "$topology_entries" | sed '/^$/d' | sort -n -t'|' -k1,1)
    detected_efficiency=$(printf '%s\n' "$sorted_topology" | head -n 1 | cut -d'|' -f2)
    detected_performance=$(printf '%s\n' "$sorted_topology" | tail -n 1 | cut -d'|' -f2)
    [ -n "$detected_efficiency" ] || detected_efficiency="$online_cpus"
    [ -n "$detected_performance" ] || detected_performance="$online_cpus"
    detected_balanced="$online_cpus"
    [ -n "$efficiency_cpus" ] || efficiency_cpus="$detected_efficiency"
    [ -n "$balanced_cpus" ] || balanced_cpus="$detected_balanced"
    [ -n "$performance_cpus" ] || performance_cpus="$detected_performance"
    efficiency_cpus=$(normalize_cpu_list "$efficiency_cpus")
    balanced_cpus=$(normalize_cpu_list "$balanced_cpus")
    performance_cpus=$(normalize_cpu_list "$performance_cpus")
}

cpu_list_to_mask() {
    cpu_list=$(normalize_cpu_list "$1")
    cpu_mask=0
    old_ifs=$IFS
    IFS=','
    set -- $cpu_list
    IFS=$old_ifs
    for cpu_part in "$@"; do
        case "$cpu_part" in
            *-*)
                cpu_start=${cpu_part%-*}
                cpu_end=${cpu_part#*-}
                case "$cpu_start:$cpu_end" in
                    *[!0-9:]*|'':*) continue ;;
                esac
                while [ "$cpu_start" -le "$cpu_end" ]; do
                    cpu_mask=$((cpu_mask | (1 << cpu_start)))
                    cpu_start=$((cpu_start + 1))
                done
                ;;
            *)
                case "$cpu_part" in
                    ''|*[!0-9]*) continue ;;
                esac
                cpu_mask=$((cpu_mask | (1 << cpu_part)))
                ;;
        esac
    done
    printf '%x\n' "$cpu_mask"
}

csv_contains() {
    csv_value=",$(printf '%s' "$1" | tr -d ' '),"
    case "$csv_value" in
        *,"$2",*) return 0 ;;
    esac
    return 1
}

has_manual_rules() {
    [ -f "$THREAD_RULES_FILE" ] || return 1
    awk -F'[|=]' -v package_name="$1" '$1 == package_name { found = 1; exit } END { exit found ? 0 : 1 }' "$THREAD_RULES_FILE"
}

package_pids() {
    target_package="$1"
    for process_dir in "$PROC_ROOT"/[0-9]*; do
        [ -d "$process_dir" ] || continue
        process_name=$(tr '\000' '\n' < "$process_dir/cmdline" 2>/dev/null | head -n 1)
        case "$process_name" in
            "$target_package"|"$target_package":*) ;;
            *) continue ;;
        esac
        process_uid=$(awk '/^Uid:/ { print $2; exit }' "$process_dir/status" 2>/dev/null)
        [ -n "$process_uid" ] && [ "$process_uid" -ge 10000 ] 2>/dev/null || continue
        printf '%s\n' "${process_dir##*/}"
    done
}

classify_thread() {
    thread_name="$1"
    case "$thread_name" in
        RenderThread|ThreadedRenderer|UnityMain|UnityGfx*|GLThread*|Vulkan*|GameThread|RHIThread|*Render*|*Gpu*|*GPU*) printf 'performance\n' ;;
        Audio*|*Audio*|Codec*|*Codec*|Binder:*|HwBinder:*|Worker*|*Worker*|Job*|*Job*) printf 'balanced\n' ;;
        Finalizer*|ReferenceQueueD|HeapTaskDaemon|Profile\ Saver|Jit\ thread\ pool|Signal\ Catcher|Background*|*Background*|Idle*|*Idle*|pool-*|*Network*|*OkHttp*|*Http*|*IO*) printf 'efficiency\n' ;;
        *) printf '%s\n' "$default_class" ;;
    esac
}

class_cpu_list() {
    case "$1" in
        efficiency) printf '%s\n' "$efficiency_cpus" ;;
        performance) printf '%s\n' "$performance_cpus" ;;
        *) printf '%s\n' "$balanced_cpus" ;;
    esac
}

write_state() {
    state_status="$1"
    state_package="$2"
    state_applied="$3"
    state_skipped="$4"
    cat > "$STATE_FILE" <<EOF
status=$state_status
package=$state_package
applied=$state_applied
skipped=$state_skipped
efficiency_cpus=$efficiency_cpus
balanced_cpus=$balanced_cpus
performance_cpus=$performance_cpus
timestamp=$(date +%s)
EOF
}

apply_package() {
    target_package="$1"
    [ "$enabled" = "1" ] || { write_state disabled "$target_package" 0 0; return 0; }
    [ -n "$target_package" ] || return 1
    csv_contains "$exclude_packages" "$target_package" && { write_state excluded "$target_package" 0 0; return 0; }
    has_manual_rules "$target_package" && { write_state manual-rule "$target_package" 0 0; return 0; }
    detect_topology
    applied_count=0
    skipped_count=0
    for process_id in $(package_pids "$target_package"); do
        for task_dir in "$PROC_ROOT/$process_id"/task/[0-9]*; do
            [ -d "$task_dir" ] || continue
            thread_id=${task_dir##*/}
            thread_name=$(cat "$task_dir/comm" 2>/dev/null)
            [ -n "$thread_name" ] || { skipped_count=$((skipped_count + 1)); continue; }
            affinity_class=$(classify_thread "$thread_name")
            affinity_cpus=$(class_cpu_list "$affinity_class")
            affinity_mask=$(cpu_list_to_mask "$affinity_cpus")
            if [ -n "$affinity_mask" ] && [ "$affinity_mask" != "0" ] && "$TASKSET_BIN" -p "$affinity_mask" "$thread_id" >/dev/null 2>&1; then
                applied_count=$((applied_count + 1))
            else
                skipped_count=$((skipped_count + 1))
            fi
        done
    done
    write_state applied "$target_package" "$applied_count" "$skipped_count"
}

print_status() {
    detect_topology
    printf 'enabled=%s\n' "$enabled"
    printf 'default_class=%s\n' "$default_class"
    printf 'efficiency_cpus=%s\n' "$efficiency_cpus"
    printf 'balanced_cpus=%s\n' "$balanced_cpus"
    printf 'performance_cpus=%s\n' "$performance_cpus"
    [ -f "$STATE_FILE" ] && cat "$STATE_FILE"
}

write_default_config
load_config

case "$1" in
    apply) apply_package "$2" ;;
    detect) detect_topology; printf 'efficiency=%s\nbalanced=%s\nperformance=%s\n' "$efficiency_cpus" "$balanced_cpus" "$performance_cpus" ;;
    enable) set_enabled 1 ;;
    disable) set_enabled 0 ;;
    status|'') print_status ;;
    *) exit 1 ;;
esac
