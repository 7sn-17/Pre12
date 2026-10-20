package com.pre12.medical;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

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
        // ⭐ مثبّت الحزم (تحديث التطبيق داخل التطبيق)
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // علامة مطلوبة من @capgo/capacitor-social-login — لا تغيير مطلوب.
    }
}
