# SMS understanding: KeywordNlu vs Qwen3.5-0.8B (GBNF)

Synthetic SMS written by the team (labelled synthetic). `dev` was used to tune the keyword lexicon;
`heldout` was written before any results and never used for tuning; `fresh` was written after the LoRA was
trained, in phrasings unlike its templates (first keyword score 68%; its errors were then used to fix
KeywordNlu); `fresh2` was written before those fixes and never used to make them (keywords 80% before, the
row below after). `fresh2` is the honest test. Qwen: Q4_K_M via llama.cpp,
temperature 0, thinking off, 8 CPU threads on a laptop (a phone is slower).

| Set | Model | n | lang | intent | crop | symptom | commodity | offer | all slots | same reply |
| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| dev | keyword | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | qwen | 100 | 98% | 99% | 96% | 92% | 99% | 100% | 86% | 86% |
| dev | hybrid_intent | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | hybrid_intent_crop | 100 | 100% | 100% | 96% | 100% | 99% | 100% | 96% | 96% |
| dev | llm_first | 100 | 100% | 99% | 96% | 100% | 99% | 100% | 95% | 95% |
| dev | hybrid_fill | 100 | 100% | 100% | 96% | 99% | 99% | 100% | 95% | 95% |
| heldout | keyword | 50 | 100% | 84% | 96% | 86% | 96% | 100% | 72% | 76% |
| heldout | qwen | 50 | 100% | 98% | 100% | 96% | 100% | 100% | 94% | 96% |
| heldout | hybrid_intent | 50 | 100% | 98% | 96% | 86% | 96% | 100% | 80% | 82% |
| heldout | hybrid_intent_crop | 50 | 100% | 98% | 100% | 86% | 100% | 100% | 84% | 86% |
| heldout | llm_first | 50 | 100% | 98% | 100% | 86% | 100% | 100% | 84% | 86% |
| heldout | hybrid_fill | 50 | 100% | 98% | 100% | 100% | 100% | 100% | 98% | 100% |
| fresh | keyword | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | qwen | 40 | 100% | 92% | 92% | 88% | 95% | 100% | 78% | 82% |
| fresh | hybrid_intent | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | hybrid_intent_crop | 40 | 100% | 100% | 92% | 88% | 98% | 100% | 80% | 80% |
| fresh | llm_first | 40 | 100% | 92% | 92% | 88% | 95% | 100% | 72% | 78% |
| fresh | hybrid_fill | 40 | 100% | 100% | 92% | 90% | 98% | 100% | 88% | 88% |
| fresh2 | keyword | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 83% | 83% |
| fresh2 | qwen | 30 | 100% | 97% | 100% | 93% | 100% | 100% | 90% | 90% |
| fresh2 | hybrid_intent | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 80% | 80% |
| fresh2 | hybrid_intent_crop | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 80% | 80% |
| fresh2 | llm_first | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 80% | 80% |
| fresh2 | hybrid_fill | 30 | 97% | 97% | 100% | 100% | 100% | 100% | 93% | 93% |

`same reply` treats `help` and `other` as one intent, because the app answers both with the same menu;
it is the share of SMS that get exactly the reply the gold slots would give.

Keyword slots always win in the hybrids. `hybrid_intent`: the LLM only supplies the intent when no intent
keyword matched (KeywordNlu intentProb 0). `hybrid_intent_crop`: also the crop when none was found (LlmNlu
as of 01:00 UTC); it names coffee/maize for crops we don't support (cassava, tomato, tea), which keywords
correctly leave empty. `hybrid_fill` also lets it fill symptom and offer: the base model invents symptoms.
`llm_first` = the LLM's intent and crop win whenever it gives them; lang, symptom and offer stay with the keywords.

Model: `Qwen3.5-0.8B-pandastic-Q4_K_M.gguf`.
Near-copies of LoRA training SMS (token Jaccard >= 0.6 with one of the 3,000 synthetic SMS): dev 51/100, heldout 24/50, fresh 3/40, fresh2 7/30. A fine-tuned model's dev/heldout scores are optimistic by that much; `fresh` is the honest one.

| Set | median latency (s) | max (s) | prompt ms (median) | generation ms (median) |
| :-- | --: | --: | --: | --: |
| dev | 2.17 | 6.14 | 399 | 1733 |
| heldout | 1.67 | 2.81 | 314 | 1320 |
| fresh | 1.46 | 1.76 | 308 | 1141 |
| fresh2 | 1.9 | 2.93 | 385 | 1500 |

## Misses: dev / qwen

