package com.corona.appmeta;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Looper;

import java.lang.reflect.Method;

@SuppressWarnings("deprecation")
public final class AppMeta {
    private AppMeta() {}

    private static Context getSystemContext() throws Exception {
        if (Looper.myLooper() == null) Looper.prepareMainLooper();
        Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
        Method systemMain = activityThreadClass.getDeclaredMethod("systemMain");
        Object activityThread = systemMain.invoke(null);
        Method getSystemContext = activityThreadClass.getDeclaredMethod("getSystemContext");
        return (Context) getSystemContext.invoke(activityThread);
    }

    private static String cleanLabel(CharSequence label) {
        if (label == null) return "";
        return label.toString().replace('\n', ' ').replace('\r', ' ').replace('|', ' ').trim();
    }

    private static String loadLabel(PackageManager packageManager, String packageName, String componentName) {
        try {
            if (componentName != null && !componentName.isEmpty()) {
                ComponentName component = ComponentName.unflattenFromString(componentName);
                if (component != null) {
                    ActivityInfo activityInfo = packageManager.getActivityInfo(component, PackageManager.MATCH_DISABLED_COMPONENTS);
                    String label = cleanLabel(activityInfo.loadLabel(packageManager));
                    if (!label.isEmpty()) return label;
                }
            }
        } catch (Exception ignored) {
        }
        try {
            ApplicationInfo applicationInfo = packageManager.getApplicationInfo(packageName, PackageManager.MATCH_DISABLED_COMPONENTS);
            return cleanLabel(applicationInfo.loadLabel(packageManager));
        } catch (Exception ignored) {
            return "";
        }
    }

    private static void outputBatch(PackageManager packageManager, String payload) {
        for (String line : payload.split("\\n")) {
            if (line == null || line.trim().isEmpty()) continue;
            String[] fields = line.split("\\|", 2);
            String packageName = fields[0].trim();
            String componentName = fields.length > 1 ? fields[1].trim() : "";
            if (packageName.isEmpty()) continue;
            String label = loadLabel(packageManager, packageName, componentName);
            System.out.println(packageName + "|" + componentName + "|" + label);
        }
    }

    public static void main(String[] args) {
        if (args.length < 1) return;
        try {
            PackageManager packageManager = getSystemContext().getPackageManager();
            if ("label".equals(args[0]) && args.length >= 2) {
                String componentName = args.length > 2 ? args[2] : "";
                System.out.print(loadLabel(packageManager, args[1], componentName));
            } else if ("label-batch".equals(args[0]) && args.length >= 2) {
                outputBatch(packageManager, args[1]);
            }
        } catch (Exception ignored) {
            System.exit(1);
        }
        System.exit(0);
    }
}
