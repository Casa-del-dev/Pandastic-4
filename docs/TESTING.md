# Testing Pandastic

There are three levels, from fastest to most real. The commands run from the repo root.

| What | Command | Needs | Time |
| :-- | :-- | :-- | :-- |
| Logic (resolver, keywords, SMS format, hub rules) | `cd android && ./gradlew testDebugUnitTest` | nothing | 1 min |
| UI ↔ native connectors, inside the real app | `make e2e DEVICE=emulator-5554` | one emulator or phone, debug build | 1–2 min |
| SMS end to end (helper phone + Basic phone + basic phones) | `make sms-test` | emulator(s), after `make sms-setup` | 1 min |

## 1. SMS lab on two emulators (test it yourself)

The Android emulator no longer delivers SMS from one emulator to another. `scripts/sms-lab.mjs` therefore plays the carrier. It watches each emulator's sent messages and delivers them to the other emulator with `adb emu sms send`, as if these were real SIM numbers:

| Phone | Emulator | Number in the lab | Role |
| :-- | :-- | :-- | :-- |
| Helper phone (the daughter's 4 GB phone) | `emulator-5554` (`medium_phone`) | +256 772 000 001 | Capable mode, SMS helper on, answers |
| Noor's Basic phone (runs Pandastic in Basic mode) | `emulator-5556` (`pandastic_basic`) | +256 772 000 002 | Chat screen, texts the helper |
| Noor's kabambe (no app) | your terminal | +256 772 000 003 | `make sms-phone` |

Steps:

```bash
make run                      # helper phone: builds, installs, starts emulator-5554
make emulator-basic           # Basic phone: second emulator on port 5556 (first time: see below)
make sms-setup                # installs on both, sets modes, numbers, allowlist, turns the SMS helper on
make sms-relay                # keep this running: it is the carrier
```

Then, on the **Basic phone** window, open Pandastic → **Mazungumzo** (Chat) and type an SMS. The reply appears in the chat within about 2 s, or up to 10 s when the language model reads it. The relay terminal shows each SMS as it passes.

No second emulator? Use `make sms-phone`. You become a basic phone in the terminal: type a message, read the reply.

The first time, create the second emulator. It's small and runs Android 15, so it also tests an older Android:

```bash
avdmanager create avd -n pandastic_basic -k "system-images;android-35;google_apis;x86_64" -d small_phone
```

### Messages to try

| SMS | Expect |
| :-- | :-- |
| `P 1 12000` | Coffee farm-gate price, "12,000 is 23% below", ask the cooperative |
| `bei ya kahawa leo? wananipa 12000` | Same, from a sentence |
| `mahindi 900` / `beans price 3000` | Maize/bean retail range; "farm-gate is usually lower" |
| `?` | Menu: how to ask for prices and send symptoms |
| `bei ni ngapi leo?` | "Which crop?" + how to ask |
| `majani ya kahawa yana unga wa njano` | "Not sure from words alone, don't spray yet", possible rust, show a photo or ask an officer |
| `emmwanyi zange zirwadde` (Luganda) | Read by the language model if side-loaded (~8 s), safe reply |
| any SMS from a number that is not in the allowlist | No reply |
| more than 10 SMS from one number in an hour | Silence after the 10th (rate limit; the helper's log says `rate_limited`) |

### Automated SMS suite

`make sms-test` sends 10 SMS from virtual phones and does one round trip from the Basic phone app (if `emulator-5556` runs). It checks each reply:
- the price is in it,
- the safety wording is in it,
- it fits in at most 2 SMS,
- it carries the `Pandastic:` prefix.

It also checks that unknown numbers and echoed replies get no answer. It clears the helper's history first, because of the rate limits; use `--keep-history` to keep it. Last result: **11/11 pass**.

## 2. A real Android phone

The emulator proves the logic. Only a phone shows the real SMS network, speed and memory.

1. On the phone, open Settings → About phone and tap **Build number** 7 times. Then, in Developer options, turn on **USB debugging**. Connect USB and accept the prompt.
2. `make run-device` builds, installs and starts the debug build. `make release` builds a smaller arm64 APK (40 MB) to send by any means.
3. Optional: add the language model with Models → Import, or `adb push` (docs/DEMO.md §2).
4. In the app, choose **Capable phone**. Turn on the SMS helper and add a second phone's number as a contact (docs/DEMO.md §3).
5. From the second phone, text the messages above. Any phone works, a kabambe included. Real SMS cost money on both sides.

All the scripts work on a phone too: `make e2e DEVICE=<serial from adb devices>`. For the SMS suite on a phone, test by hand with a second phone: `adb emu` only exists on emulators.

Worth measuring on the phone:
- Time to the first reply after a cold start (`adb logcat -s PandasticLlm PandasticBrain`).
- Memory with the model loaded: `adb shell dumpsys meminfo org.pandastic.relay`.
- Whether the SMS helper survives a night with the screen off. Battery optimisation can stop it; the app asks to be exempted.

## 3. What is validated, and what is not

Validated on emulators:
- **Bridge:** every bridge call the UI declares (`make e2e`, 29/29), in both phone modes.
- **Photos:** 5/5 held-out RoCoLe phone photos are classified right, through the UI's resize path.
- **SMS:**
  - prices, menu, symptom wording, ask-crop, the LLM path;
  - allowlist, echo loop, 2-part limit, rate-limit logging;
  - Basic phone ↔ helper round trip (`make sms-test`, 11/11).
- **Logic:** 49 JVM unit tests and the NLU eval sets (`ml/reports/nlu_eval*.md`).

Not validated yet:
- **Real carrier SMS:**
  - delivery delays;
  - multipart joining by other phones;
  - Unicode messages, which become 70-character parts;
  - whether Ugandan carriers filter automated replies.
- **Speed and memory on a real 4 GB phone:** the LLM load takes about 30 s on the emulator; a phone is unmeasured.
- **The SMS helper surviving overnight:** Doze and OEM battery killers (Tecno, Infinix, Samsung).
- **Basic phone mode on a 0.5–1 GB phone.**
- **Android below 15 on a real device:** minSdk is 24.
