package org.pandastic.relay.brain;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The keyword + Qwen hybrid policy (B's fresh-SMS eval): the model may only name a missing intent. */
public class LlmNluPolicyTest {
    private static Slots keywords(String intent, String crop) {
        Slots s = new Slots();
        s.lang = "sw";
        s.intent = intent;
        s.intentProb = intent == null ? 0f : 1f;
        s.crop = crop;
        return s;
    }

    @Test public void modelIsAskedOnlyWhenKeywordsFoundNoIntent() {
        assertFalse(LlmNlu.needsModel(keywords("price", null)));
        assertFalse(LlmNlu.needsModel(keywords("diagnose", "coffee")));
        assertTrue(LlmNlu.needsModel(keywords(null, "coffee")));
    }

    @Test public void modelFillsAMissingIntent() {
        Slots s = LlmNlu.merge(keywords(null, null), "diagnose");
        assertEquals("diagnose", s.intent);
        assertEquals(0.8f, s.intentProb, 1e-6);
    }

    @Test public void modelNeverOverridesAKeywordIntent() {
        Slots s = LlmNlu.merge(keywords("price", null), "diagnose");
        assertEquals("price", s.intent);
        assertEquals(1f, s.intentProb, 1e-6);
    }

    @Test public void unknownOrMissingModelIntentIsIgnored() {
        assertNull(LlmNlu.merge(keywords(null, null), "sell_my_farm").intent);
        assertNull(LlmNlu.merge(keywords(null, null), null).intent);
        assertEquals(0f, LlmNlu.merge(keywords(null, null), null).intentProb, 1e-6);
    }

    @Test public void cropStaysWhatTheFarmerWrote() {
        // "mihogo" (cassava) has no crop of ours: keywords leave it empty and the model must not invent coffee.
        Slots s = LlmNlu.merge(keywords(null, null), "diagnose");
        assertNull(s.crop);
        assertEquals("maize", LlmNlu.merge(keywords(null, "maize"), "price").crop);
    }
}
