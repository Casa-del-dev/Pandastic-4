# Demo guide and video script

How to run Pandastic for the submission video, with or without SIM cards, and what to say. The numbers below were measured on the Android emulator. Re-measure on the real phone and replace them before recording.

## 1. Install

```sh
make build                      # APK with the React UI, ONNX Runtime and llama.cpp (needs JDK 17, Corepack, NDK r28c)
make run-device                 # or: make run (emulator)
```

Without the NDK, `cd android && ./gradlew -Pnollm assembleDebug` builds the app without the LLM. It still works fully, using keyword understanding only.

## 2. Side-load the language model (optional, 533 MB)

The LLM file is never inside the APK. Download it on a computer that has internet access, then transfer it to the offline phone (for example, over USB). From the repository root, run:

```sh
python3 -m venv ml/.venv
source ml/.venv/bin/activate
python -m pip install --upgrade huggingface_hub
mkdir -p ml/artifacts/llm
hf download unsloth/Qwen3.5-0.8B-GGUF Qwen3.5-0.8B-Q4_K_M.gguf --local-dir ml/artifacts/llm
```

This places the roughly 533 MB file at `ml/artifacts/llm/Qwen3.5-0.8B-Q4_K_M.gguf`. The Hugging Face CLI can resume/skip files already present in its local download directory. Transfer the file to the phone, then select **Capable phone → Models → Import model file** and choose it. Import runs locally and does not need internet. The native runtime checks compatibility when loaded. For a debug build, you can also push the downloaded file with ADB:

```sh
# Qwen3.5-0.8B Q4_K_M from unsloth/Qwen3.5-0.8B-GGUF, sha256 bd258782…c517 (see ml/llm/)
adb push ml/artifacts/llm/Qwen3.5-0.8B-Q4_K_M.gguf /data/local/tmp/
adb shell run-as org.pandastic.relay sh -c 'mkdir -p files/models && cp /data/local/tmp/Qwen3.5-0.8B-Q4_K_M.gguf files/models/'
adb shell rm /data/local/tmp/Qwen3.5-0.8B-Q4_K_M.gguf
```

`run-as` only works on debug builds. For the release APK (`make release`), open the app once (it creates its folder), then `adb push Qwen3.5-0.8B-Q4_K_M.gguf /sdcard/Android/data/org.pandastic.relay/files/models/`. Restart the app afterwards. `adb logcat -s PandasticLlm` shows "System prompt cached" and then about 3–5 s per SMS on the emulator.

## 3. Set up the SMS helper (once, on the daughter's phone)

1. Select **Capable phone**, then open **Settings → Automatic SMS replies**.
2. Add Mama's number, e.g. `+256 7…`. Only numbers on this list get answers.
3. Choose the reply language. On a smaller Android phone, use **Basic phone** mode and save this phone’s number as the SMS destination.
4. Turn the switch on and allow SMS and notifications. Allow "ignore battery optimisation" so Android does not stop the helper.
5. Keep **mobile data off and SMS on**. Airplane mode would also block SMS.

## 4. Scenarios

On the emulator, an incoming SMS is simulated with `adb emu sms send <number> "<text>"`. With two real phones, type the same text on the basic phone.

| # | Noor sends (SMS) | Expected reply (Swahili) | What it shows |
| :- | :-- | :-- | :-- |
| 1 | `P 1 12000` | Coffee Arabica (parchment), farm-gate Aug 2026: UGX 15,500/kg (MAAIF/UCDA). The offer of 12,000 is 23% below. Ask the cooperative before selling. | Independent price reference, cited, computed in code |
| 2 | `majani ya kahawa yana madoa ya njano` | Not sure from words alone, don't spray yet. Show a leaf photo on the home phone, or ask the extension officer. | Text alone is never a diagnosis (fail-safe) |
| 3 | `?` | Menu of short codes | Usable without literacy in long text |
| 4 | `Emmwanyi zange zirina obulwadde ku bikoola` (Luganda) | Same safe reply as #2 | The LLM reads a less-supported language; it does not invent a disease |
| 5 | (from an unknown number or a promo short code) | No reply, nothing stored | Allowlist, airtime protection |

