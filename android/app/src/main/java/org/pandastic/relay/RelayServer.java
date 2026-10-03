package org.pandastic.relay;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Foreground-only demo server. One inference at a time; bounded queue and upload size. */
public final class RelayServer implements AutoCloseable {
    private final ServerSocket listener;
    private final Thread acceptThread;
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1));
    private final Set<Socket> connections = Collections.newSetFromMap(new ConcurrentHashMap<Socket, Boolean>());
    private final File cache;
    private final String token;
    private final SpeechPipeline pipeline;
    private final OfflineSpeaker speaker;
    private volatile boolean closed;
    public RelayServer(File cache, String token, SpeechPipeline pipeline, OfflineSpeaker speaker) throws IOException {
        this.cache = cache; this.token = token; this.pipeline = pipeline; this.speaker = speaker;
        listener = new ServerSocket(8080);
        acceptThread = new Thread(() -> {
            while (!closed) {
                try {
                    Socket socket = listener.accept();
                    socket.setSoTimeout(15000);
                    connections.add(socket);
                    try { worker.execute(() -> handle(socket)); }
                    catch (RejectedExecutionException busy) { connections.remove(socket); socket.close(); }
                } catch (IOException e) { if (!closed) close(); }
            }
        }, "relay-accept");
        acceptThread.start();
    }
    private String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < 4096; i++) {
            int b = input.read();
            if (b == -1) throw new EOFException();
            if (b == '\n') return bytes.toString("US-ASCII").replace("\r", "");
            bytes.write(b);
        }
        throw new IOException("Header too long.");
    }
    private void handle(Socket socket) {
        File upload = null, reply = null;
        try (Socket connection = socket) {
            try {
                InputStream input = new BufferedInputStream(connection.getInputStream());
                String request = line(input);
                Map<String, String> headers = new HashMap<>();
                for (int i = 0; ; i++) {
                    if (i >= 32) throw new IOException("Too many headers.");
                    String header = line(input); if (header.isEmpty()) break;
                    int colon = header.indexOf(':');
                    if (colon <= 0) throw new IOException("Invalid header.");
                    headers.put(header.substring(0, colon).toLowerCase(Locale.ROOT), header.substring(colon + 1).trim());
                }
                if (!token.equals(headers.get("x-relay-token"))) { respond(connection, 401, "Pairing code incorrect."); return; }
                if (!request.equals("POST /speech HTTP/1.1") && !request.equals("POST /speech HTTP/1.0")) {
                    respond(connection, 404, "Use POST /speech."); return;
                }
                int length;
                try { length = Integer.parseInt(headers.getOrDefault("content-length", "0")); }
                catch (NumberFormatException e) { respond(connection, 400, "Invalid length."); return; }
                if (length <= 0 || length > 2 * 1024 * 1024 || headers.containsKey("transfer-encoding")) {
                    respond(connection, 413, "Send a fixed-length recording under 2 MB."); return;
                }
                upload = File.createTempFile("incoming", ".m4a", cache);
                try (OutputStream file = new FileOutputStream(upload)) {
                    byte[] buffer = new byte[8192]; int remaining = length;
                    while (remaining > 0) {
                        int count = input.read(buffer, 0, Math.min(buffer.length, remaining));
                        if (count < 0) throw new EOFException();
                        file.write(buffer, 0, count); remaining -= count;
                    }
                }
                reply = File.createTempFile("reply", ".wav", cache);
                speaker.synthesize(pipeline.respond(upload), reply);
                OutputStream output = connection.getOutputStream();
                header(output, 200, "audio/wav", reply.length());
                try (InputStream audio = new FileInputStream(reply)) { RelayClient.copy(audio, output, 8 * 1024 * 1024); }
                output.flush();
            } catch (Exception e) {
                try { respond(connection, 503, e.getMessage() == null ? "Request failed." : e.getMessage()); }
                catch (IOException ignored) {}
            }
        } catch (IOException ignored) {}
        finally {
            connections.remove(socket);
            if (upload != null) upload.delete(); if (reply != null) reply.delete();
        }
    }
    private static void header(OutputStream output, int status, String type, long length) throws IOException {
        output.write(("HTTP/1.1 " + status + " " + (status == 200 ? "OK" : "Error") + "\r\nContent-Type: " + type
            + "\r\nContent-Length: " + length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
    }
    private static void respond(Socket socket, int status, String message) throws IOException {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        OutputStream output = socket.getOutputStream(); header(output, status, "text/plain; charset=utf-8", body.length);
        output.write(body); output.flush();
    }
    @Override public void close() {
        closed = true;
        try { listener.close(); } catch (IOException ignored) {}
        for (Socket socket : connections) try { socket.close(); } catch (IOException ignored) {}
        worker.shutdownNow();
    }
}
