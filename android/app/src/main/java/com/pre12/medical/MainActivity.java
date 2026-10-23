package com.pre12.medical;

import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.pre12.medical.downloads.MedDownloadsPlugin;
import com.pre12.medical.widgets.MedWidgetsPlugin;

import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

/**
 * ⭐ MainActivity المعدّل لـ @capgo/capacitor-social-login.
 *
 * الواجهة `ModifiedMainActivityForSocialLoginPlugin` هي العلامة التي
 * يبحث عنها المُزوّد لتفعيل النطاقات المخصّصة (scopes) على Google.
 * بدونها يرفض الطلب بالرسالة:
 *   "You CANNOT use scopes without modifying the main activity."
 *
 * ملاحظة: نستعمل النطاقات الافتراضية (email · profile · openid)
 * فقط، لكن تفعيل العلامة يزيل هذا الحاجز نهائياً.
 */
public class MainActivity extends BridgeActivity
        implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⭐⭐ Phase W2 — local plugin (home-screen widgets).
        //    Must be registered before super.onCreate(): BridgeActivity hands the
        //    builder to Capacitor during creation.
        registerPlugin(MedWidgetsPlugin.class);
        // ⭐ v5.1.2 — local foreground-service bridge for silent downloads.
        registerPlugin(MedDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // علامة مطلوبة من @capgo/capacitor-social-login — لا تغيير مطلوب.
    }

    /**
     * ⭐⭐⭐ Phase W15 — «قاتل الكاش» على مستوى الـWebView نفسه.
     *
     * <p>عند ترقية الإصدار يمسح التطبيق:
     * <ul>
     *   <li>كل Service Workers،</li>
     *   <li>كل Cache Storage،</li>
     *   <li>كاش الـHTTP داخل الـWebView (وهو ما يخدم الصفحة القديمة!).</li>
     * </ul>
     *
     * <p>الأخير لا يمكن من JavaScript، فنمسحه هنا: نقارن إصدار التطبيق
     * المثبَّت بالإصدار المحفوظ، وعند الاختلاف نمسح الكاش **مرة واحدة**
     * لكل إصدار (الختم يُحفظ قبل المسح ⇒ لا حلقة إعادة تحميل).
     */
    @Override
    public void onStart() {
        super.onStart();
        wipeWebViewCacheOnVersionChange();
    }

    private void wipeWebViewCacheOnVersionChange() {
        try {
            String version = getPackageManager()
                    .getPackageInfo(getPackageName(), 0).versionName;
            if (version == null || version.isEmpty()) return;

            SharedPreferences prefs =
                    getSharedPreferences("medapp_cache_killer", MODE_PRIVATE);
            String stored = prefs.getString("version", null);
            if (version.equals(stored)) return;

            // نكتب الإصدار الجديد **قبل** المسح ⇒ لا حلقة ولا مسح متكرّر.
            prefs.edit().putString("version", version).apply();

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().clearCache(true);
                getBridge().getWebView().clearHistory();
            }
        } catch (Exception ignored) {
            // لا شيء يجب أن يُسقط التطبيق بسبب الكاش.
        }
    }
}
