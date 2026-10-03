package org.pandastic.relay;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.io.File;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Requires a previously installed, non-network English TTS voice. */
public final class OfflineSpeaker implements AutoCloseable {
    private final TextToSpeech tts;
    private final CountDownLatch initialized = new CountDownLatch(1);
    private volatile int initStatus = TextToSpeech.ERROR;
    public OfflineSpeaker(Context context) {
        tts = new TextToSpeech(context, status -> { initStatus = status; initialized.countDown(); });
    }
    public synchronized void synthesize(String text, File output) throws Exception {
        if (!initialized.await(15, TimeUnit.SECONDS) || initStatus != TextToSpeech.SUCCESS)
            throw new Exception("Text-to-speech engine is unavailable.");
        if (tts.getVoices() == null) throw new Exception("Install an offline English TTS voice first.");
        android.speech.tts.Voice voice = null;
        for (android.speech.tts.Voice candidate : tts.getVoices()) {
            if (candidate.getLocale().getLanguage().equals(Locale.ENGLISH.getLanguage())
                && !candidate.isNetworkConnectionRequired()
                && (candidate.getFeatures() == null || !candidate.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) {
                voice = candidate; break;
            }
        }
        if (voice == null) throw new Exception("Install an offline English TTS voice first.");
        if (tts.setVoice(voice) != TextToSpeech.SUCCESS) throw new Exception("Cannot select offline voice.");
        CountDownLatch done = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicBoolean failed = new java.util.concurrent.atomic.AtomicBoolean(false);
        String id = java.util.UUID.randomUUID().toString();
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) { if (id.equals(utteranceId)) done.countDown(); }
            @Override public void onError(String utteranceId) {
                if (id.equals(utteranceId)) { failed.set(true); done.countDown(); }
            }
        });
        if (tts.synthesizeToFile(text, null, output, id) != TextToSpeech.SUCCESS)
            throw new Exception("Could not start speech synthesis.");
        if (!done.await(30, TimeUnit.SECONDS)) { tts.stop(); throw new Exception("Speech synthesis timed out."); }
        if (failed.get() || output.length() == 0) throw new Exception("Speech synthesis failed.");
    }
    @Override public void close() { tts.stop(); tts.shutdown(); }
}
