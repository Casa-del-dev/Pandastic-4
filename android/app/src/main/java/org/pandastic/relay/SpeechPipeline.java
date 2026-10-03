package org.pandastic.relay;

import java.io.File;

/** Runs only on the stronger phone. Replace the demo with offline ASR + retrieval + LLM. */
public interface SpeechPipeline {
    String respond(File recordedSpeech) throws Exception;

    final class Demo implements SpeechPipeline {
        @Override public String respond(File recordedSpeech) {
            return "Your voice message reached the server phone. This is a connection demo. "
                + "Speech recognition and the language model are not installed yet.";
        }
    }
}
