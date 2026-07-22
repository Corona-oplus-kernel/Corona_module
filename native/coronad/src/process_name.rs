fn valid_package_name(value: &str) -> bool {
    value.contains('.')
        && value.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        })
        && value != "android"
        && value != "com.android.shell"
        && value != "me.weishu.kernelsu"
}

pub(super) fn package_from_process_name(process_name: &str) -> Option<String> {
    let base = process_name.split(':').next().unwrap_or_default().trim();
    if base.is_empty() {
        return None;
    }
    if !base.starts_with('/') {
        return valid_package_name(base).then(|| base.to_string());
    }

    let parts = base.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
    for (index, part) in parts.iter().enumerate() {
        let candidate = match *part {
            "user" | "user_de"
                if parts.get(index + 1).is_some_and(|value| {
                    value.bytes().all(|byte| byte.is_ascii_digit())
                }) => parts.get(index + 2).copied(),
            "data" if parts.get(index + 1) == Some(&"data") => parts.get(index + 2).copied(),
            _ => None,
        };
        if let Some(candidate) = candidate.filter(|value| valid_package_name(value)) {
            return Some(candidate.to_string());
        }
    }
    None
}
