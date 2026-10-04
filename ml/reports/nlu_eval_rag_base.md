# SMS understanding: KeywordNlu vs Qwen3.5-0.8B (GBNF)

Synthetic SMS written by the team (labelled synthetic). `dev` was used to tune the keyword lexicon;
`heldout` was written before any results and never used for tuning; `fresh` was written after the LoRA was
trained, in phrasings unlike its templates (first keyword score 68%; its errors were then used to fix
KeywordNlu); `fresh2` was written before those fixes and never used to make them (keywords 80% before, the
row below after). `fresh2` is the honest test. Qwen: Q4_K_M via llama.cpp,
temperature 0, thinking off, 4 CPU threads on a laptop (a phone is slower).

| Set | Model | n | lang | intent | crop | symptom | commodity | offer | all slots | same reply |
| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| dev | keyword | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | qwen | 100 | 94% | 92% | 93% | 89% | 95% | 99% | 75% | 75% |
| dev | hybrid_intent | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | hybrid_intent_crop | 100 | 100% | 100% | 95% | 100% | 99% | 100% | 95% | 95% |
| dev | hybrid_intent_symptom | 100 | 100% | 100% | 100% | 98% | 100% | 100% | 98% | 98% |
| dev | hybrid_no_offer | 100 | 100% | 100% | 95% | 99% | 99% | 100% | 94% | 94% |
| dev | llm_first | 100 | 100% | 92% | 94% | 100% | 96% | 100% | 88% | 88% |
| dev | hybrid_fill | 100 | 100% | 100% | 95% | 99% | 99% | 100% | 94% | 94% |
| heldout | keyword | 50 | 100% | 84% | 96% | 86% | 96% | 100% | 72% | 76% |
| heldout | qwen | 50 | 96% | 100% | 96% | 98% | 94% | 98% | 84% | 84% |
| heldout | hybrid_intent | 50 | 100% | 100% | 96% | 86% | 96% | 100% | 82% | 82% |
| heldout | hybrid_intent_crop | 50 | 100% | 100% | 98% | 86% | 98% | 100% | 84% | 84% |
| heldout | hybrid_intent_symptom | 50 | 100% | 100% | 96% | 100% | 96% | 100% | 96% | 96% |
| heldout | hybrid_no_offer | 50 | 100% | 100% | 98% | 100% | 98% | 100% | 98% | 98% |
| heldout | llm_first | 50 | 100% | 100% | 96% | 86% | 98% | 100% | 84% | 84% |
| heldout | hybrid_fill | 50 | 100% | 100% | 98% | 100% | 98% | 100% | 98% | 98% |
| fresh | keyword | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | qwen | 40 | 100% | 80% | 90% | 78% | 85% | 88% | 50% | 50% |
| fresh | hybrid_intent | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | hybrid_intent_crop | 40 | 100% | 100% | 90% | 88% | 98% | 100% | 78% | 78% |
| fresh | hybrid_intent_symptom | 40 | 100% | 100% | 100% | 85% | 100% | 100% | 85% | 85% |
| fresh | hybrid_no_offer | 40 | 100% | 100% | 90% | 88% | 98% | 100% | 80% | 80% |
| fresh | llm_first | 40 | 100% | 80% | 90% | 88% | 85% | 100% | 57% | 57% |
| fresh | hybrid_fill | 40 | 100% | 100% | 90% | 88% | 98% | 100% | 80% | 80% |
| fresh2 | keyword | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 83% | 83% |
| fresh2 | qwen | 30 | 100% | 93% | 93% | 87% | 97% | 97% | 67% | 70% |
| fresh2 | hybrid_intent | 30 | 97% | 100% | 100% | 87% | 100% | 100% | 83% | 83% |
| fresh2 | hybrid_intent_crop | 30 | 97% | 100% | 93% | 87% | 100% | 100% | 77% | 77% |
| fresh2 | hybrid_intent_symptom | 30 | 97% | 100% | 100% | 97% | 100% | 100% | 93% | 93% |
| fresh2 | hybrid_no_offer | 30 | 97% | 100% | 93% | 97% | 100% | 100% | 87% | 87% |
| fresh2 | llm_first | 30 | 97% | 93% | 93% | 87% | 100% | 100% | 70% | 73% |
| fresh2 | hybrid_fill | 30 | 97% | 100% | 93% | 97% | 100% | 100% | 87% | 87% |

`same reply` treats `help` and `other` as one intent, because the app answers both with the same menu;
it is the share of SMS that get exactly the reply the gold slots would give.

Keyword slots always win in the hybrids. `hybrid_intent`: the LLM only supplies the intent when no intent
keyword matched (KeywordNlu intentProb 0). `hybrid_intent_crop`: also the crop when none was found (LlmNlu
as of 01:00 UTC); it names coffee/maize for crops we don't support (cassava, tomato, tea), which keywords
correctly leave empty. `hybrid_intent_symptom`: intent + a missing symptom (it must fit the crop);
`hybrid_no_offer`: intent + crop + symptom; `hybrid_fill`: every empty slot, offer too. The base model
invents symptoms; the fine-tune much less.
`llm_first` = the LLM's intent and crop win whenever it gives them; lang, symptom and offer stay with the keywords.

