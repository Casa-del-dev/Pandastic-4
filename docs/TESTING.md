# Testing

## Commands

```bash
./run.sh                 # both emulator phones + the SMS carrier (keep it running)
make sms-test            # SMS end to end: prices, symptoms, personal messages, allowlist, LLM (17 checks)
make e2e DEVICE=emulator-5554   # every UI <-> native call inside the real app (35 checks)
make human-test          # reset both phones for a human tester (docs/HUMAN-TEST.md)
cd android && ./gradlew testDebugUnitTest   # logic: resolver, keywords, SMS policy (68 tests)
```

`./run.sh` starts two phones:
- the helper phone `emulator-5554`, +256 772 000 001;
- Noor's phone `emulator-5556`, +256 772 000 002.

The emulator can't pass SMS from one emulator to another, so `scripts/sms-lab.mjs` acts as the carrier. Anything one phone sends, including from the normal Messages app, arrives on the other. `make sms-phone` adds a third, keyboard-only phone in the terminal.

## On a real phone

1. On the phone, open Developer options (tap Build number 7 times) and turn on USB debugging. Connect the cable, then run `make run-device`.
2. Choose **Capable phone**. Download the language model in **Models**, about 540 MB over mobile data. Turn on automatic SMS replies and pick a contact.
3. From any other phone, text it `P 1 12000`. Then try a personal message, which should get no reply.

## Validated / not yet

**Validated on emulators:**
- **SMS replies:** prices, menu, symptom wording, ask-crop, Luganda via the model. Personal messages get no reply. The allowlist, echo-loop guard and 2-part limit hold.
- **Messages app:** Noor's texts from the stock SMS app get answered in the same thread.
- **Photos:** the test photos are answered as in docs/HUMAN-TEST.md.
- **Model download:** 542 MB downloaded, checksum-verified and loaded.

**Not yet:**
- Real carrier SMS: delays, and filtering by Ugandan networks.
- Speed and memory on a real 4 GB phone.
- The helper surviving a night with the screen off.
- A native speaker's review of the Swahili text.
