# LLM: stop generation after the symptom (O4), `Qwen3.5-0.8B-pandastic-Q4_K_M.gguf`

LlmNlu reads only `intent`, `crop` and `symptom` from the model (`lang` comes before them, `commodity` and
`offer` after). The app cuts the grammar's root rule after the symptom, at the `,"` the model writes there
anyway (`LlmNlu.stopAfterSymptom`), and closes the JSON in Java (`LlmNlu.closeJson`): `commodity` and `offer` are
never generated, and every token before the cut is the one the full grammar gives (greedy decoding).

Measured with `ml/llm/stop_eval.py`: every SMS of the four eval sets (synthetic, team-written), full and cut
grammar back to back per SMS, llama.cpp, temperature 0, 4 CPU threads on a laptop, same prompt as
`eval_llm.py`. Token counts are exact; times are noisy (the laptop was also building or running the emulator).

| Set | SMS | same lang, intent, crop, symptom | tokens per SMS (median, full → cut) | generation time (total, full → cut) |
| :-- | --: | --: | :-- | :-- |
| dev | 100 | 100 | 31 → 21 | 234.3 s → 152.8 s |
| heldout | 50 | 50 | 31.5 → 20 | 106.6 s → 72.1 s |
| fresh | 40 | 40 | 33 → 20 | 71.6 s → 48.0 s |
| fresh2 | 30 | 30 | 30 → 20 | 48.6 s → 33.6 s |

**All sets: 220/220 SMS read the same; generated tokens 7019 → 4568 (−35%); generation time 461 s → 306 s (−34%).**
The prompt (system prompt cached, then the SMS) is evaluated as before, so a whole call saves less than the
generation share.
