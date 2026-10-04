# Can a phone-sized model write the reply? (measured 2026-10-04)

**Short answer:** in Swahili, no. In English, Spanish, Indonesian and Vietnamese it writes fluently, but it still
sometimes reverses the meaning. So the model reads every message, and code decides the answer. A model-written
rewrite appears only in the helper's chat, only if `ReplyWriter` finds nothing wrong with it, and always above the
fixed, cited answer. Automatic SMS always get the fixed answer.

## Test

- **Prompt:** the same as `ReplyWriter.java`: "rewrite the FACTS as a short, warm SMS reply in <language>; use only the
  FACTS; keep every number, source and name; say 'not sure / don't spray yet' if the FACTS do".
- **FACTS:** the app's own answers. Three cases per language:
  - rust described in words (not sure, don't spray yet);
  - a buyer's offer 23% below the farm-gate price;
  - a healthy leaf photo.
- **Settings:** greedy decoding, repeat penalty 1.15, llama.cpp b11382, laptop CPU.
- **Models (Q4_K_M):**
  - Qwen3.5-0.8B fine-tuned (ours, 542 MB);
  - Qwen3.5-0.8B base (533 MB);
  - Gemma 3 1B (806 MB);
  - Qwen3.5-2B (1.28 GB).

| Language | Qwen 0.8B (ours / base) | Qwen 2B | Gemma 3 1B |
| :-- | :-- | :-- | :-- |
| Swahili | Non-words ("majahawa", "geuzaji majache kwenakekile") or a copy | Mostly copies; **"Hii ni sawa"** (*this is fair*) for an offer 23% below | Nonsense ("Munjumawisha mambo!") |
| English | Copies, drops the price, or reverses the advice: **"Copper oxychloride is not needed"** | Good; once "keep spraying copper" | **"That's a fair price"** for an offer 23% below |
| Spanish | Fluent, wrong word ("la roja" for roya), "¿Es saludable? Sí" | Fluent; **"no te fumes aún"** (*don't smoke yet*) for "don't spray yet" | — |
| Indonesian | Invents advice ("perlu dicuci", *wash the leaves*) | Good on rust; healthy leaf → **"karat daunnya masih ada"** (*the rust is still there*); adds "Rp" | — |
| Vietnamese | Base: one faithful rewrite, one hallucination | Good on rust; healthy leaf → "đang tốt lắm!" (*doing great*) | — |

Time per answer on the laptop: 0.8B 1–6 s, 2B 4–19 s. A phone is slower.

## What we concluded

- **The languages small models write well are not the niche ones.** Swahili already breaks a 0.8B model. Luganda (our
  "less-supported" example) is worse: the model reads Luganda "emmwanyi" (coffee) as *maize* (SMS lab).
- **A different language or a bigger model does not fix the meaning errors.** "Fair price", "the rust is still there"
  and "copper is not needed" are fluent sentences that use only allowed words. That is why the guardrail is code.
- **What ships:**
  - The model reads every message, and the farmer sees what it understood ("AI ya simu imeelewa: …").
  - It may also reword the answer.
  - `ReplyWriter` rejects a rewrite if it:
    - adds a number, crop, disease, chemical, unit, organisation or "healthy/fair/sawa" judgment;
    - has more negations than the facts;
    - drops a warning, or a price's UGX figure or source;
    - in Swahili, uses a word that is not in the answer.
  - Rewrites appear only in the helper's chat, where a person reads them above the fixed answer. Automatic SMS always
    get the fixed answer. In the SMS lab, one English rewrite passed every check but still turned the buyer's offer into
    "the farmer is asking for a price of 3,000" and dropped "farm-gate is usually lower".
- **Next:** teach our 0.8B the rewrite task itself (a LoRA on fixed answer → rewrite pairs, reviewed by a Swahili
  speaker), and measure it with the same checker on answers it never saw.
