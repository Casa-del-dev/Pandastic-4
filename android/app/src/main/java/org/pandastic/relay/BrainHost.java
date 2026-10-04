package org.pandastic.relay;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;
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

/**
 * One place that owns the on-device models. The UI bridge and the SMS hub both submit work here,
 * and it runs on a single thread, so two inferences never compete for the phone's memory.
 */
public final class BrainHost {
    private static final String TAG = "PandasticBrain";
    private static BrainHost instance;

    private final Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LeafClassifier classifier;
    private String classifierError;
    private Brain brain;
    private LlmNlu llm;
    private String brainError;

    public static synchronized BrainHost get(Context context) {
        if (instance == null) instance = new BrainHost(context.getApplicationContext());
        return instance;
    }

    private BrainHost(Context context) { this.context = context; }

    public <T> Future<T> submit(Callable<T> task) { return worker.submit(task); }

    /** Loads the knowledge base and the LLM (and caches its prompt) before the first question arrives. */
    public void warmUp() { worker.execute(this::brain); }

    /** Photo + optional question → decision JSON (contracts §2). Call from the worker thread. */
    public String photo(Bitmap bitmap, String text, String lang) throws Exception {
        String issue = QualityGate.check(bitmap);
        LeafClassifier model = classifier();
        Brain brain = brain();
        ClassifierResult result = issue == null && model != null ? model.classify(bitmap) : null;
        if (brain == null) return interimPhoto(issue, result, model != null && model.stub, lang).toString();
        // Without a classifier the Brain sees no result and answers "not sure — ask a person".
        JSONObject decision = new JSONObject(brain.answerPhoto(issue, result, text, lang).toJson());
        return decision.put("stub", model != null && model.stub).toString();
    }

    /** Typed or SMS question → decision JSON. Call from the worker thread. */
    public String text(String text, String lang) throws Exception {
        return smsReply(text, lang).decisionJson;
    }

    /** SMS question → reply text. Call from the worker thread. */
    public Responder.Reply smsReply(String text, String lang) throws Exception {
        Brain brain = brain();
        if (brain == null) return new Responder.Fallback().answer(text, lang);
        Decision decision = brain.answerText(text, lang);
        return new Responder.Reply(SmsFormatter.format(decision), decision.toJson());
    }

    public JSONObject info() throws JSONException {
        LeafClassifier model = classifier();
        return new JSONObject()
            .put("classifier", model == null ? JSONObject.NULL : model.version)
            .put("classifierStub", model != null && model.stub)
            .put("classifierError", classifierError == null ? JSONObject.NULL : classifierError)
            .put("brain", brain() != null)
            .put("llm", llm == null ? JSONObject.NULL : LlmNlu.MODEL_NAME)
            .put("brainError", brainError == null ? JSONObject.NULL : brainError);
    }

    /** Knowledge base + resolver. Null only if knowledge.sqlite cannot be opened; then replies stay safe fallbacks. */
    private synchronized Brain brain() {
        if (brain == null && brainError == null) {
            try {
                Knowledge knowledge = Knowledge.open(context);
                llm = LlmNlu.open(context, new KeywordNlu(knowledge.lexicon()));
                brain = new Brain(knowledge, llm);
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
