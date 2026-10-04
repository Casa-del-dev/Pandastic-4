package org.pandastic.relay.brain;

import android.content.Context;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * Qwen3.5-0.8B (llama.cpp) reads messy SMS text into slots (contracts §5). It only fills what the
 * keyword NLU could not find, its output is forced into JSON by a GBNF grammar and then checked
 * against fixed lists here, and it never writes advice or prices. Any failure falls back to keywords.
 */
public final class LlmNlu implements Nlu, AutoCloseable {
    private static final String TAG = "PandasticLlm";
    public static final String MODEL_NAME = "Qwen3.5-0.8B-Q4_K_M.gguf";
    /** Prompt + answer; set explicitly so llama.cpp does not size the cache for the model's 262k context. */
    private static final int CONTEXT = 1536, MAX_TOKENS = 64;
    /** The SMS hub waits up to 60 s per question; the model gets a third of that, then keywords answer. */
    private static final int TIME_BUDGET_MS = 20_000;
    private static final Set<String> INTENTS = new HashSet<>(Arrays.asList("diagnose", "price", "planting", "help", "other"));
    private static final Set<String> CROPS = new HashSet<>(Arrays.asList("coffee", "maize", "bean"));

    private static final String DEFAULT_SYSTEM = "You read one short SMS from a smallholder farmer in Uganda. "
        + "It may be Swahili, English or Luganda, and may be misspelled. Reply with JSON only. "
        + "intent: diagnose (a problem with a crop), price (selling price or a buyer's offer), planting (when to plant), "
        + "help (how to use this service), or other. crop: coffee, maize, bean, or null. "
        + "symptom: the condition only if the words clearly name it, otherwise null. Never guess.";
    private static final String DEFAULT_GRAMMAR = String.join("\n",
        "root ::= \"{\" ws \"\\\"intent\\\":\" ws intent \",\" ws \"\\\"crop\\\":\" ws crop \",\" ws \"\\\"symptom\\\":\" ws symptom ws \"}\"",
        "intent ::= \"\\\"diagnose\\\"\" | \"\\\"price\\\"\" | \"\\\"planting\\\"\" | \"\\\"help\\\"\" | \"\\\"other\\\"\"",
        "crop ::= \"\\\"coffee\\\"\" | \"\\\"maize\\\"\" | \"\\\"bean\\\"\" | \"null\"",
        "symptom ::= \"\\\"rust\\\"\" | \"\\\"miner\\\"\" | \"\\\"cercospora\\\"\" | \"\\\"phoma\\\"\" | \"\\\"fall_armyworm\\\"\" | \"\\\"leaf_blight\\\"\" | \"\\\"streak_virus\\\"\" | \"\\\"lethal_necrosis\\\"\" | \"\\\"leaf_spot\\\"\" | \"\\\"angular_leaf_spot\\\"\" | \"null\"",
        "ws ::= [ ]?");

    private static boolean libraryLoaded;
    static {
        try { System.loadLibrary("pandastic_llm"); libraryLoaded = true; }
        catch (UnsatisfiedLinkError e) { Log.w(TAG, "LLM library not in this build"); }
    }

    private static native long nativeLoad(String path, int nCtx, int nThreads);
    private static native String nativeComplete(long handle, String prompt, String grammar, int maxTokens, int timeoutMs);
    private static native boolean nativeSetPrefix(long handle, String prefix);
    private static native void nativeFree(long handle);

    private long handle;
    private boolean prefixCached;
    private final Nlu keywords;
    private final String system, grammar;
    public final String modelPath;

    /**
     * The model is side-loaded (never bundled): files/models/ or the app's external files/models/,
     * which `adb push` and USB can reach. Returns null when it is missing, so keywords are used alone.
     */
    public static LlmNlu open(Context context, Nlu keywords) {
        if (!libraryLoaded) return null;
        File model = find(context);
        if (model == null) { Log.i(TAG, "No " + MODEL_NAME + " side-loaded; keyword NLU only"); return null; }
        int threads = Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() - 2));
        long handle = nativeLoad(model.getAbsolutePath(), CONTEXT, threads);
        if (handle == 0) return null;
        // Grammar and prompt come from ml/llm (T31), copied into assets at build time.
        LlmNlu llm = new LlmNlu(handle, keywords, asset(context, "llm/system_prompt.txt", DEFAULT_SYSTEM),
            asset(context, "llm/slots.gbnf", DEFAULT_GRAMMAR), model.getAbsolutePath());
        long started = System.currentTimeMillis();
        boolean cached = llm.prefixCached = nativeSetPrefix(handle, llm.prefix());
        Log.i(TAG, "System prompt " + (cached ? "cached" : "NOT cached") + " in " + (System.currentTimeMillis() - started) + " ms");
        return llm;
    }

    private LlmNlu(long handle, Nlu keywords, String system, String grammar, String modelPath) {
        this.handle = handle;
        this.keywords = keywords;
        this.system = system.trim();
        this.grammar = grammar;
        this.modelPath = modelPath;
    }

    /**
     * Hybrid policy measured by B (ml/reports/nlu_eval.md, held-out SMS: keywords 68%, Qwen alone 34%,
     * hybrid 78%): keywords first; the model only fills the intent and the crop the keywords missed.
     * It is never trusted for the symptom, the offer, the language or the commodity.
     */
    @Override public Slots parse(String text, String lang) {
        Slots slots = keywords.parse(text, lang);
        if (slots.intentProb > 0 && slots.crop != null) return slots;
        JSONObject json = complete(text);
        if (json == null) return slots;
        String intent = json.optString("intent", null), crop = json.optString("crop", null);
        if (slots.intentProb == 0 && INTENTS.contains(intent)) { slots.intent = intent; slots.intentProb = 0.8f; }
        if (slots.crop == null && CROPS.contains(crop)) slots.crop = crop;
        return slots;
    }

    /** Fixed part of the chat prompt; evaluated once and cached (B's T31 note). */
    private String prefix() {
        return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\nSMS: ";
    }

    private JSONObject complete(String text) {
        // Qwen chat format with an empty thinking block: the grammar forces JSON from the first token.
        String prompt = (prefixCached ? "" : prefix())
            + text.replace("<|", "< |") + "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
        long started = System.currentTimeMillis();
        String output = nativeComplete(handle, prompt, grammar, MAX_TOKENS, TIME_BUDGET_MS);
        Log.i(TAG, "LLM slots in " + (System.currentTimeMillis() - started) + " ms");
        if (output == null) return null;
        try { return new JSONObject(output); }
        catch (Exception e) { return null; }
    }

    private static File find(Context context) {
        File[] places = {new File(context.getFilesDir(), "models/" + MODEL_NAME),
            context.getExternalFilesDir(null) == null ? null : new File(context.getExternalFilesDir(null), "models/" + MODEL_NAME)};
        for (File place : places) {
            if (place == null) continue;
            // The app creates the folders itself: a folder made by adb belongs to the shell user and is unreadable here.
            place.getParentFile().mkdirs();
            if (place.isFile() && place.length() > 100_000_000L) return place;
        }
        return null;
    }

    private static String asset(Context context, String path, String fallback) {
        try (InputStream in = context.getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int read; (read = in.read(buffer)) != -1; ) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return fallback;
        }
    }

    @Override public synchronized void close() {
        if (handle != 0) { nativeFree(handle); handle = 0; }
    }
}
