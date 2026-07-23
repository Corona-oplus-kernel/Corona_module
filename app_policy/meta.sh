#!/system/bin/sh

humanize_package_name() {
    pkg="$1"
    printf '%s' "$pkg" | awk -F'.' '
        {
            n=0
            for (i=1; i<=NF; i++) {
                part=$i
                low=tolower(part)
                if (low=="com" || low=="org" || low=="net" || low=="android" || low=="app" || low=="cn") continue
                keep[++n]=part
            }
            if (n==0) {
                print $NF
                next
            }
            start=n>1 ? n-1 : n
            out=""
            for (i=start; i<=n; i++) {
                gsub(/[_-]+/, " ", keep[i])
                if (length(keep[i])>0) keep[i]=toupper(substr(keep[i],1,1)) substr(keep[i],2)
                out = out (out=="" ? "" : " ") keep[i]
            }
            print out
        }
    '
}

get_package_label() {
    pkg="$1"
    label=$(dumpsys package "$pkg" 2>/dev/null | sed -n 's/^[[:space:]]*application-label://p' | head -n1)
    [ -n "$label" ] || label=$(humanize_package_name "$pkg")
    echo "$label" | tr '	
' '   '
}

resolve_launcher_component() {
    pkg="$1"
    cmd package resolve-activity --brief "$pkg" 2>/dev/null | awk '/^[A-Za-z0-9_.-]+\// { comp=$1 } /^[[:space:]]+[A-Za-z0-9_.-]+\// { gsub(/^[[:space:]]+/, "", $1); comp=$1 } END { if (comp) print comp }'
}

output_label() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    label=$(run_package_meta label "$pkg" "$component")
    [ -n "$label" ] && [ "$label" != "$pkg" ] && { printf '%s' "$label"; return 0; }
    label=$(run_launcher_meta label "$pkg" "$component")
    [ -n "$label" ] && { printf '%s' "$label"; return 0; }
    get_package_label "$pkg"
}

output_label_batch() {
    payload="$1"
    batch=$(run_package_meta label-batch "$payload")
    [ -n "$batch" ] || batch=$(run_launcher_meta label-batch "$payload")
    if [ -n "$batch" ]; then
        printf '%s\n' "$batch"
        return 0
    fi
    printf '%s\n' "$payload" | while IFS='|' read -r pkg component; do
        [ -n "$pkg" ] || continue
        component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
        label=$(output_label "$pkg" "$component")
        printf '%s|%s|%s\n' "$pkg" "$component" "$label"
    done
}

list_apps() {
    user_file=$(mktemp)
    launch_file=$(mktemp)
    pm list packages -3 2>/dev/null | cut -d: -f2 | sort -u > "$user_file"
    cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --brief 2>/dev/null |
        awk '/^[[:space:]]+[A-Za-z0-9_.-]+\// { gsub(/^[[:space:]]+/, "", $1); comp=$1; split(comp, a, "/"); if (a[1] != "" && !seen[a[1]]++) print a[1] "|" comp } /^[A-Za-z0-9_.-]+\// { comp=$1; split(comp, a, "/"); if (a[1] != "" && !seen[a[1]]++) print a[1] "|" comp }' > "$launch_file"
    awk -F'|' 'NR==FNR { user[$1]=1; next } user[$1] { print $0 }' "$user_file" "$launch_file"
    rm -f "$user_file" "$launch_file"
}

list_zip_entries() {
    archive="$1"
    if command -v unzip >/dev/null 2>&1; then
        unzip -Z1 "$archive" 2>/dev/null && return 0
    fi
    if command -v toybox >/dev/null 2>&1; then
        toybox unzip -l "$archive" 2>/dev/null | awk 'NF {print $NF}' | sed '1,/^Name$/d' && return 0
    fi
    [ -n "$BUSYBOX" ] && "$BUSYBOX" unzip -l "$archive" 2>/dev/null | awk 'NF && $NF !~ /^Archive:|files?$|Date|Length|----/ {print $NF}'
}

