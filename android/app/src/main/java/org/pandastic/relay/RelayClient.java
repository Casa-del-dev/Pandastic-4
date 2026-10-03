package org.pandastic.relay;

import java.io.*;
import java.net.*;

public final class RelayClient {
    public static void exchange(String address, String token, File input, File output) throws Exception {
        URL url = new URL(address + "/speech");
        if (!url.getProtocol().equals("http")) throw new IOException("Use http:// followed by the server phone IP and port.");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(60000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("X-Relay-Token", token);
        connection.setRequestProperty("Content-Type", "audio/mp4");
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(input.length());
        try {
            try (InputStream source = new FileInputStream(input); OutputStream target = connection.getOutputStream()) {
                copy(source, target, 2 * 1024 * 1024);
            }
            int status = connection.getResponseCode();
            if (status != 200) {
                String message = "";
                InputStream error = connection.getErrorStream();
                if (error != null) try (InputStream stream = error; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                    copy(stream, buffer, 8192); message = buffer.toString("UTF-8");
                }
                throw new IOException("Server " + status + ": " + message);
            }
            try (InputStream source = connection.getInputStream(); OutputStream target = new FileOutputStream(output)) {
                copy(source, target, 8 * 1024 * 1024);
            }
        } finally { connection.disconnect(); }
    }
    static void copy(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] buffer = new byte[8192]; long total = 0; int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw new IOException("Audio exceeds size limit.");
            output.write(buffer, 0, count);
        }
    }
}
