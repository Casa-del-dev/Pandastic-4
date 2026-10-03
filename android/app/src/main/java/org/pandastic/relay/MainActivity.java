package org.pandastic.relay;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import java.io.File;
import java.net.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Same APK on both phones. Keep the server screen open during requests. */
public final class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable recordingLimit = () -> finishRecording(true);
    private EditText address, pairing;
    private TextView status;
    private Button serverButton, recordButton, retryButton;
    private RelayServer server;
    private OfflineSpeaker speaker;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private File recording;
    private boolean sending, foreground;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(24, 24, 24, 24);
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(24 + insets.getSystemWindowInsetLeft(), 24 + insets.getSystemWindowInsetTop(),
                24 + insets.getSystemWindowInsetRight(), 24 + insets.getSystemWindowInsetBottom());
            return insets;
        });
        ScrollView scroll = new ScrollView(this); scroll.addView(layout); setContentView(scroll);
        TextView title = new TextView(this); title.setText("Pandastic Relay"); title.setTextSize(26); layout.addView(title);
        TextView help = new TextView(this);
        help.setText("Connect both phones to the same Wi-Fi or phone hotspot. No internet needed.\n\nStrong phone: start the demo server and keep this screen open.\nSmall phone: enter the strong phone address and pairing code, then record and send.\n\nDEMO: fixed spoken response; no ASR or LLM installed.");
        layout.addView(help);
        address = new EditText(this); address.setSingleLine(true); address.setHint("http://192.168.x.x:8080");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(getPreferences(0).getString("address", "")); layout.addView(address);
        pairing = new EditText(this); pairing.setSingleLine(true); pairing.setHint("Pairing code (same on both phones)");
        String generated = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        pairing.setText(getPreferences(0).getString("token", generated)); layout.addView(pairing);
        serverButton = button(layout, "Start server (strong phone)", v -> toggleServer());
        recordButton = button(layout, "Record (small phone)", v -> {
            if (recorder != null) finishRecording(true);
            else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1);
            else startRecording();
        });
        retryButton = button(layout, "Send saved recording", v -> send());
        retryButton.setEnabled(false);
        status = new TextView(this); status.setText("Ready. Install an offline English TTS voice on the strong phone before disconnecting internet.");
        layout.addView(status);
    }
    private Button button(LinearLayout layout, String label, View.OnClickListener click) {
        Button button = new Button(this); button.setText(label); button.setOnClickListener(click); layout.addView(button); return button;
    }
    private void persist() {
        getPreferences(0).edit().putString("address", address.getText().toString().trim())
            .putString("token", pairing.getText().toString().trim()).apply();
    }
    private void toggleServer() {
        if (server != null) { stopServer(); status.setText("Server stopped."); return; }
        String token = pairing.getText().toString().trim();
        if (!token.matches("[A-Za-z0-9-]{8,64}")) { status.setText("Use an 8–64 character pairing code: letters, numbers or hyphens."); return; }
        persist();
        try {
            speaker = new OfflineSpeaker(getApplicationContext());
            server = new RelayServer(getCacheDir(), token, new SpeechPipeline.Demo(), speaker);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            serverButton.setText("Stop server"); recordButton.setEnabled(false); retryButton.setEnabled(false);
            address.setEnabled(false); pairing.setEnabled(false);
            status.setText("Demo server listening on port 8080.\n" + localAddresses()
                + "\nPairing code: " + token + "\nKeep this screen open. If no address is shown, check hotspot settings for the server IP.");
        } catch (Exception e) { stopServer(); status.setText("Cannot start server: " + e.getMessage()); }
    }
    private String localAddresses() throws SocketException {
        StringBuilder result = new StringBuilder();
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        if (interfaces == null) return "";
        for (NetworkInterface net : Collections.list(interfaces)) {
            for (InetAddress ip : Collections.list(net.getInetAddresses()))
                if (!ip.isLoopbackAddress() && ip instanceof Inet4Address)
                    result.append("http://").append(ip.getHostAddress()).append(":8080\n");
        }
        return result.toString();
    }
    private void stopServer() {
        if (server != null) { server.close(); server = null; }
        if (speaker != null) { speaker.close(); speaker = null; }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        serverButton.setText("Start server (strong phone)"); address.setEnabled(true); pairing.setEnabled(true);
        recordButton.setEnabled(!sending); retryButton.setEnabled(!sending && recording != null);
    }
    @SuppressWarnings("deprecation")
    private void startRecording() {
        releasePlayer();
        if (recording != null) { recording.delete(); recording = null; }
        try {
            recording = File.createTempFile("question", ".m4a", getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1); recorder.setAudioSamplingRate(16000); recorder.setAudioEncodingBitRate(32000);
            recorder.setOutputFile(recording.getAbsolutePath()); recorder.prepare(); recorder.start();
            recordButton.setText("Stop and send"); serverButton.setEnabled(false); retryButton.setEnabled(false);
            status.setText("Recording… maximum 30 seconds."); handler.postDelayed(recordingLimit, 30000);
        } catch (Exception e) { finishRecording(false); status.setText("Recording failed: " + e.getMessage()); }
    }
    private void finishRecording(boolean submit) {
        handler.removeCallbacks(recordingLimit);
        if (recorder != null) {
            try { recorder.stop(); } catch (RuntimeException e) { submit = false; status.setText("Recording was too short. Try again."); }
            recorder.release(); recorder = null;
        }
        recordButton.setText("Record (small phone)"); serverButton.setEnabled(true);
        if (!submit && recording != null) { recording.delete(); recording = null; }
        retryButton.setEnabled(recording != null);
        if (submit) send();
    }
    private void send() {
        if (recording == null || sending || server != null) return;
        final String endpoint = address.getText().toString().trim().replaceAll("/+$", "");
        final String token = pairing.getText().toString().trim();
        if (endpoint.isEmpty() || !token.matches("[A-Za-z0-9-]{8,64}")) {
            status.setText("Enter the server address and pairing code first. Recording is saved for retry."); return;
        }
        persist(); sending = true; recordButton.setEnabled(false); retryButton.setEnabled(false); serverButton.setEnabled(false);
        status.setText("Sending speech and waiting for demo reply…");
        final File request = recording;
        network.execute(() -> {
            File reply = null; String error = null;
            try {
                reply = File.createTempFile("received", ".wav", getCacheDir());
                RelayClient.exchange(endpoint, token, request, reply);
            } catch (Exception e) { error = e.getMessage(); }
            final File result = reply; final String failure = error;
            handler.post(() -> {
                sending = false;
                if (isDestroyed()) { request.delete(); if (result != null) result.delete(); return; }
                recordButton.setEnabled(true); serverButton.setEnabled(true); retryButton.setEnabled(recording != null);
                if (failure != null) {
                    if (result != null) result.delete();
                    status.setText("Connection failed: " + failure + "\nRecording saved. Reconnect and tap Send saved recording.");
                } else if (foreground) {
                    status.setText("Reply received. Playing demo response."); play(result);
                } else { result.delete(); status.setText("Reply received while app was in background. Send again to listen."); }
            });
        });
    }
    private void play(File audio) {
        releasePlayer();
        try {
            player = new MediaPlayer(); player.setDataSource(audio.getAbsolutePath());
            player.setOnCompletionListener(p -> { releasePlayer(); audio.delete(); });
            player.setOnErrorListener((p, what, extra) -> { releasePlayer(); audio.delete(); status.setText("Playback failed."); return true; });
            player.prepare(); player.start(); audio.delete();
        } catch (Exception e) { releasePlayer(); audio.delete(); status.setText("Playback failed: " + e.getMessage()); }
    }
    private void releasePlayer() { if (player != null) { player.release(); player = null; } }
    @Override protected void onStart() { super.onStart(); foreground = true; }
    @Override protected void onStop() {
        foreground = false;
        if (recorder != null) finishRecording(false);
        if (server != null) { stopServer(); status.setText("Server stopped because the app left the foreground."); }
        releasePlayer(); super.onStop();
    }
    @Override protected void onDestroy() {
        handler.removeCallbacks(recordingLimit); network.shutdownNow();
        if (!sending && recording != null) recording.delete();
        super.onDestroy();
    }
}
