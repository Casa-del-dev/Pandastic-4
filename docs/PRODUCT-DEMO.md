# Product demo (under 60 s)

This is the product film; B's technical walkthrough is separate. Each frame has one punchline and one phone, all real
app footage.

- **Type:** Clash Display for headlines, Satoshi for supporting lines.
- **Look:** white, Apple-simple: near-black type, Pandastic green as the only accent, real phones with soft shadows.
- **Voice:** ElevenLabs "Tom", British (`EvXuVNqs50Ub7YdFSesj`). Run `python3 scripts/product-demo/voice.py`.
- **Music:** generated with ElevenLabs Music for this film (`product-demo/music.mp3`).
- **Cut:** `python3 scripts/product-demo/cut.py` writes `product-demo/pandastic-product-demo.mp4`. Output and footage
  stay in `product-demo/` (gitignored).

| # | On screen | Voice-over |
| :-- | :-- | :-- |
| 1 | **1 officer.** → **1,800 farmers.** | In Uganda, one extension officer serves eighteen hundred farmers. |
| 2 | **Noor waits months.** → panda + **Pandastic** | Noor waits months for an answer. Pandastic puts one in her house. |
| 3 | Two real phones. Noor's Swahili SMS flies to the house; the phone reads it; the reply flies back. **In her words. In seconds.** | From the slope, she texts in Swahili, in her own words. The phone at home reads it and texts back in seconds: don't spray yet, send a photo tonight. |
| 4 | Leaf photo + the chat's own words. **Just ask.** | In the evening, she just asks. Like a neighbour who knows coffee. |
| 5 | A leaf it can't call. **It knows when it doesn't know.** | And when it can't tell, it says so, and points her to a person. |
| 6 | The buyer's offer against the official price. **Sell with proof.** | Before the buyer's truck leaves, she knows if his price is fair. |
| 7 | Her text to her daughter, no reply. **Family stays family.** | Her texts to her daughter? It stays silent. |
| 8 | Both phones. **No servers. No data bundle.** | No servers, no data bundle. Just the phones they already have. |
| 9 | Panda. **Pandastic.** *Small AI, where the farm is.* | Pandastic. Small AI, where the farm is. |

Not in this film, because B's technical walkthrough (`video/`) covers them: the photo checks, the classifier
scores, accuracy numbers and model sizes. The price check is shared core functionality, so it's shown here as the
helper chat's price card, with different wording.

**Sources:**
- 1 officer per ~1,800 farmers: UFAAS 2023 (`docs/DATA.md` §1).
- Every screen is the real app on the emulators (`product-demo/raw/`, `docs/screenshots/demo/`).