find_apk_icon() {
    APK_PATH=$(pm path "$1" 2>/dev/null | sed -n 's/^package://p' | head -n1)
    [ -f "$APK_PATH" ] || return 1
    ICON_ENTRY=$(list_zip_entries "$APK_PATH" | grep -E '^res/(mipmap|drawable)[^/]*/((ic_launcher|app_icon|logo|icon)[^/]*)\.(png|webp|jpg|jpeg)$' | sort | tail -n1)
    [ -n "$ICON_ENTRY" ] || ICON_ENTRY=$(unzip -l "$APK_PATH" 2>/dev/null | awk '/ res\// && $4 ~ /\.(png|webp|jpg|jpeg)$/ {print $1 " " $4}' | sort -n | tail -n1 | awk '{print $2}')
    [ -n "$ICON_ENTRY" ]
}

extract_zip_entry() {
    if command -v unzip >/dev/null 2>&1; then unzip -p "$1" "$2" > "$3" 2>/dev/null
    elif command -v toybox >/dev/null 2>&1; then toybox unzip -p "$1" "$2" > "$3" 2>/dev/null
    elif [ -n "$BUSYBOX" ]; then "$BUSYBOX" unzip -p "$1" "$2" > "$3" 2>/dev/null
    fi
}

output_icon() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    launcher_icon=$(run_launcher_meta icon-data "$pkg" "$component")
    [ -n "$launcher_icon" ] && { printf '%s' "$launcher_icon"; return 0; }
    find_apk_icon "$pkg" || exit 0
    tmp=$(mktemp)
    extract_zip_entry "$APK_PATH" "$ICON_ENTRY" "$tmp"
    [ -s "$tmp" ] || {
        rm -f "$tmp"
        exit 0
    }
    mime=image/png
    case "$ICON_ENTRY" in
        *.webp) mime=image/webp ;;
        *.jpg|*.jpeg) mime=image/jpeg ;;
    esac
    if command -v base64 >/dev/null 2>&1; then
        printf 'data:%s;base64,%s' "$mime" "$(base64 "$tmp" | tr -d '
')"
    elif [ -n "$BUSYBOX" ]; then
        printf 'data:%s;base64,%s' "$mime" "$("$BUSYBOX" base64 "$tmp" | tr -d '
')"
    fi
    rm -f "$tmp"
}

output_icon_file() {
    pkg="$1"
    component="${2:-$(resolve_launcher_component "$pkg") }"
    component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
    mkdir -p "$ICONS_DIR"
    launcher_icon=$(run_launcher_meta icon "$pkg" "$CHROOT_ICONS_DIR" "$component")
    if [ -n "$launcher_icon" ]; then
        filename=$(basename "$launcher_icon")
        if [ -f "$ICONS_DIR/$filename" ]; then
            printf '%s' "$ICONS_DIR/$filename"
            exit 0
        fi
    fi
    find_apk_icon "$pkg" || exit 0
    ext=${ICON_ENTRY##*.}
    out="$ICONS_DIR/$pkg.$ext"
    if [ -s "$out" ]; then
        printf '%s' "$out"
        exit 0
    fi
    extract_zip_entry "$APK_PATH" "$ICON_ENTRY" "$out"
    [ -s "$out" ] && printf '%s' "$out" || rm -f "$out"
}

output_app_meta() {
    payload=$(list_apps)
    [ -n "$payload" ] || return 0
    batch=$(output_label_batch "$payload")
    if [ -n "$batch" ]; then
        printf '%s\n' "$batch"
    else
        printf '%s
' "$payload" | while IFS='|' read -r pkg component; do
            [ -n "$pkg" ] || continue
            component=$(printf '%s' "$component" | sed 's/[[:space:]]*$//')
            label=$(output_label "$pkg" "$component")
            printf '%s|%s|%s
' "$pkg" "$component" "$label"
        done
    fi
}
