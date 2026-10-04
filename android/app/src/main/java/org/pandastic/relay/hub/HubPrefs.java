package org.pandastic.relay.hub;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Hub settings chosen by the phone's owner: on/off, which numbers may ask, reply language. */
public final class HubPrefs {
    private static final String FILE = "hub";
    private static final String ENABLED = "enabled";
    private static final String CONTACTS = "contacts";
    private static final String LANG = "lang";
    /** Uganda/Kenya/Tanzania mobile numbers are 9 digits after the country code or leading 0. */
    private static final int MATCH_DIGITS = 9;
    private static final int MIN_DIGITS = 7;

    private final SharedPreferences prefs;

    public HubPrefs(Context context) {
        prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public boolean enabled() { return prefs.getBoolean(ENABLED, false); }

    public void setEnabled(boolean enabled) { prefs.edit().putBoolean(ENABLED, enabled).apply(); }

    public String lang() { return prefs.getString(LANG, "sw"); }

    public void setLang(String lang) { prefs.edit().putString(LANG, "en".equals(lang) ? "en" : "sw").apply(); }

    /** [{"name": "Mama", "number": "+256700000001"}]. Only these senders get answers. */
    public JSONArray contacts() {
        try { return new JSONArray(prefs.getString(CONTACTS, "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }

    public void setContacts(JSONArray contacts) throws JSONException {
        JSONArray clean = new JSONArray();
        for (int i = 0; i < contacts.length(); i++) {
            JSONObject contact = contacts.getJSONObject(i);
            String number = contact.optString("number", "").trim();
            if (digits(number).length() < MIN_DIGITS) continue;
            clean.put(new JSONObject().put("name", contact.optString("name", "").trim()).put("number", number));
        }
        prefs.edit().putString(CONTACTS, clean.toString()).apply();
    }

    /** Contact name for an allowed sender, or null when the sender must be ignored. */
    public String contactName(String sender) {
        String key = matchKey(sender);
        if (key == null) return null;
        JSONArray contacts = contacts();
        for (int i = 0; i < contacts.length(); i++) {
            JSONObject contact = contacts.optJSONObject(i);
            if (contact != null && key.equals(matchKey(contact.optString("number")))) {
                String name = contact.optString("name");
                return name.isEmpty() ? "" : name;
            }
        }
        return null;
    }

    /** Last 9 digits, so +256 700… and 0700… match. Null for short codes and alphanumeric senders. */
    static String matchKey(String number) {
        if (number == null) return null;
        if (!number.trim().matches("\\+?[0-9 ()-]+")) return null;
        String digits = digits(number);
        if (digits.length() < MIN_DIGITS) return null;
        return digits.length() > MATCH_DIGITS ? digits.substring(digits.length() - MATCH_DIGITS) : digits;
    }

    private static String digits(String number) { return number == null ? "" : number.replaceAll("[^0-9]", ""); }
}
