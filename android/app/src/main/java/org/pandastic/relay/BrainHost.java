package org.pandastic.relay;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;
import java.io.File;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONException;
import org.json.JSONObject;
import org.pandastic.relay.brain.Brain;
import org.pandastic.relay.brain.ClassifierResult;
import org.pandastic.relay.brain.Decision;
import org.pandastic.relay.brain.KeywordNlu;
import org.pandastic.relay.brain.Knowledge;
import org.pandastic.relay.brain.LeafClassifier;
import org.pandastic.relay.brain.LlmNlu;
import org.pandastic.relay.brain.QualityGate;
import org.pandastic.relay.brain.SmsFormatter;
import org.pandastic.relay.hub.Responder;
import org.pandastic.relay.hub.HubPolicy;
import org.pandastic.relay.hub.HubPrefs;

/**
 * One place that owns the on-device models. The UI bridge and the SMS hub both submit work here,
 * and it runs on a single thread, so two inferences never compete for the phone's memory.
 * The LLM loads on its own thread (tens of seconds on a slow phone); until it is ready, questions
 * are answered by the keyword NLU alone instead of waiting.
 */
public final class BrainHost {
    private static final String TAG = "PandasticBrain";
    private static BrainHost instance;

    private final Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService llmLoader = Executors.newSingleThreadExecutor();
    // volatile: info() and status() read them from the UI thread without waiting for a load in progress.
    private volatile LeafClassifier classifier;
    private volatile String classifierError;
    private volatile Brain brain;
    private Knowledge knowledge;
    private volatile LlmNlu llm;
    private volatile KeywordNlu keywords;
    /** LLM loads queued or running. A count, not a flag: a load for an unloaded Brain finishing must not
     *  report "not loading" while the next one is still queued (e2e caught info() saying llm=null, done). */
    private final java.util.concurrent.atomic.AtomicInteger llmLoads = new java.util.concurrent.atomic.AtomicInteger();
    private volatile Future<?> llmLoad;
    private final java.util.concurrent.atomic.AtomicBoolean warmUpQueued = new java.util.concurrent.atomic.AtomicBoolean();
    private volatile String brainError;

    public static synchronized BrainHost get(Context context) {
        if (instance == null) instance = new BrainHost(context.getApplicationContext());
        return instance;
    }

    private BrainHost(Context context) { this.context = context; }

    /** Finish any active inference, then release model memory when the owner chooses Basic phone. */
    public static synchronized void unloadIfLoaded() {
        if (instance == null) return;
        BrainHost host = instance;
        host.worker.execute(host::unload);
    }

    public synchronized void unload() {
        if (classifier != null) {
            try { classifier.close(); } catch (Exception e) { Log.w(TAG, "Classifier close failed"); }
        }
        if (llm != null) llm.close();
        if (knowledge != null) knowledge.close();
        classifier = null; llm = null; knowledge = null; brain = null; keywords = null;
        classifierError = null; brainError = null;
    }

    /**
     * Called on the model worker only, following an explicit action on the Models page. Unlike warmUp it
     * waits for the LLM too, so the page can report whether everything loaded.
     */
    public void loadModels() throws Exception {
        if (!new HubPrefs(context).capable()) return;
        classifier();
        brain();
        Future<?> pending = llmLoad;
        if (pending != null) pending.get();
    }

