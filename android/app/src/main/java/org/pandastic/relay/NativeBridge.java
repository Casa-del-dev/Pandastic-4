package org.pandastic.relay;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.pandastic.relay.hub.HubLog;
import org.pandastic.relay.hub.HubPrefs;
import org.pandastic.relay.hub.HubService;

/**
 * The React UI's only way into native code, exposed as window.PandasticNative. Slow work runs on
 * BrainHost's thread and answers through window.__pandasticReply(id, json); hub changes are
 * announced with a "pandastic:hub" event.
 */
final class NativeBridge {
    private static final String TAG = "PandasticBridge";
    private final FrontendActivity activity;
    private final WebView webView;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

    NativeBridge(FrontendActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    // ---- Photo and questions -------------------------------------------------------------

    /** base64Jpeg: a downscaled photo from the UI (no data: prefix). */
    @JavascriptInterface public void checkPhoto(String id, String base64Jpeg, String text, String lang) {
        BrainHost.get(activity).submit(() -> {
            try {
                byte[] bytes = Base64.decode(base64Jpeg, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) { reply(id, error("unreadable_photo")); return null; }
                reply(id, BrainHost.get(activity).photo(bitmap, text, lang));
                bitmap.recycle();
            } catch (Exception e) {
                Log.e(TAG, "Photo check failed", e);
                reply(id, error("photo_failed"));
            }
            return null;
        });
    }

    @JavascriptInterface public void ask(String id, String text, String lang) {
        BrainHost.get(activity).submit(() -> {
            try { reply(id, BrainHost.get(activity).text(text, lang)); }
            catch (Exception e) { Log.e(TAG, "Question failed", e); reply(id, error("question_failed")); }
            return null;
        });
    }

    @JavascriptInterface public String info() {
        try { return BrainHost.get(activity).info().toString(); }
        catch (JSONException e) { return "{}"; }
    }

    // ---- SMS helper ----------------------------------------------------------------------

    @JavascriptInterface public String hubStatus() {
        try { return hubJson().toString(); }
        catch (JSONException e) { return "{}"; }
    }

    @JavascriptInterface public void setHubEnabled(boolean enabled) {
        activity.runOnUiThread(() -> {
            HubPrefs prefs = new HubPrefs(activity);
            if (!enabled) {
                prefs.setEnabled(false);
                HubService.stop(activity);
                announceHub();
                return;
            }
            activity.requestHubPermissions(() -> {
                if (activity.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
                    && activity.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
                    prefs.setEnabled(true);
                    HubService.start(activity);
                    askToIgnoreBatteryOptimisation();
                }
                announceHub();
            });
        });
    }

    /** contactsJson: [{"name": "Mama", "number": "+256…"}] */
    @JavascriptInterface public void setHubContacts(String contactsJson) {
        try { new HubPrefs(activity).setContacts(new JSONArray(contactsJson)); }
        catch (JSONException e) { Log.w(TAG, "Ignored malformed contact list"); }
        announceHub();
    }

    @JavascriptInterface public void setHubLang(String lang) {
        new HubPrefs(activity).setLang(lang);
        announceHub();
    }

    @JavascriptInterface public void clearHubHistory() {
        HubLog.get(activity).clear();
        announceHub();
    }

    // ---- Human in the loop and voice -----------------------------------------------------

    /** Opens the SMS app with a draft; the person decides whether to send it. */
    @JavascriptInterface public void draftSms(String number, String body) {
        Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + (number == null ? "" : number)));
        intent.putExtra("sms_body", body);
        activity.runOnUiThread(() -> {
            try { activity.startActivity(intent); }
            catch (android.content.ActivityNotFoundException e) { Log.w(TAG, "No SMS app installed"); }
        });
    }

    /** Opens Android's share sheet; the person picks the app and the recipient. */
    @JavascriptInterface public void share(String text) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, null)));
    }

    /** Reads text aloud with an installed offline voice. Returns false if none fits the language. */
    @JavascriptInterface public boolean speak(String text, String lang) {
        if (!ttsReady) { initTts(); return false; }
        Locale locale = "en".equals(lang) ? Locale.ENGLISH : new Locale("sw");
        int available = tts.isLanguageAvailable(locale);
        if (available < TextToSpeech.LANG_AVAILABLE) return false;
        tts.setLanguage(locale);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pandastic");
        return true;
    }

    @JavascriptInterface public String voices() {
        try {
            if (!ttsReady) { initTts(); return new JSONObject().put("ready", false).toString(); }
            return new JSONObject().put("ready", true)
                .put("sw", tts.isLanguageAvailable(new Locale("sw")) >= TextToSpeech.LANG_AVAILABLE)
                .put("en", tts.isLanguageAvailable(Locale.ENGLISH) >= TextToSpeech.LANG_AVAILABLE).toString();
        } catch (JSONException e) { return "{}"; }
    }

    @JavascriptInterface public void stopSpeaking() { if (ttsReady) tts.stop(); }

    // ---- Internals -------------------------------------------------------------------------

    void initTts() {
        activity.runOnUiThread(() -> {
            if (tts == null) tts = new TextToSpeech(activity, status -> ttsReady = status == TextToSpeech.SUCCESS);
        });
    }

    void close() { if (tts != null) tts.shutdown(); }

    void announceHub() {
        String status = hubStatus();
        webView.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('pandastic:hub', {detail: " + status + "}))", null));
    }

    private JSONObject hubJson() throws JSONException {
        HubPrefs prefs = new HubPrefs(activity);
        JSONArray recent = new JSONArray();
        for (HubLog.Entry entry : HubLog.get(activity).recent(20)) {
            recent.put(new JSONObject().put("id", entry.id).put("contact", entry.contact)
                .put("question", entry.body).put("reply", entry.reply == null ? JSONObject.NULL : entry.reply)
                .put("status", entry.status).put("receivedAt", entry.receivedAt));
        }
        boolean notifications = Build.VERSION.SDK_INT < 33
            || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        return new JSONObject()
            .put("enabled", prefs.enabled())
            .put("running", HubService.isRunning())
            .put("lang", prefs.lang())
            .put("contacts", prefs.contacts())
            .put("smsPermission", activity.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
                && activity.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED)
            .put("notificationPermission", notifications)
            .put("answeredToday", HubLog.get(activity).answeredSince(null, HubService.startOfToday()))
            .put("recent", recent);
    }

    private void askToIgnoreBatteryOptimisation() {
        PowerManager power = activity.getSystemService(PowerManager.class);
        if (power.isIgnoringBatteryOptimizations(activity.getPackageName())) return;
        try {
            activity.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + activity.getPackageName())));
        } catch (android.content.ActivityNotFoundException e) { Log.w(TAG, "Battery settings unavailable"); }
    }

    private void reply(String id, String json) {
        String script = "window.__pandasticReply && window.__pandasticReply(" + JSONObject.quote(id) + ", " + json + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static String error(String code) { return "{\"status\":\"ERROR\",\"error\":\"" + code + "\",\"escalate\":true}"; }
}
