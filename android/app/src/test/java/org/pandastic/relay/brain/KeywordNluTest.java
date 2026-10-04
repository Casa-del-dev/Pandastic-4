package org.pandastic.relay.brain;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Before;
import org.junit.Test;

public class KeywordNluTest {
    private KeywordNlu nlu;

    @Before public void setUp() throws Exception { nlu = new KeywordNlu(new FakeKnowledge().lexicon()); }

    @Test public void swahiliRustDescription() {
        Slots s = nlu.parse("Majani ya kahawa yana unga wa njano chini", null);
        assertEquals("sw", s.lang);
        assertEquals("diagnose", s.intent);
        assertEquals("coffee", s.crop);
        assertEquals("rust", s.symptom);
        assertNull(s.offer);
    }

    @Test public void swahiliPriceWithOffer() {
        Slots s = nlu.parse("Bei ya kahawa? Mnunuzi anasema 12,000", null);
        assertEquals("sw", s.lang);
        assertEquals("price", s.intent);
        assertEquals("coffee", s.crop);
        assertEquals(12000.0, s.offer, 0.01);
    }

    @Test public void shortCodePriceIgnoresMenuNumber() {
        Slots s = nlu.parse("P 1 12k", null);
        assertEquals("price", s.intent);
        assertEquals("coffee", s.crop);
        assertEquals(12000.0, s.offer, 0.01);
    }

    @Test public void cropAndNumberAloneMeansPrice() {
        Slots s = nlu.parse("mahindi 900", null);
        assertEquals("price", s.intent);
        assertEquals("maize", s.crop);
        assertEquals(900.0, s.offer, 0.01);
    }

    @Test public void englishArmyworm() {
        Slots s = nlu.parse("Worms are eating my maize leaves", null);
        assertEquals("en", s.lang);
        assertEquals("diagnose", s.intent);
        assertEquals("maize", s.crop);
        assertEquals("fall_armyworm", s.symptom);
    }

    @Test public void mixedLanguageStillFindsCrop() {
        Slots s = nlu.parse("bei ya coffee leo 15000", null);
        assertEquals("price", s.intent);
        assertEquals("coffee", s.crop);
    }

    @Test public void kibokoSetsCommodity() {
        Slots s = nlu.parse("bei ya kiboko", null);
        assertEquals("price", s.intent);
        assertEquals("coffee_robusta_kiboko", s.commodity);
    }

    @Test public void helpAndUnknown() {
        assertEquals("help", nlu.parse("?", null).intent);
        assertEquals("help", nlu.parse("Habari", null).intent);
        assertEquals("other", nlu.parse("asante sana", null).intent);
    }

    @Test public void shortTermsDoNotMatchInsideWords() {
        // "bei" must not fire inside "kubeba"; "p" must not fire inside "panda"; "doa" not inside "kadoa".
        Slots s = nlu.parse("nataka kubeba panda kadoa", null);
        assertEquals("other", s.intent);
    }

    @Test public void offerParsing() {
        assertEquals(12000.0, KeywordNlu.offer("12,000"), 0.01);
        assertEquals(12000.0, KeywordNlu.offer("12.000 shs"), 0.01);
        assertEquals(12500.0, KeywordNlu.offer("12.5k"), 0.01);
        assertEquals(15000.0, KeywordNlu.offer("elfu 15"), 0.01);
        assertNull(KeywordNlu.offer("P 1"));
        assertNull(KeywordNlu.offer(null));
    }

    @Test public void normalizeKeepsQuestionMark() {
        assertEquals("bei ya kahawa ?", KeywordNlu.normalize("Bei ya KAHAWA ?!"));
    }
}