Model: `ml\reports\rag_base`.
Near-copies of LoRA training SMS (token Jaccard >= 0.6 with one of the 3,000 synthetic SMS): dev 51/100, heldout 24/50, fresh 3/40, fresh2 7/30. A fine-tuned model's dev/heldout scores are optimistic by that much; `fresh` is the honest one.

| Set | median latency (s) | max (s) | prompt ms (median) | generation ms (median) |
| :-- | --: | --: | --: | --: |
| dev | None | None | None | None |
| heldout | None | None | None | None |
| fresh | None | None | None | None |
| fresh2 | None | None | None | None |

## Misses: dev / qwen

- 4 `unga wa machungwa kwenye majani` crop: want `` got `coffee`
- 7 `my coffee has rust what to spray` intent: want `diagnose` got `help`
- 7 `my coffee has rust what to spray` symptom: want `rust` got ``
- 20 `funza kwenye mahindi` symptom: want `fall_armyworm` got ``
- 21 `viwavi wamekula majani ya mahindi` symptom: want `fall_armyworm` got `leaf_blight`
- 25 `armyworms everywhere` lang: want `en` got `sw`
- 25 `armyworms everywhere` crop: want `` got `maize`
- 33 `mahindi yanakauka na kufa` symptom: want `` got `lethal_necrosis`
- 39 `leaves look weird today should I spray` intent: want `diagnose` got `help`
- 39 `leaves look weird today should I spray` crop: want `` got `bean`
- 41 `2 viwavi` lang: want `sw` got `en`
- 41 `2 viwavi` symptom: want `fall_armyworm` got ``
- 42 `3 kutu` crop: want `bean` got `coffee`
- 44 `P 1 12000` crop: want `coffee` got ``
- 44 `P 1 12000` commodity: want `coffee_arabica_parchment` got ``
- 54 `bei ya FAQ leo` intent: want `price` got `diagnose`
- 54 `bei ya FAQ leo` commodity: want `coffee_robusta_faq` got ``
- 60 `The buyer offers 12000 for my parchment. Is that fair?` lang: want `en` got `sw`
- 60 `The buyer offers 12000 for my parchment. Is that fair?` intent: want `price` got `help`
- 60 `The buyer offers 12000 for my parchment. Is that fair?` commodity: want `coffee_arabica_parchment` got ``
- 60 `The buyer offers 12000 for my parchment. Is that fair?` offer: want `12000` got ``
- 65 `bei ya coffee 15000` lang: want `sw` got `en`
- 67 `bei gani` intent: want `price` got `help`
- 79 `menu` lang: want `en` got `sw`
- 86 `mahind yana viwavi` symptom: want `fall_armyworm` got ``
- 88 `bei ya kahwa` intent: want `price` got `help`
- 88 `bei ya kahwa` commodity: want `coffee_arabica_parchment` got ``
- 90 `kahawa ya arabica bei` intent: want `price` got `diagnose`
- 90 `kahawa ya arabica bei` commodity: want `coffee_arabica_parchment` got ``
- 91 `robusta price kiboko 5500` lang: want `en` got `sw`
- 95 `corn leaves have holes` symptom: want `fall_armyworm` got `leaf_blight`
- 96 `majani ya mahindi yana matundu` symptom: want `fall_armyworm` got ``
- 97 `coffee berries black` symptom: want `` got `leaf_blight`
- 98 `kahawa matunda meusi` symptom: want `` got `lethal_necrosis`
- 99 `bei ya chai` intent: want `price` got `diagnose`
- 99 `bei ya chai` crop: want `` got `coffee`
- 100 `cassava leaves yellow` crop: want `` got `coffee`
- 100 `cassava leaves yellow` symptom: want `` got `streak_virus`

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

- h3 `majani ya buni yana vumbi la njano` crop: want `coffee` got `maize`
- h12 `nimeona funza ndani ya mahindi` symptom: want `fall_armyworm` got `leaf_blight`
- h25 `mtu anataka kununua kahawa yangu kwa 11500` commodity: want `coffee_arabica_parchment` got `coffee_robusta_kiboko`
- h27 `P 1 14500` lang: want `sw` got `en`
- h31 `FAQ inauzwa shilingi ngapi` commodity: want `coffee_robusta_faq` got `coffee_arabica_parchment`
- h34 `what is the price of parchment now` lang: want `en` got `sw`
- h36 `is 900 a good price for maize` offer: want `900` got ``
- h49 `bei ya ndizi` crop: want `` got `coffee`
- h49 `bei ya ndizi` commodity: want `` got `coffee_arabica_parchment`

## Misses: fresh / keyword

- f4 `coffee leaf got brown circles with grey middle like an eye` symptom: want `cercospora` got ``
- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got ``
- f8 `corn leaves have long cigar shaped grey brown lesions` symptom: want `leaf_blight` got ``
- f9 `maharagwe yangu majani yana vidoa vya kahawia vyenye kona kona` symptom: want `angular_leaf_spot` got ``
- f15 `buni zinakauka kuanzia juu ya matawi baada ya baridi kali` symptom: want `phoma` got ``

