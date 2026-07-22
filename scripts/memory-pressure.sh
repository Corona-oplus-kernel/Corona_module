#!/system/bin/sh

SCRIPT_DIR=${0%/*}
MODDIR=${SCRIPT_DIR%/*}
SOURCE_CONF=${CORONA_PRESSURE_CONFIG:-"$MODDIR/config/memory_pressure.conf"}
RUNTIME_CONF="$MODDIR/config/.memory_pressure.runtime.conf"
PID_FILE="$MODDIR/config/.memory_pressure.pid"
BASELINE_FILE="$MODDIR/config/.memory_pressure.baseline"
CORONAD="$MODDIR/bin/coronad"

get_value() {
    [ -f "$1" ] && grep -m1 "^$2=" "$1" 2>/dev/null | cut -d'=' -f2-
}

coronad_enabled() {
    [ "$(get_value "$MODDIR/config/coronad.conf" enabled)" = "1" ]
}

pid_is_daemon() {
    pid="$1"
    [ -n "$pid" ] && [ -d "/proc/$pid" ] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'memory-pressure.sh.*daemon'
}

write_swappiness() {
    value="$1"
    case "$value" in ''|*[!0-9]*) return 1 ;; esac
    for node in /proc/sys/vm/swappiness /dev/memcg/apps/memory.swappiness; do
        [ -f "$node" ] || continue
        current=$(cat "$node" 2>/dev/null | tr -d ' \n')
        [ "$current" = "$value" ] || echo "$value" > "$node" 2>/dev/null
    done
}

restore_baseline() {
    [ -f "$BASELINE_FILE" ] || return 0
    baseline=$(cat "$BASELINE_FILE" 2>/dev/null | tr -d ' \n')
    write_swappiness "$baseline"
    rm -f "$BASELINE_FILE"
}

stop_daemon() {
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if pid_is_daemon "$pid"; then
        kill "$pid" 2>/dev/null
        count=0
        while [ -d "/proc/$pid" ] && [ "$count" -lt 20 ]; do
            sleep 0.1
            count=$((count + 1))
        done
    fi
    rm -f "$PID_FILE"
    restore_baseline
}

profile_values() {
    case "$1" in
        sensitive) echo '0.50 2.00 170 200 4' ;;
        conservative) echo '2.00 8.00 140 180 8' ;;
        *) echo '1.00 5.00 160 200 6' ;;
    esac
}

pressure_avg10() {
    awk '/^some / { for (i = 1; i <= NF; i++) if ($i ~ /^avg10=/) { sub(/^avg10=/, "", $i); print $i; exit } }' /proc/pressure/memory 2>/dev/null
}

pressure_enabled() {
    config="$SOURCE_CONF"
    [ -f "$RUNTIME_CONF" ] && config="$RUNTIME_CONF"
    [ "$(get_value "$config" enabled)" = "1" ]
}

print_status() {
    enabled=0
    pressure_enabled && enabled=1
    running=0
    manager=none

    if [ "$enabled" = "1" ] && [ -x "$CORONAD" ] && coronad_enabled; then
        corona_status=$(CORONA_MODDIR="$MODDIR" "$CORONAD" status 2>/dev/null)
        corona_running=$(printf '%s\n' "$corona_status" | awk -F= '$1 == "running" { print $2; exit }')
        corona_pressure=$(printf '%s\n' "$corona_status" | awk -F= '$1 == "memory_pressure" { print $2; exit }')
        if [ "$corona_running" = "1" ] && [ "$corona_pressure" = "1" ]; then
            running=1
            manager=coronad
        fi
    fi

    if [ "$running" = "0" ] && [ "$enabled" = "1" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if pid_is_daemon "$pid"; then
            running=1
            manager=legacy
        fi
    fi

    echo "enabled=$enabled"
    echo "running=$running"
    echo "manager=$manager"
    echo "avg10=$(pressure_avg10)"
    echo "swappiness=$(cat /proc/sys/vm/swappiness 2>/dev/null | tr -d ' \n')"
}

run_daemon() {
    [ -r /proc/pressure/memory ] || exit 2
    echo $$ > "$PID_FILE"
    baseline=$(cat /proc/sys/vm/swappiness 2>/dev/null | tr -d ' \n')
    case "$baseline" in ''|*[!0-9]*) baseline=100 ;; esac
    [ -f "$BASELINE_FILE" ] || echo "$baseline" > "$BASELINE_FILE"

    profile=$(get_value "$RUNTIME_CONF" profile)
    set -- $(profile_values "$profile")
    moderate=$1
    critical=$2
    pressure_target=$3
    critical_target=$4
    interval=$5
    last_target=''

    cleanup() {
        trap - TERM INT HUP EXIT
        rm -f "$PID_FILE"
        restore_baseline
        exit 0
    }
    trap cleanup TERM INT HUP EXIT

    while :; do
        avg10=$(pressure_avg10)
        target=$baseline
        if [ -n "$avg10" ]; then
            level=$(awk -v value="$avg10" -v moderate="$moderate" -v critical="$critical" 'BEGIN { if (value >= critical) print 2; else if (value >= moderate) print 1; else print 0 }')
            [ "$level" = "1" ] && target=$pressure_target
            [ "$level" = "2" ] && target=$critical_target
        fi
        if [ "$target" != "$last_target" ]; then
            write_swappiness "$target"
            last_target=$target
        fi
        sleep "$interval"
    done
}

apply_config() {
    if [ -f "$SOURCE_CONF" ]; then
        cp -f "$SOURCE_CONF" "$RUNTIME_CONF"
    else
        rm -f "$RUNTIME_CONF"
    fi
    enabled=$(get_value "$RUNTIME_CONF" enabled)
    stop_daemon
    if [ -x "$CORONAD" ] && coronad_enabled; then
        corona_pid=$(cat "$MODDIR/config/.coronad.pid" 2>/dev/null)
        if [ -n "$corona_pid" ] && [ -d "/proc/$corona_pid" ]; then
            CORONA_MODDIR="$MODDIR" "$CORONAD" reload >/dev/null 2>&1
            return $?
        fi
        [ "$enabled" = "1" ] || return 0
        CORONA_MODDIR="$MODDIR" "$CORONAD" start >/dev/null 2>&1
        return $?
    fi
    [ "$enabled" = "1" ] || return 0
    [ -r /proc/pressure/memory ] || return 2
    nohup /system/bin/sh "$0" daemon >/dev/null 2>&1 &
}

case "$1" in
    daemon) run_daemon ;;
    stop) stop_daemon ;;
    status) print_status ;;
    *) apply_config ;;
esac
