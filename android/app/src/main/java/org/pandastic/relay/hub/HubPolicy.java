package org.pandastic.relay.hub;

import java.util.Locale;
import java.util.regex.Pattern;
import org.pandastic.relay.brain.Slots;

/**
 * Which SMS from an allowed contact the helper phone answers by itself. Noor texts her daughter about
 * everything ("how is school?"), and the daughter's phone is the helper: personal messages must never get an
 * automatic reply. Pandastic only listens; every SMS still arrives in the phone's normal SMS app, so the
 * daughter reads and answers personal ones as always. The helper answers only clear farming questions:
 * <ul>
 *   <li>an explicit request for the menu ("?", "msaada", "menu", "help", "pandastic");</li>
 *   <li>a price, crop problem or planting question that the keywords recognised;</li>
 *   <li>one the language model recognised, if the keywords also found a crop word in it (the model alone
 *       sometimes reads chit-chat as a question, and a wrong reply to a family message is worse than none).</li>
 * </ul>
 */
public final class HubPolicy {
    private static final Pattern ASKS_FOR_MENU = Pattern.compile(
        "^\\s*\\?+\\s*$|(^|\\s)(msaada|menyu|menu|help|pandastic)(\\s|[?!.]|$)");
    // Used only when the models failed: then nothing tells us the intent, so a few unmistakable words decide.
    private static final Pattern FARMING_WORDS = Pattern.compile(
        "(^|[^a-z])(p ?[123]|kahawa|mahindi|maharage|coffee|maize|beans?|bei|price|majani|leaves|leaf|"
            + "wadudu|pests?|ugonjwa|disease|mbolea|kupanda|plant)([^a-z]|$)");

    private HubPolicy() {}

    /**
     * @param keywords what the keyword NLU alone read from the SMS (null if unavailable)
     * @param intent   the final intent of the answer (keywords, or the language model when they found none)
     */
    public static boolean isFarmingQuestion(String text, Slots keywords, String intent) {
        if (text == null) return false;
        if (asksForMenu(text)) return true;
        if (keywords == null) return looksLikeFarming(text);
        if (keywords.intentProb > 0 && isQuestion(keywords.intent)) return true;
        return isQuestion(intent) && keywords.crop != null;
    }

    public static boolean asksForMenu(String text) {
        return text != null && ASKS_FOR_MENU.matcher(text.toLowerCase(Locale.ROOT)).find();
    }

    /** Fallback when no NLU ran (models failed): unmistakable farming words only. */
    public static boolean looksLikeFarming(String text) {
        return text != null && (asksForMenu(text) || FARMING_WORDS.matcher(text.toLowerCase(Locale.ROOT)).find());
    }

    private static boolean isQuestion(String intent) {
        return "price".equals(intent) || "diagnose".equals(intent) || "planting".equals(intent);
    }
}