- 4 `unga wa machungwa kwenye majani` crop: want `` got `coffee`
- 19 `viwavijeshi wanakula mahindi` symptom: want `fall_armyworm` got ``
- 20 `funza kwenye mahindi` intent: want `diagnose` got `planting`
- 20 `funza kwenye mahindi` symptom: want `fall_armyworm` got ``
- 21 `viwavi wamekula majani ya mahindi` symptom: want `fall_armyworm` got ``
- 25 `armyworms everywhere` crop: want `` got `maize`
- 41 `2 viwavi` symptom: want `fall_armyworm` got ``
- 45 `P 1 12k` lang: want `sw` got `en`
- 75 `?` lang: want `sw` got `en`
- 86 `mahind yana viwavi` symptom: want `fall_armyworm` got ``
- 95 `corn leaves have holes` symptom: want `fall_armyworm` got `leaf_spot`
- 96 `majani ya mahindi yana matundu` symptom: want `fall_armyworm` got ``
- 97 `coffee berries black` symptom: want `` got `phoma`
- 99 `bei ya chai` crop: want `` got `coffee`
- 99 `bei ya chai` commodity: want `` got `coffee_arabica_parchment`
- 100 `cassava leaves yellow` crop: want `` got `maize`

## Misses: heldout / keyword

- h3 `majani ya buni yana vumbi la njano` symptom: want `rust` got ``
- h6 `mdudu anatoboa ndani ya jani la kahawa` symptom: want `miner` got ``
- h9 `round brown spots coffee leaf` symptom: want `cercospora` got ``
- h10 `ncha za matawi ya kahawa zimekauka baada ya baridi` symptom: want `phoma` got ``
- h13 `caterpilars eating maize` intent: want `diagnose` got `other`
- h13 `caterpilars eating maize` symptom: want `fall_armyworm` got ``
- h16 `maize leaves striped yellow` symptom: want `streak_virus` got ``
- h17 `majani ya mahindi yana madoa marefu ya kijivu` symptom: want `leaf_blight` got ``
- h19 `mimea ya maharage inanyauka` intent: want `diagnose` got `other`
- h22 `mahindi yamegeuka rangi` intent: want `diagnose` got `other`
- h26 `anatoa 13k kwa kilo` intent: want `price` got `other`
- h28 `p1 13000` intent: want `price` got `other`
- h28 `p1 13000` crop: want `coffee` got ``
- h28 `p1 13000` commodity: want `coffee_arabica_parchment` got ``
- h29 `P2 1000` intent: want `price` got `other`
- h29 `P2 1000` crop: want `maize` got ``
- h29 `P2 1000` commodity: want `maize_grain` got ``
- h44 `nisaidie` intent: want `help` got `other`
- h45 `salaam` intent: want `help` got `other`

## Misses: heldout / qwen

- h12 `nimeona funza ndani ya mahindi` symptom: want `fall_armyworm` got `streak_virus`
- h14 `the maize has small worms in the middle` symptom: want `fall_armyworm` got `leaf_blight`
- h44 `nisaidie` intent: want `help` got `other`

## Misses: fresh / keyword

- f4 `coffee leaf got brown circles with grey middle like an eye` symptom: want `cercospora` got ``
- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got ``
- f8 `corn leaves have long cigar shaped grey brown lesions` symptom: want `leaf_blight` got ``
- f9 `maharagwe yangu majani yana vidoa vya kahawia vyenye kona kona` symptom: want `angular_leaf_spot` got ``
- f15 `buni zinakauka kuanzia juu ya matawi baada ya baridi kali` symptom: want `phoma` got ``

## Misses: fresh / qwen

- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got `streak_virus`
- f6 `worms inside the maize funnel and the leaves have ragged holes` symptom: want `fall_armyworm` got `streak_virus`
- f11 `Shamba la mahindi limeharibika sana mwaka huu sijui ni nini` symptom: want `` got `lethal_necrosis`
- f13 `mihogo yangu ina majani yaliyojikunja` crop: want `` got `maize`
- f13 `mihogo yangu ina majani yaliyojikunja` symptom: want `` got `leaf_blight`
- f14 `tomato leaves have black spots` crop: want `` got `maize`
- f14 `tomato leaves have black spots` symptom: want `` got `leaf_blight`
- f30 `bei ya chai leo` crop: want `` got `coffee`
- f30 `bei ya chai leo` commodity: want `` got `coffee_arabica_parchment`
- f33 `nataka kuotesha miche ya kahawa mwezi ujao` intent: want `planting` got `price`
- f33 `nataka kuotesha miche ya kahawa mwezi ujao` commodity: want `` got `coffee_arabica_parchment`
- f36 `how does this work` intent: want `help` got `other`
- f38 `asante kwa ushauri wako` intent: want `other` got `help`

## Misses: fresh2 / keyword

- g3 `maharage yangu yana vipele vya kahawia chini ya jani` symptom: want `rust` got ``
- g10 `coffee leaves have grey spots with brown ring` symptom: want `cercospora` got ``
- g11 `mahindi yana madoa ya kijivu marefu kama sigara` symptom: want `leaf_blight` got ``
- g12 `Wadudu wanachimba ndani ya majani ya kahawa` symptom: want `miner` got ``
- g28 `good morning` lang: want `en` got `sw`
- g28 `good morning` intent: want `help` got `other`

## Misses: fresh2 / qwen

- g4 `there are caterpillars in my maize, the leaves have holes` symptom: want `fall_armyworm` got `leaf_blight`
- g5 `funza wamevamia mahindi yote shambani` symptom: want `fall_armyworm` got ``
- g30 `the rain was heavy yesterday` intent: want `other` got `diagnose`
