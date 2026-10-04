# Human test: script and observation sheet

**Goal:** find what confuses people and where an answer could be misread as more certain than it is, before the 10:30 UTC freeze. A session takes 15–20 minutes. Three to five testers are enough to find most problems. At least one should be non-technical, and one should be a Swahili speaker if possible.

**What we want to learn:**
1. Can a first-time user set up the phone (phone mode) without help?
2. Can they check a leaf photo, and do they understand a "not sure" answer as *not sure*?
3. Can they tell whether a buyer's price is fair?
4. Can the helper phone's owner let another number ask by SMS, and does the Basic phone user get and understand the reply?

## 1. Before each session (facilitator)

Two commands:

```bash
./run.sh          # once: both emulator phones, build + install, SMS carrier. Keep this terminal open.
make human-test   # before EACH tester, in a second terminal: both phones back to their first screen + test photos
```

`./run.sh` starts the helper phone (`emulator-5554`, +256 772 000 001) and Noor's Basic phone (`emulator-5556`, +256 772 000 002). It keeps the SMS "carrier" running between them. `make human-test` wipes the app's data on both phones: settings, chats and SMS history. It puts the side-loaded language model back, adds the test photos to both galleries and opens the app on its first screen.

- **Record** (with consent):
  - Screen recording on each emulator: `adb -s emulator-5554 shell screenrecord --time-limit 180 /sdcard/t1.mp4` (3 min max per file).
  - Or record the laptop screen.
- **Logs:** `adb -s emulator-5554 logcat -c` before you start; save `adb -s emulator-5554 logcat -d > tester-N.log` after.
- **Language:** set the app language the tester prefers (Swahili is the default).
- **Photo key:** this is for the facilitator only. Don't show it to testers.

| File | Truth | What the app answers now |
| :-- | :-- | :-- |
| `leaf1.jpg` | coffee rust | Sure: leaf rust (94%) |
| `leaf2.jpg` | coffee rust | Sure: leaf rust (85%) |
| `leaf3.jpg` | healthy coffee | Not sure (leans healthy, 70%; "healthy" needs 95%) |
| `leaf4.jpg` | healthy coffee | Not sure (rust 36% vs healthy 31%) |
| `leaf5.jpg` | blurred copy of leaf3 | "Not a leaf I know": ask for another photo |
| `picture6.jpg` | a table with a mug | "Not a leaf I know" |

## 2. What to say at the start (read it out; don't explain the app)

> "Thank you for helping. We're testing the app, not you. If something is hard, that's the app's fault and exactly what we want to find. Please think aloud: say what you're looking for and what you expect. I can't help during the tasks, but you can stop or skip at any time. Is it OK if I record the screen? No names or faces are recorded."

Swahili (machine-written, have a speaker check it):
> "Asante kwa kutusaidia. Tunajaribu programu, si wewe. Kitu kikiwa kigumu, ni kosa la programu, na ndicho tunachotaka kujua. Tafadhali sema unachofikiri: unachotafuta na unachotarajia. Siwezi kukusaidia wakati wa kazi, lakini unaweza kusimama au kuruka wakati wowote. Je, ni sawa nirekodi skrini? Hakuna majina wala nyuso zitakazorekodiwa."

## 3. Tasks

Read each task card as written. Don't name buttons or screens. Only give a hint if the tester is stuck for 60 s, and mark it.

| # | Phone | Task card (read aloud) | Done when | Watch for |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Helper (5554) | "This is your daughter's phone. Set it up so it can check plant leaves." | Chooses **Capable phone**, reaches the chat | Do they understand Basic vs Capable? Do they read the RAM line? |
| 2 | Helper | "Your coffee leaves look strange. The photo is in the phone's pictures, `leaf1`. Find out what's wrong." | Attaches leaf1 from Gallery, reads the answer, can say what to do next | Finding the attach (+) button; reading the advice steps |
| 3 | Helper | "Check `leaf4` the same way. What does the app want you to do?" | Says it's **not sure** and to ask a person / not spray | ⚠️ Do they read "not sure" as a diagnosis? |
| 4 | Helper | "Try `picture6`." | Understands it's not a leaf the app knows | Confusion, or blaming themselves |
| 5 | Helper | "A buyer offers you 12,000 shillings per kilo for your coffee. Is that a good price? Use the app." | Types a question (e.g. `bei ya kahawa 12000`); says it's about 23% below | Do they know they can type freely? Is "23% below" clear? |
| 6 | Helper | "Without a photo, ask the app about yellow powder under your coffee leaves." | Reads "not sure from words, don't spray yet, show a photo" | ⚠️ Do they think it diagnosed rust for sure? |
| 7 | Helper | "Your mother Noor has another phone, number **+256 772 000 002**. Let her phone ask this phone questions by SMS." | Settings → automatic SMS replies **on**, number added | Finding it at all; permission prompts; the battery prompt |
| 8 | Basic (5556) | "This is Noor's small phone. Set it up, then ask the helper phone (**+256 772 000 001**) for today's coffee price." | Chooses **Basic phone**, sets the number, sends; the reply arrives in ~2–10 s | Typing the number; waiting; understanding the reply SMS |
| 9 | (optional) terminal | "Noor has no smartphone at all. Text the helper phone from this keyboard phone." The facilitator runs `make sms-phone` and types what the tester dictates. | Reply understood | Does the SMS wording work for a plain-SMS user? |

Read-aloud ("listen") will be added back by the frontend agent. If a speaker button is visible, add a task: "Have the app read the answer to you."

## 4. Observation sheet (copy one per tester)

```
Tester: T__   Date/time: ____   Language: sw / en   Phone use: basic / smartphone daily   Farming: yes / no

#  Result (alone / hint / failed)  Time   First thing they tapped      Quotes / confusion            ⚠️ misread certainty?
1  ______________________________  ____   ________________________     ____________________________  ___
2  ______________________________  ____   ________________________     ____________________________  ___
3  ______________________________  ____   ________________________     ____________________________  ___
4  ______________________________  ____   ________________________     ____________________________  ___
5  ______________________________  ____   ________________________     ____________________________  ___
6  ______________________________  ____   ________________________     ____________________________  ___
7  ______________________________  ____   ________________________     ____________________________  ___
8  ______________________________  ____   ________________________     ____________________________  ___
9  ______________________________  ____   ________________________     ____________________________  ___

After the tasks (ask, then write the answer down word for word):
a. "In your own words, what does this app do?"
b. "When the app said it was not sure, what would you do next?"
c. "Would you trust its price answer when selling? Why / why not?"
d. "What was the hardest moment?"
e. "From 1 (very hard) to 5 (very easy), how easy was it?"  __
f. "Would you tell a neighbour about it? What would you say?"
```

## 5. After each session

1. Save the recordings: `adb -s emulator-5554 pull /sdcard/t1.mp4`, plus the logcat.
2. Write the sheet up in `docs/human-tests/<date>-T<n>.md`. Use no names, only T1, T2…
3. Put each problem on the ledger as one line: task #, what happened, severity. ⚠️ means the tester believed an uncertain answer, so it's top priority.
4. Reset for the next tester: `make human-test`.

## 6. Known issues (don't count these as tester mistakes)

- The Swahili texts are machine-written; a native speaker hasn't reviewed them yet.
- The read-aloud button is missing from the current UI (native side ready; C is adding it).
- The language model needs about 30 s after the app starts on the emulator. Questions are answered by keywords until then.
- `leaf3`/`leaf4` are real healthy leaves that the app is not sure about: "healthy" requires 95% on purpose.
- On a real network, SMS replies can take longer than on the emulator.
