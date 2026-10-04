package org.pandastic.relay.brain;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The keyword + Qwen hybrid policy (B's SMS evals): the model may name a missing intent; the fine-tuned
 * model may also name a missing symptom that fits the crop. Never the crop.
 */
public class LlmNluPolicyTest {
    private static Slots keywords(String intent, String crop, String symptom) {
        Slots s = new Slots();
        s.lang = "sw";
        s.intent = intent;
        s.intentProb = intent == null ? 0f : 1f;
        s.crop = crop;
        s.symptom = symptom;
        return s;
    }

    @Test public void modelIsAskedOnlyWhenKeywordsMissSomething() {
        assertFalse(LlmNlu.needsModel(keywords("price", null, null), true));
        assertFalse(LlmNlu.needsModel(keywords("diagnose", "coffee", "rust"), true));
        assertTrue(LlmNlu.needsModel(keywords(null, "coffee", null), false));
        // A problem report without a symptom: only the fine-tuned model is asked for one.
        assertTrue(LlmNlu.needsModel(keywords("diagnose", "coffee", null), true));
        assertFalse(LlmNlu.needsModel(keywords("diagnose", "coffee", null), false));
        assertFalse("no crop: a symptom could not be used", LlmNlu.needsModel(keywords("diagnose", null, null), true));
    }

    @Test public void modelFillsAMissingIntent() {
        Slots s = LlmNlu.merge(keywords(null, null, null), "diagnose", null);
        assertEquals("diagnose", s.intent);
        assertEquals(0.8f, s.intentProb, 1e-6);
    }

    @Test public void modelNeverOverridesAKeywordIntent() {
        Slots s = LlmNlu.merge(keywords("price", null, null), "diagnose", "rust");
        assertEquals("price", s.intent);
        assertEquals(1f, s.intentProb, 1e-6);
        assertNull("no symptom on a price question", s.symptom);
    }

    @Test public void unknownOrMissingModelValuesAreIgnored() {
        assertNull(LlmNlu.merge(keywords(null, null, null), "sell_my_farm", null).intent);
        assertNull(LlmNlu.merge(keywords(null, null, null), null, null).intent);
        assertNull(LlmNlu.merge(keywords("diagnose", "coffee", null), null, "null").symptom);
        assertNull(LlmNlu.merge(keywords("diagnose", "coffee", null), null, "dragon_pox").symptom);
    }

    @Test public void symptomMustFitTheCrop() {
        assertEquals("rust", LlmNlu.merge(keywords("diagnose", "coffee", null), null, "rust").symptom);
        assertEquals("fall_armyworm", LlmNlu.merge(keywords("diagnose", "maize", null), null, "fall_armyworm").symptom);
        // Fall armyworm is not a coffee label: keep "not sure" rather than a wrong pairing.
        assertNull(LlmNlu.merge(keywords("diagnose", "coffee", null), null, "fall_armyworm").symptom);
        // No crop the keywords know (Luganda "emmwanyi" = coffee): the model's symptom may be another plant's.
        assertNull(LlmNlu.merge(keywords("diagnose", null, null), null, "lethal_necrosis").symptom);
        assertNull(LlmNlu.merge(keywords("diagnose", "coffee", null), null, "healthy").symptom);
    }

    @Test public void keywordSymptomIsNeverReplaced() {
        assertEquals("miner", LlmNlu.merge(keywords("diagnose", "coffee", "miner"), null, "rust").symptom);
    }

    @Test public void symptomOnlyForAProblemReport() {
        // The model's own intent makes it a problem report: then its symptom may be used too.
        Slots s = LlmNlu.merge(keywords(null, "coffee", null), "diagnose", "rust");
        assertEquals("diagnose", s.intent);
        assertEquals("rust", s.symptom);
        assertNull(LlmNlu.merge(keywords(null, "coffee", null), "help", "rust").symptom);
    }

    @Test public void cropStaysWhatTheFarmerWrote() {
        // "mihogo" (cassava) has no crop of ours: keywords leave it empty and the model must not invent coffee.
        assertNull(LlmNlu.merge(keywords(null, null, null), "diagnose", null).crop);
        assertEquals("maize", LlmNlu.merge(keywords(null, "maize", null), "price", null).crop);
    }
}
