# Human test

**Goal:** before the 10:30 UTC freeze, find what confuses people. Above all, find where someone reads an answer as more certain than it is. One session takes about 20 minutes. Three to five testers are enough. At least one should be non-technical, and one a Swahili speaker if possible.

## The story the tester plays

- **Noor** has a basic phone and uses its normal SMS app. Pandastic is not on it.
- **Amani**, her daughter, has the smartphone with Pandastic. This is the "helper phone".
- Noor texts Amani about everything: school, money, and her crops. The helper phone answers **only the farming questions**, by SMS. Everything else stays a normal message for Amani.
- Each phone already has the other person in its own **Contacts** app, as a real phone would. Pandastic starts from its first screen, and the tester sets it up.

| Phone | Window | Number | In its Contacts app |
| :-- | :-- | :-- | :-- |
| Amani's helper phone | `emulator-5554` (big) | +256 772 000 001 | Mama Noor |
| Noor's phone | `emulator-5556` (small) | +256 772 000 002 | Amani (binti) |

## Before each tester (facilitator)

```bash
./run.sh          # once: both phones + the SMS carrier. Keep this terminal open.
make human-test   # before EACH tester: Pandastic wiped on both phones, Noor's SMS cleared, photos added
```

The language model is put back on the helper phone. To test the download instead, run `python3 scripts/human_test_prep.py --fresh --no-model`. That needs the Models page download button (C, in progress).

**Photo key, for the facilitator only.** The photos are in the gallery under `Pictures/PandasticTest`.

| File | Truth | What the app answers |
| :-- | :-- | :-- |
| `leaf1.jpg` | coffee rust | Sure: leaf rust |
| `leaf2.jpg` | coffee rust | Sure: leaf rust |
| `leaf3.jpg` | healthy coffee | **Not sure** ("healthy" needs 99%; this one is 98.1%) |
| `leaf4.jpg` | healthy coffee | Sure: healthy (99.1%) |
| `leaf5.jpg` | very blurred `leaf3` | Asks for a sharper photo |
| `picture6.jpg` | a table with a mug | Not a leaf it knows |

## Say at the start

> "We're testing the app, not you. If something is hard, that's what we want to find. Please think aloud. I can't help during the tasks, but you can skip any of them. May I record the screen? No names or faces."

Swahili (machine-written):

> "Tunajaribu programu, si wewe. Kitu kikiwa kigumu, ndicho tunachotaka kujua. Tafadhali sema unachofikiri. Siwezi kukusaidia wakati wa kazi, lakini unaweza kuruka yoyote. Naweza kurekodi skrini? Hakuna majina wala nyuso."

## Tasks

Read each card as written. Don't name buttons. Hint only after 60 s of being stuck, and note it.

| # | Phone | Card (read aloud) | Done when | Watch for |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Helper | "This is Amani's phone. Set up Pandastic so it can help with farming." | Picks **Capable phone** and reaches the chat | Basic vs Capable understood? |
| 2 | Helper | "Amani's mother, Mama Noor, will ask farming questions by SMS. Let her number get automatic answers." | Settings: automatic SMS replies **on**, Mama Noor picked from Contacts | Finding it; permission prompts; picking the contact |
| 3 | Noor | "You are Noor. With the normal SMS app, ask Amani whether 12,000 shillings per kilo is a good price for your coffee." | Sends from Messages; a "Pandastic:" reply arrives in a few seconds | Who do they think answered? Is "23% below" clear? |
| 4 | Noor | "Now just ask Amani how school is going." | Sends it; **no** automatic reply. On the helper phone it sits in Messages for Amani | Do they expect a bot reply? Is it fine that none comes? |
| 5 | Noor | "Tell Amani that your coffee leaves have yellow powder underneath." | Reply: "not sure from words alone, don't spray yet, show a photo or ask an officer" | ⚠️ Do they read it as a sure diagnosis? |
| 6 | Noor | (Luganda or mixed words; let the tester say it their way, e.g. *"emmwanyi zange zirwadde"*) | A safe reply within ~10 s (the language model reads it) | Wording that fails; how long they wait |
| 7 | Helper | "Your coffee leaves look strange. The photo is `leaf1` in the pictures. Find out what's wrong." | Attaches leaf1 and can say what to do next | Finding the + button; reading the steps |
| 8 | Helper | "Check `leaf3` the same way. What does the app want you to do?" | Says it's **not sure** and to ask a person | ⚠️ "Not sure" read as a diagnosis? |
| 9 | Helper | "Try `picture6`, then `leaf5`." | Understands "not a leaf" and "take a sharper photo" | Blaming themselves |
| 10 | Helper | "In the chat, ask about maize leaves with holes, in your own words." | Gets a "not sure, may be fall armyworm, ask/show a photo" kind of answer | Free typing understood? |

## Observation sheet (one per tester)

```
Tester T__   Language sw / en   Daily smartphone use yes / no   Farms yes / no

#   Alone / hint / failed   Time   Quote or confusion                      ⚠️ misread certainty?
1   ____________________   ____   _____________________________________   ___
2   ____________________   ____   _____________________________________   ___
3   ____________________   ____   _____________________________________   ___
4   ____________________   ____   _____________________________________   ___
5   ____________________   ____   _____________________________________   ___
6   ____________________   ____   _____________________________________   ___
7   ____________________   ____   _____________________________________   ___
8   ____________________   ____   _____________________________________   ___
9   ____________________   ____   _____________________________________   ___
10  ____________________   ____   _____________________________________   ___

a. In your own words, what does this do?
b. When it said "not sure", what would you do?
c. Would you trust its price answer when selling? Why?
d. Hardest moment?
e. 1 (very hard) to 5 (very easy): __
```

## After each tester

1. Write the sheet up in `docs/human-tests/<date>-T<n>.md`. Use T1, T2…, never names.
2. Put each problem on the ledger as one line: task #, what happened, severity. Anything marked ⚠️ comes first.
3. Run `make human-test` for the next tester.

**Known, not tester mistakes:**

- The Swahili text is machine-written.
- In the first ~30 s after the app opens, the language model is still loading, and odd wording gets the menu.
- Real networks deliver SMS slower than the emulator.