    /** Reads files and current state without opening any model or knowledge database. */
    public static synchronized JSONObject status(Context context) throws Exception {
        JSONObject meta;
        try (InputStream in = context.getAssets().open("models/leaf_classifier.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int n; (n = in.read(buffer)) > 0; ) bytes.write(buffer, 0, n);
            meta = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        }
        BrainHost host = instance;
        File model = LlmNlu.find(context);
        return new JSONObject()
            .put("classifier", new JSONObject().put("installed", true)
                .put("loaded", host != null && host.classifier != null)
                .put("version", meta.optString("version"))
                .put("stub", meta.optBoolean("stub", false))
                .put("bytes", assetSize(context, "models/leaf_classifier.onnx"))
                .put("error", host == null || host.classifierError == null ? JSONObject.NULL : host.classifierError))
            .put("language", new JSONObject().put("name", model == null ? LlmNlu.MODEL_NAME : model.getName())
                .put("installed", model != null).put("loaded", host != null && host.llm != null)
                .put("runtimeAvailable", LlmNlu.runtimeAvailable()).put("bytes", model == null ? 0 : model.length()))
            .put("knowledge", new JSONObject().put("installed", true).put("loaded", host != null && host.brain != null)
                .put("bytes", assetSize(context, "models/knowledge.sqlite"))
                .put("error", host == null || host.brainError == null ? JSONObject.NULL : host.brainError));
    }

    private static long assetSize(Context context, String path) {
        try (android.content.res.AssetFileDescriptor file = context.getAssets().openFd(path)) { return file.getLength(); }
        catch (Exception e) { return 0; }
    }

    public <T> Future<T> submit(Callable<T> task) { return worker.submit(task); }

    /** Capable phone: loads the classifier, the knowledge base and (in the background) the LLM before the first question. */
    public void warmUp() {
        if (!warmUpQueued.compareAndSet(false, true)) return;  // info() polls; one queued warm-up is enough
        worker.execute(() -> {
            try { if (new HubPrefs(context).capable()) { classifier(); brain(); } }
            finally { warmUpQueued.set(false); }
        });
    }

    /** Photo + optional question → decision JSON (contracts §2). Call from the worker thread. */
    public String photo(Bitmap bitmap, String text, String lang) throws Exception {
        String issue = QualityGate.check(bitmap);
        LeafClassifier model = classifier();
        Brain brain = brain();
        ClassifierResult result = issue == null && model != null ? model.classify(bitmap) : null;
        // A photo with almost no leaf colour is not a crop leaf, whatever the classifier says (it was never
        // shown streets, animals or machines): answer "not a leaf I know" instead of a confident disease.
        double plantShare = QualityGate.plantShare(bitmap);
        boolean notAPlant = result != null && plantShare < QualityGate.MIN_PLANT_SHARE;
        if (notAPlant) result = result.asOther();
        if (brain == null) return interimPhoto(issue, result, model != null && model.stub, lang).toString();
        // Without a classifier the Brain sees no result and answers "not sure — ask a person".
        JSONObject decision = new JSONObject(brain.answerPhoto(issue, result, text, lang).toJson());
        if (text != null && !text.trim().isEmpty()) {  // the words with the photo went through the same NLU
            LlmNlu language = llm;
            decision.put("nlu", language != null ? language.lastSource : llmLoads.get() > 0 ? "keywords_model_loading" : "keywords_no_model");
        }
        return decision.put("stub", model != null && model.stub)
            .put("plant_share", Math.round(plantShare * 100) / 100.0).put("not_a_plant", notAPlant).toString();
    }

    /** Typed or SMS question → decision JSON. Call from the worker thread. */
    public String text(String text, String lang) throws Exception {
        return smsReply(text, lang).decisionJson;
    }

    /** SMS question → reply text. Call from the worker thread. */
    public Responder.Reply smsReply(String text, String lang) throws Exception {
        if (!new HubPrefs(context).capable()) return new Responder.Fallback().answer(text, lang);
        Brain brain = brain();
        if (brain == null) return new Responder.Fallback().answer(text, lang);
        Decision decision = brain.answerText(text, lang);
        // Which part understood the message, so the UI, the hub log and the tests can see the language model work.
        LlmNlu model = llm;
        String nlu = model != null ? model.lastSource : llmLoads.get() > 0 ? "keywords_model_loading" : "keywords_no_model";
        String json = new JSONObject(decision.toJson()).put("nlu", nlu).toString();
        // Personal messages from the same allowed numbers get no automatic reply: decide on the keywords'
        // own reading (cheap) plus the final intent (HubPolicy).
        KeywordNlu words = keywords;
        boolean farming = HubPolicy.isFarmingQuestion(text, words == null ? null : words.parse(text, lang), decision.intent);
        return new Responder.Reply(SmsFormatter.format(decision), json, farming);
    }

    /**
     * What is loaded right now. Never waits for a model (the UI calls it on its own thread); while
     * something is still loading, "loading" is true and the load is started if nobody asked yet.
     */
    public JSONObject info() throws JSONException {
        LeafClassifier model = classifier;
        boolean missing = (model == null && classifierError == null) || (brain == null && brainError == null);
        boolean capable = new HubPrefs(context).capable();  // a Basic phone never loads models
        boolean loading = capable && (missing || llmLoads.get() > 0);
        if (capable && missing) warmUp();
        return new JSONObject()
            .put("classifier", model == null ? JSONObject.NULL : model.version)
            .put("classifierStub", model != null && model.stub)
            .put("classifierError", classifierError == null ? JSONObject.NULL : classifierError)
            .put("brain", brain != null)
            .put("llm", llm == null ? JSONObject.NULL : llm.modelName())
            .put("brainError", brainError == null ? JSONObject.NULL : brainError)
            .put("loading", loading);
    }

    /** Loads the LLM in the background for this Brain; until then keywords answer alone. */
    private synchronized void startLlmLoad(Brain owner, KeywordNlu keywords) {
        llmLoads.incrementAndGet();
        llmLoad = llmLoader.submit(() -> {
            LlmNlu loaded = null;
            try { loaded = LlmNlu.open(context, keywords); }
            catch (Throwable e) { Log.e(TAG, "LLM unavailable; keywords only", e); }
            synchronized (this) {  // unload() may have run meanwhile (Basic phone): then free it again
                if (brain == owner) llm = loaded;
                else if (loaded != null) loaded.close();
                llmLoads.decrementAndGet();
            }
        });
    }

    /** A model file just arrived (download): load it into the running Brain, or load everything. */
    public void loadLanguageModel() {
        worker.execute(() -> {
            if (!new HubPrefs(context).capable()) return;
            synchronized (this) {
                if (brain != null && llm == null && llmLoads.get() == 0 && keywords != null) { startLlmLoad(brain, keywords); return; }
            }
            classifier();
            brain();
        });
    }

    /** Knowledge base + resolver. Null only if knowledge.sqlite cannot be opened; then replies stay safe fallbacks. */
    private synchronized Brain brain() {
        if (brain == null && brainError == null) {
            try {
                knowledge = Knowledge.open(context);
                KeywordNlu keywords = this.keywords = new KeywordNlu(knowledge.lexicon());
                // Keywords answer until the LLM is ready; then it fills only what they missed (LlmNlu.parse).
                Brain created = brain = new Brain(knowledge, (text, lang) -> {
                    LlmNlu model = llm;
                    return model != null ? model.parse(text, lang) : keywords.parse(text, lang);
                });
                startLlmLoad(created, keywords);
            }
            catch (Exception e) {
                brainError = e.getClass().getSimpleName();
                Log.e(TAG, "Knowledge base unavailable", e);
            }
        }
        return brain;
    }

    private synchronized LeafClassifier classifier() {
        if (classifier == null && classifierError == null) {
            try { classifier = new LeafClassifier(context); }
            catch (Exception e) {
                classifierError = e.getClass().getSimpleName();
                Log.e(TAG, "Leaf classifier unavailable", e);
            }
        }
        return classifier;
    }

    /**
     * Resolver steps 1, 2 and 4 of contracts §2 without advice text, used only if the knowledge
     * base fails to open, so the photo check still answers safely.
     */
    private static JSONObject interimPhoto(String issue, ClassifierResult result, boolean stub, String lang) throws JSONException {
        JSONObject decision = new JSONObject().put("lang", lang == null ? "sw" : lang).put("stub", stub);
        if (issue != null) return decision.put("status", "RETAKE").put("quality", issue).put("crop", "unknown").put("escalate", true);
        if (result == null) return decision.put("status", "NO_DATA").put("crop", "unknown").put("escalate", true);
        int top = result.top1(), second = result.top2();
        String label = result.labels[top];
        float margin = result.probs[top] - (second < 0 ? 0 : result.probs[second]);
        decision.put("label", label).put("prob", result.probs[top]);
        if (second >= 0) decision.put("runner_up", result.labels[second]).put("runner_up_prob", result.probs[second]);
        if ("other".equals(label)) return decision.put("status", "UNSUPPORTED").put("crop", "unknown").put("escalate", true);
        boolean confident = result.probs[top] >= result.minProbFor(label) && margin >= result.minMargin;
        return decision.put("status", confident ? "CONFIDENT" : "UNCERTAIN")
            .put("crop", label.substring(0, label.indexOf('_')))
            .put("escalate", !confident);
    }
}
