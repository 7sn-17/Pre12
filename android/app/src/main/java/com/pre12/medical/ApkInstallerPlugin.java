package com.pre12.medical;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * ⭐⭐⭐ مثبّت الحزم داخل التطبيق (APK Installer).
 *
 * ⭐ Why a custom plugin?
 *   The npm package "@capgo/capacitor-android-inline-install" only
 *   supports the **Google Play in-app install** flow (it needs the app
 *   to be published on Play). Our APK is distributed from GitHub
 *   Releases, so we need the real Android package installer:
 *
 *       Intent(ACTION_VIEW) + application/vnd.android.package-archive
 *
 *   The file is shared through the app's FileProvider (already declared
 *   in the manifest with a <cache-path>), so no storage permission is
 *   needed.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String fileName = call.getString("fileName");

        if (fileName == null || fileName.trim().isEmpty()) {
            // ⭐ نقبل أيضاً المسار الكامل
            fileName = call.getString("filePath");
        }
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required");
            return;
        }

        try {
            File target;

            if (fileName.contains("/")) {
                target = new File(fileName);
            } else {
                // ⭐ الملف داخل مجلد الكاش الخاص بالتطبيق
                target = new File(getContext().getCacheDir(), fileName);
            }

            if (!target.exists()) {
                call.reject("the downloaded file was not found: " + target.getAbsolutePath());
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("path", target.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("the installation could not be started: " + e.getMessage());
        }
    }
}