In the app (capable phone, local chat):

| # | Action | Expected |
| :- | :-- | :-- |
| 6 | Chat → + → Camera/Gallery → picture of a rusty coffee leaf → Send | Picture and reply in chat, confidence, advice, cited source and instruction to ask an officer before spraying |
| 7 | Blurry or dark photo | "Piga picha tena" (take the photo again), with the reason |
| 8 | A photo that is not a coffee leaf | Uncertainty and instructions to ask a person |
| 9 | Chat → This phone → `coffee price 12000` | Same decision as SMS #1, with offer and dated market reference |
| 10 | Models → inspect installed/loaded state | Actual inventory without loading weights just to inspect it |

Until T10's trained model replaces the stub, photo answers show the badge "Majaribio: si akili bandia halisi bado" (demo: not the real AI yet). Never present stub output as AI in the video.

## 5. Video script (2–5 min, brief §8)

1. **Problem (one sentence, ~15 s).** "Because of Pandastic, Noor will check a sick coffee leaf or a buyer's price on the same day, by SMS from the slope or by photo at home, which she would otherwise do months late or not at all; we know because one extension worker serves ~1,800 farmers in Uganda (1:500 recommended), and the official coffee farm-gate price moved 25% in 21 months." Sources: [DATA.md §1](DATA.md).
2. **Where it sits in her day (~30 s).** Daytime: the basic phone on the slope, SMS to the daughter's smartphone at the house, answer in seconds. Evening: photo of a leaf on the smartphone. Show `docs/screenshots/`.
3. **Demo (~90 s).** Scenarios 1, 2, 6 and 10 live, with data off and SMS on. Show the notification "SMS helper is on".
4. **AI and why not a simpler tool (~45 s).**
   - Computer vision on the leaf photo, calibrated and tested on another country's data.
   - A small multilingual LLM (Qwen3.5-0.8B, on-device) reads messy SMS in Swahili, English and even Luganda into a fixed form.
     Measured on 50 held-out SMS ([ml/reports/nlu_eval.md](../ml/reports/nlu_eval.md)): keywords alone get 68% fully right, the LLM alone 34%, keywords + LLM filling only what the keywords missed 78% (intent 80% → 96%). That's why the LLM is a helper, not the decider.
   - Plain SMS menus can't read a leaf photo or a misspelled message. A web search needs data, literacy and trust in the source.
5. **Guardrails (~30 s).**
   - Answers come from a fixed list of cited sources, never from the model.
   - Text alone is never a diagnosis. "Not sure — ask a person, don't spray yet."
   - Grain mould → "get it tested".
   - Prices carry source + date, and old prices are flagged.
   - The person sends the message to the officer, not the app.
   - Allowlist + rate limits. Data stays on the phone.
6. **Tech stack (~20 s).**
   - React UI in an Android WebView.
   - ONNX Runtime classifier (MobileNetV4, trained on Modal).
   - llama.cpp + GBNF grammar.
   - SQLite knowledge base (UCDA/MAAIF, WFP, PlantwisePlus).
   - Sizes: app ~40 MB arm64 + optional 533 MB model. Peak RAM < 1 GB on a 4 GB phone.
7. **Limits, honestly (~20 s).**
   - Coffee leaves only for photos today.
   - Swahili text is machine-translated and needs native review.
   - Caller ID is not authentication.
   - No coffee berry disease photos.
   - Prices are national averages, not the Ondera market.
8. **Your take (~20 s).** What localizing AI development means to us (team to write).

## 6. Fallbacks during recording

- No second SIM: use the emulator and `adb emu sms send`. The reply appears in the emulator's Messages app and in the helper's thread.
- Missing LLM or slow phone: the helper still answers with keyword understanding within the time budget (20 s for the model, then keywords).
- If an answer fails for any reason, the safe reply "Sina uhakika - uliza mtu… Usinyunyizie dawa bado." is still sent.
