# LLM: stop generation after the symptom (O4), `Qwen3.5-0.8B-Q4_K_M.gguf`

LlmNlu reads only `intent`, `crop` and `symptom` from the model (`lang` comes before them, `commodity` and
`offer` after). The app cuts the grammar's root rule after the symptom, at the `,"` the model writes there
anyway (`LlmNlu.stopAfterSymptom`), and closes the JSON in Java (`LlmNlu.closeJson`): `commodity` and `offer` are
never generated, and every token before the cut is the one the full grammar gives (greedy decoding).

Measured with `ml/llm/stop_eval.py`: every SMS of the four eval sets (synthetic, team-written), full and cut
grammar back to back per SMS, llama.cpp, temperature 0, 4 CPU threads on a laptop, same prompt as
`eval_llm.py`. Token counts are exact; times are noisy (the laptop was also building or running the emulator).

| Set | SMS | same lang, intent, crop, symptom | tokens per SMS (median, full → cut) | generation time (total, full → cut) |
| :-- | --: | --: | :-- | :-- |
| dev | 100 | 100 | 32 → 21 | 282.9 s → 119.9 s |
| heldout | 50 | 50 | 32 → 21 | 83.4 s → 57.3 s |
| fresh | 40 | 40 | 32 → 21.5 | 47.2 s → 33.0 s |
| fresh2 | 30 | 30 | 32 → 22.5 | 33.6 s → 24.6 s |

**All sets: 220/220 SMS read the same; generated tokens 7115 → 4745 (−33%); generation time 447 s → 235 s (−47%).**
The prompt (system prompt cached, then the SMS) is evaluated as before, so a whole call saves less than the
generation share.
