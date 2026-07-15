#!/usr/bin/env python3
import base64
import os
import sqlite3
import sys

LAUNCHER_DB = '/data/user_de/0/com.android.launcher/databases/launcher.db'
ICONS_DB = '/data/user_de/0/com.android.launcher/databases/app_icons.db'


def normalize_component(pkg: str, component: str) -> str:
    component = (component or '').strip()
    if not component:
        return ''
    if '/' not in component:
        return component
    package_name, class_name = component.split('/', 1)
    if class_name.startswith('.'):
        class_name = f'{package_name}{class_name}'
    return f'{package_name}/{class_name}'


def iter_component_patterns(pkg: str, component: str):
    raw = (component or '').strip()
    normalized = normalize_component(pkg, raw)
    patterns = []
    if raw:
        patterns.append(raw)
    if normalized and normalized != raw:
        patterns.append(normalized)
    seen = set()
    for item in patterns:
        if item and item not in seen:
            seen.add(item)
            yield item


def open_readonly_db(path: str):
    if not os.path.exists(path):
        return None
    try:
        return sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    except Exception:
        return None


def query_icons_label_cursor(cur, pkg: str, component: str) -> str:
    if cur is None:
        return ''
    try:
        for target in iter_component_patterns(pkg, component):
            cur.execute(
                "SELECT label FROM icons WHERE componentName = ? AND label IS NOT NULL AND label != '' ORDER BY length(label) ASC LIMIT 1",
                (target,),
            )
            row = cur.fetchone()
            if row and row[0]:
                return str(row[0]).strip()
        cur.execute(
            "SELECT label FROM icons WHERE componentName LIKE ? AND label IS NOT NULL AND label != '' ORDER BY length(label) ASC LIMIT 1",
            (f'{pkg}/%',),
        )
        row = cur.fetchone()
        if row and row[0]:
            return str(row[0]).strip()
    except Exception:
        pass
    return ''


def query_launcher_label_cursor(cur, pkg: str, component: str) -> str:
    if cur is None:
        return ''
    try:
        for table in ('singledesktopitems', 'singledesktopitems_draw', 'singledesktopitems_simple'):
            for target in iter_component_patterns(pkg, component):
                try:
                    cur.execute(
                        f"SELECT title FROM {table} WHERE intent LIKE ? AND title IS NOT NULL AND title != '' ORDER BY length(title) ASC LIMIT 1",
                        (f'%component={target};%',),
                    )
                    row = cur.fetchone()
                    if row and row[0]:
                        return str(row[0]).strip()
                except Exception:
                    pass
        for table in ('singledesktopitems', 'singledesktopitems_draw', 'singledesktopitems_simple'):
            try:
                cur.execute(
                    f"SELECT title FROM {table} WHERE intent LIKE ? AND title IS NOT NULL AND title != '' ORDER BY length(title) ASC LIMIT 1",
                    (f'%component={pkg}/%',),
                )
                row = cur.fetchone()
                if row and row[0]:
                    return str(row[0]).strip()
            except Exception:
                pass
    except Exception:
        pass
    return ''


def query_icons_label(pkg: str, component: str) -> str:
    con = open_readonly_db(ICONS_DB)
    if con is None:
        return ''
    try:
        return query_icons_label_cursor(con.cursor(), pkg, component)
    finally:
        con.close()


def query_launcher_label(pkg: str, component: str) -> str:
    con = open_readonly_db(LAUNCHER_DB)
    if con is None:
        return ''
    try:
        return query_launcher_label_cursor(con.cursor(), pkg, component)
    finally:
        con.close()


def query_label(pkg: str, component: str = '') -> str:
    return query_icons_label(pkg, component) or query_launcher_label(pkg, component)


def query_labels_batch(items):
    result = []
    icons_con = open_readonly_db(ICONS_DB)
    launcher_con = open_readonly_db(LAUNCHER_DB)
    icons_cur = icons_con.cursor() if icons_con is not None else None
    launcher_cur = launcher_con.cursor() if launcher_con is not None else None
    try:
        for item in items:
            pkg = item[0] if len(item) > 0 else ''
            component = item[1] if len(item) > 1 else ''
            if not pkg:
                continue
            label = query_icons_label_cursor(icons_cur, pkg, component)
            if not label:
                label = query_launcher_label_cursor(launcher_cur, pkg, component)
            result.append((pkg, component, label or pkg))
    finally:
        if icons_con is not None:
            icons_con.close()
        if launcher_con is not None:
            launcher_con.close()
    return result


def query_icon_blob(pkg: str, component: str):
    if not os.path.exists(ICONS_DB):
        return None
    con = sqlite3.connect(ICONS_DB)
    cur = con.cursor()
    try:
        for target in iter_component_patterns(pkg, component):
            cur.execute(
                "SELECT icon FROM icons WHERE componentName = ? AND icon IS NOT NULL ORDER BY length(icon) DESC LIMIT 1",
                (target,),
            )
            row = cur.fetchone()
            if row and row[0]:
                con.close()
                return row[0]
        cur.execute(
            "SELECT icon FROM icons WHERE componentName LIKE ? AND icon IS NOT NULL ORDER BY length(icon) DESC LIMIT 1",
            (f'{pkg}/%',),
        )
        row = cur.fetchone()
        if row and row[0]:
            con.close()
            return row[0]
    except Exception:
        pass
    con.close()
    return None


def detect_ext(blob: bytes) -> str:
    head = bytes(blob[:12])
    if head.startswith(bytes.fromhex('89504e47')):
        return 'png'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'webp'
    if head[:3] == bytes.fromhex('ffd8ff'):
        return 'jpg'
    return ''


def write_icon(pkg: str, outdir: str, component: str = '') -> str:
    blob = query_icon_blob(pkg, component)
    if not blob:
        return ''
    ext = detect_ext(blob)
    if not ext:
        return ''
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, f'{pkg}.{ext}')
    with open(out, 'wb') as fp:
        fp.write(blob)
    return out


def icon_data_uri(pkg: str, component: str = '') -> str:
    blob = query_icon_blob(pkg, component)
    if not blob:
        return ''
    ext = detect_ext(blob)
    if not ext:
        return ''
    mime = 'image/png'
    if ext == 'webp':
        mime = 'image/webp'
    elif ext == 'jpg':
        mime = 'image/jpeg'
    encoded = base64.b64encode(bytes(blob)).decode('ascii')
    return f'data:{mime};base64,{encoded}'


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    pkg = sys.argv[2] if len(sys.argv) > 2 else ''
    if cmd == 'label':
        component = sys.argv[3] if len(sys.argv) > 3 else ''
        print(query_label(pkg, component), end='')
    elif cmd == 'icon':
        outdir = sys.argv[3] if len(sys.argv) > 3 else '/root/make/Corona_module/webroot/app_icons'
        component = sys.argv[4] if len(sys.argv) > 4 else ''
        print(write_icon(pkg, outdir, component), end='')
    elif cmd == 'icon-data':
        component = sys.argv[3] if len(sys.argv) > 3 else ''
        print(icon_data_uri(pkg, component), end='')
    elif cmd == 'label-batch':
        raw = sys.argv[2] if len(sys.argv) > 2 else ''
        items = []
        for line in raw.split('\n'):
            if not line.strip():
                continue
            parts = line.split('|', 1)
            package_name = parts[0].strip()
            component_name = parts[1].strip() if len(parts) > 1 else ''
            items.append((package_name, component_name))
        for package_name, component_name, label in query_labels_batch(items):
            print(f'{package_name}|{component_name}|{label}')
