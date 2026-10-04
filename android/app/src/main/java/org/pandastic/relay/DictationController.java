package org.pandastic.relay;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import org.json.JSONObject;

/** Android speech service input. Session ids prevent late results from editing another draft. */
final class DictationController {
    interface Events { void send(JSONObject event); }
    private final FrontendActivity activity;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private String activeId = "";
    private volatile boolean listening;
    private boolean closed;

    DictationController(FrontendActivity activity, Events events) { this.activity = activity; this.events = events; }

    JSONObject status() {
        JSONObject value = new JSONObject();
        try {
            value.put("available", SpeechRecognizer.isRecognitionAvailable(activity));
            value.put("permission", activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
            value.put("listening", listening);
        } catch (Exception ignored) { }
        return value;
    }

    void start(String id, String lang) {
        activity.runOnUiThread(() -> {
            if (closed || id == null || id.isEmpty()) return;
            cancel();
            activeId = id;
            listening = true;
            emit(id, "requesting", null, null);
            activity.requestMicrophonePermission(() -> {
                if (!id.equals(activeId) || closed) return;
                if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    finish(id, "permission"); return;
                }
                if (!SpeechRecognizer.isRecognitionAvailable(activity)) { finish(id, "unsupported"); return; }
                try {
                    recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
                    recognizer.setRecognitionListener(new RecognitionListener() {
                        @Override public void onReadyForSpeech(Bundle params) { if (id.equals(activeId)) emit(id, "start", null, null); }
                        @Override public void onBeginningOfSpeech() { }
                        @Override public void onRmsChanged(float rmsdB) { }
                        @Override public void onBufferReceived(byte[] buffer) { }
                        @Override public void onEndOfSpeech() { }
                        @Override public void onError(int code) {
                            if (!id.equals(activeId)) return;
                            finish(id, code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "permission"
                                : code == SpeechRecognizer.ERROR_NETWORK || code == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "network"
                                : code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "no-speech"
                                : code == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || code == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ? "language"
                                : "failed");
                        }
                        @Override public void onResults(Bundle results) {
                            if (!id.equals(activeId)) return;
                            String text = transcript(results);
                            if (!text.isEmpty()) emit(id, "result", text, null);
                            else emit(id, "error", null, "no-speech");
                            emit(id, "end", null, null);
                            release();
                        }
                        @Override public void onPartialResults(Bundle results) {
                            if (id.equals(activeId)) emit(id, "partial", transcript(results), null);
                        }
                        @Override public void onEvent(int type, Bundle params) { }
                    });
                    // EXTRA_PREFER_OFFLINE forces offline-only recognition in Google's provider.
                    // Leave it unset so the service can fall back when a language pack is missing.
                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "sw".equals(lang) ? "sw-KE" : "en-US")
                        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                    recognizer.startListening(intent);
                    main.postDelayed(() -> { if (id.equals(activeId)) finish(id, "no-speech"); }, 45000);
                } catch (Exception error) { finish(id, "failed"); }
            });
        });
    }

    void stop() {
        activity.runOnUiThread(() -> {
            if (recognizer == null) { cancel(); return; }
            String id = activeId;
            try { recognizer.stopListening(); }
            catch (Exception error) { finish(id, "failed"); return; }
            main.postDelayed(() -> { if (id.equals(activeId)) finish(id, "no-speech"); }, 5000);
        });
    }

    void cancel() {
        String id = activeId;
        release();
        if (!id.isEmpty()) emit(id, "end", null, null);
    }

    void close() { closed = true; cancel(); main.removeCallbacksAndMessages(null); }

    private void finish(String id, String error) {
        emit(id, "error", null, error);
        emit(id, "end", null, null);
        release();
    }

    private void release() {
        activeId = ""; listening = false;
        if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; }
        main.removeCallbacksAndMessages(null);
    }

    private static String transcript(Bundle results) {
        if (results == null) return "";
        ArrayList<String> words = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return words == null || words.isEmpty() ? "" : words.get(0);
    }

    private void emit(String id, String state, String text, String error) {
        if (closed) return;
        try {
            JSONObject event = new JSONObject().put("id", id).put("state", state);
            if (text != null) event.put("text", text);
            if (error != null) event.put("error", error);
            events.send(event);
        } catch (Exception ignored) { }
    }
}
