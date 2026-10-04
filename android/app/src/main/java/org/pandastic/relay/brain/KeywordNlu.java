package org.pandastic.relay.brain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Keyword NLU over the knowledge.sqlite lexicon (contracts §3, §4). Deterministic and always available;
 * it is the fallback when the LLM is missing, slow, or returns something that fails the checks.
 */
public final class KeywordNlu implements Nlu {
    /** Order used to break ties between intents with the same number of hits. */
    private static final String[] INTENT_PRIORITY = {"price", "diagnose", "planting"};
    /**
     * 12000 | 12,000 | 12.000 | 12.5, optionally followed by k (thousand) or preceded by "elfu" (thousand).
     * A space is never a thousands separator: in "P 1 12000" the 1 is a menu code, not part of the price.
     */
    private static final Pattern NUMBER = Pattern.compile(
        "(elfu\\s*)?(?<!\\d)(\\d{1,3}(?:[,.]\\d{3})+(?!\\d)|\\d+(?:\\.\\d+)?)\\s*(k\\b)?", Pattern.CASE_INSENSITIVE);
    /** Prices per kg in UGX are well above this; smaller numbers are menu codes (1, 2, 3) or quantities. */
    private static final double MIN_OFFER = 100;

    private final List<Rule> rules = new ArrayList<>();

    public KeywordNlu(List<Knowledge.LexiconEntry> lexicon) {
        for (Knowledge.LexiconEntry entry : lexicon) rules.add(new Rule(entry));
    }

    @Override public Slots parse(String text, String lang) {
        String normalized = normalize(text);
        Map<String, Integer> intents = new LinkedHashMap<>(), crops = new LinkedHashMap<>(),
            symptoms = new LinkedHashMap<>(), commodities = new LinkedHashMap<>();
        int sw = 0, en = 0;
        // Terms from both languages always count: people mix Swahili and English in one SMS ("bei ya coffee").
        // The language only decides which language the reply is written in.
        for (Rule rule : rules) {
            if (!rule.pattern.matcher(normalized).find()) continue;
            boolean languageNeutral = rule.entry.term.length() <= 1;  // "1", "p", "?" exist in both languages
            if (!languageNeutral) { if ("sw".equals(rule.entry.lang)) sw++; else en++; }
            switch (rule.entry.slot) {
                case "intent": increment(intents, rule.entry.value); break;
                case "crop": increment(crops, rule.entry.value); break;
                case "symptom": increment(symptoms, rule.entry.value); break;
                case "commodity": increment(commodities, rule.entry.value); break;
                default: break;
            }
        }
        Slots slots = new Slots();
        slots.lang = lang != null ? lang : (en > sw ? "en" : "sw");  // Swahili first (decision D3)
        slots.offer = offer(text);
        slots.crop = unique(crops);
        slots.symptom = unique(symptoms);
        slots.commodity = unique(commodities);
        slots.intent = intent(intents, slots);
        slots.intentProb = 1f;
        return slots;
    }

    /** Lowercase, keep letters, digits and '?', collapse everything else to single spaces. */
    static String normalize(String text) {
        if (text == null) return "";
        String lower = text.toLowerCase(Locale.ROOT).replace("ŋ", "ng'");
        return lower.replaceAll("[^a-z0-9?]+", " ").trim();
    }

    /** Largest number in the text that looks like a price, with "12k" / "elfu 12" meaning thousands. */
    static Double offer(String text) {
        if (text == null) return null;
        Double best = null;
        Matcher m = NUMBER.matcher(text);
        while (m.find()) {
            String digits = m.group(2);
            double value;
            if (digits.matches("\\d{1,3}(?:[,.]\\d{3})+")) value = Double.parseDouble(digits.replaceAll("[,.]", ""));
            else value = Double.parseDouble(digits);
            if (m.group(1) != null || m.group(3) != null) value *= 1000;
            if (value >= MIN_OFFER && (best == null || value > best)) best = value;
        }
        return best;
    }

    private static String intent(Map<String, Integer> intents, Slots slots) {
        if (slots.offer != null && slots.crop != null) increment(intents, "price");
        String best = null;
        int bestCount = 0;
        for (String candidate : INTENT_PRIORITY) {
            int count = intents.getOrDefault(candidate, 0);
            if (count > bestCount) { best = candidate; bestCount = count; }
        }
        if (best != null) return best;
        if (slots.symptom != null) return "diagnose";
        if (intents.containsKey("help")) return "help";
        return "other";
    }

    /** The value with the most hits; null if none or if two values tie. */
    private static String unique(Map<String, Integer> counts) {
        String best = null;
        int bestCount = 0;
        boolean tie = false;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > bestCount) { best = e.getKey(); bestCount = e.getValue(); tie = false; }
            else if (e.getValue() == bestCount) tie = true;
        }
        return tie ? null : best;
    }

    private static void increment(Map<String, Integer> counts, String key) {
        counts.put(key, counts.getOrDefault(key, 0) + 1);
    }

    private static final class Rule {
        final Knowledge.LexiconEntry entry;
        final Pattern pattern;

        Rule(Knowledge.LexiconEntry entry) {
            this.entry = entry;
            String term = Pattern.quote(normalizeTerm(entry.term));
            String start = "(?<![a-z0-9?])", end = "(?![a-z0-9?])";
            switch (entry.match) {
                case "token": pattern = Pattern.compile(start + term + end); break;
                case "substring": pattern = Pattern.compile(term); break;
                default: pattern = Pattern.compile(start + term); break;  // "prefix"
            }
        }

        private static String normalizeTerm(String term) {
            return "?".equals(term) ? "?" : normalize(term);
        }
    }
}