## Misses: fresh / qwen

- f1 `Habari, naomba ushauri. Kahawa yangu majani yamejaa unga wa rangi ya machungwa upande wa chini` symptom: want `rust` got `miner`
- f2 `hello sir my coffee trees leaves have orange dust underneath what can i spray` intent: want `diagnose` got `help`
- f2 `hello sir my coffee trees leaves have orange dust underneath what can i spray` symptom: want `rust` got ``
- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got `leaf_blight`
- f7 `mahindi machanga yana michirizi myembamba ya njano kwa urefu wa jani` symptom: want `streak_virus` got `lethal_necrosis`
- f9 `maharagwe yangu majani yana vidoa vya kahawia vyenye kona kona` symptom: want `angular_leaf_spot` got `cercospora`
- f11 `Shamba la mahindi limeharibika sana mwaka huu sijui ni nini` symptom: want `` got `lethal_necrosis`
- f13 `mihogo yangu ina majani yaliyojikunja` crop: want `` got `coffee`
- f13 `mihogo yangu ina majani yaliyojikunja` symptom: want `` got `leaf_blight`
- f14 `tomato leaves have black spots` crop: want `` got `maize`
- f14 `tomato leaves have black spots` symptom: want `` got `leaf_blight`
- f15 `buni zinakauka kuanzia juu ya matawi baada ya baridi kali` symptom: want `phoma` got `lethal_necrosis`
- f19 `a buyer came offering UGX 11000 a kilo for my arabica, should i sell` intent: want `price` got `diagnose`
- f19 `a buyer came offering UGX 11000 a kilo for my arabica, should i sell` commodity: want `coffee_arabica_parchment` got ``
- f19 `a buyer came offering UGX 11000 a kilo for my arabica, should i sell` offer: want `11000` got ``
- f21 `mahindi wananunua 850 kwa kilo` intent: want `price` got `diagnose`
- f21 `mahindi wananunua 850 kwa kilo` commodity: want `maize_grain` got ``
- f21 `mahindi wananunua 850 kwa kilo` offer: want `850` got ``
- f22 `maize going for 1,050 per kg at the market is that low` intent: want `price` got `diagnose`
- f22 `maize going for 1,050 per kg at the market is that low` commodity: want `maize_grain` got ``
- f22 `maize going for 1,050 per kg at the market is that low` offer: want `1050` got ``
- f23 `maharage elfu tatu na mia tano kwa kilo ni bei nzuri?` offer: want `3500` got `3000`
- f24 `how much are beans selling for in Mbale` intent: want `price` got `help`
- f24 `how much are beans selling for in Mbale` commodity: want `beans_dry` got ``
- f25 `nimepewa elfu kumi na nne kwa kilo ya kahawa` offer: want `14000` got `15000`
- f28 `Sokoni bei ya mahindi imeshuka?` intent: want `price` got `help`
- f28 `Sokoni bei ya mahindi imeshuka?` commodity: want `maize_grain` got ``
- f30 `bei ya chai leo` crop: want `` got `coffee`
- f30 `bei ya chai leo` commodity: want `` got `coffee_arabica_parchment`
- f31 `Ni wakati gani mzuri wa kupanda maharage msimu huu wa mvua?` intent: want `planting` got `diagnose`
- f33 `nataka kuotesha miche ya kahawa mwezi ujao` intent: want `planting` got `diagnose`
- f36 `how does this work` crop: want `` got `maize`

## Misses: fresh2 / keyword

- g3 `maharage yangu yana vipele vya kahawia chini ya jani` symptom: want `rust` got ``
- g10 `coffee leaves have grey spots with brown ring` symptom: want `cercospora` got ``
- g11 `mahindi yana madoa ya kijivu marefu kama sigara` symptom: want `leaf_blight` got ``
- g12 `Wadudu wanachimba ndani ya majani ya kahawa` symptom: want `miner` got ``
- g28 `good morning` lang: want `en` got `sw`
- g28 `good morning` intent: want `help` got `other`

## Misses: fresh2 / qwen

- g2 `pls help my arabica has yellow orange spots under leaves` symptom: want `rust` got `leaf_spot`
- g3 `maharage yangu yana vipele vya kahawia chini ya jani` symptom: want `rust` got `leaf_blight`
- g5 `funza wamevamia mahindi yote shambani` symptom: want `fall_armyworm` got `lethal_necrosis`
- g7 `kahawa yangu ina tatizo, majani yanakauka` symptom: want `` got `lethal_necrosis`
- g9 `ndizi zangu zina ugonjwa` crop: want `` got `coffee`
- g13 `bei ya kahawa kiboko leo sokoni ni ngapi` commodity: want `coffee_robusta_kiboko` got `coffee_arabica_parchment`
- g17 `nimeambiwa bei ya maharage ni elfu nne` offer: want `4000` got ``
- g22 `bei ya mihogo` intent: want `price` got `help`
- g27 `msaada tafadhali` intent: want `help` got `other`
- g30 `the rain was heavy yesterday` crop: want `` got `maize`
