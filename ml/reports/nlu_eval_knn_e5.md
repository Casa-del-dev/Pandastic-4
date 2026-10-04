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
| dev | qwen | 100 | 98% | 100% | 92% | 83% | 96% | 89% | 64% | 64% |
| dev | hybrid_intent | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | hybrid_intent_crop | 100 | 100% | 100% | 95% | 100% | 99% | 100% | 95% | 95% |
| dev | hybrid_intent_symptom | 100 | 100% | 100% | 100% | 97% | 100% | 100% | 97% | 97% |
| dev | hybrid_no_offer | 100 | 100% | 100% | 95% | 97% | 99% | 100% | 93% | 93% |
| dev | llm_first | 100 | 100% | 100% | 94% | 100% | 99% | 100% | 94% | 94% |
| dev | hybrid_fill | 100 | 100% | 100% | 95% | 97% | 99% | 100% | 93% | 93% |
| heldout | keyword | 50 | 100% | 84% | 96% | 86% | 96% | 100% | 72% | 76% |
| heldout | qwen | 50 | 98% | 100% | 98% | 92% | 96% | 90% | 78% | 78% |
| heldout | hybrid_intent | 50 | 100% | 100% | 96% | 86% | 96% | 100% | 82% | 82% |
| heldout | hybrid_intent_crop | 50 | 100% | 100% | 98% | 86% | 98% | 100% | 84% | 84% |
| heldout | hybrid_intent_symptom | 50 | 100% | 100% | 96% | 98% | 96% | 100% | 94% | 94% |
| heldout | hybrid_no_offer | 50 | 100% | 100% | 98% | 98% | 98% | 100% | 96% | 96% |
| heldout | llm_first | 50 | 100% | 100% | 98% | 86% | 98% | 100% | 84% | 84% |
| heldout | hybrid_fill | 50 | 100% | 100% | 98% | 98% | 98% | 100% | 96% | 96% |
| fresh | keyword | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | qwen | 40 | 100% | 98% | 90% | 82% | 95% | 80% | 60% | 60% |
| fresh | hybrid_intent | 40 | 100% | 100% | 100% | 88% | 100% | 100% | 88% | 88% |
| fresh | hybrid_intent_crop | 40 | 100% | 100% | 92% | 88% | 98% | 100% | 80% | 80% |
| fresh | hybrid_intent_symptom | 40 | 100% | 100% | 100% | 85% | 100% | 100% | 85% | 85% |
| fresh | hybrid_no_offer | 40 | 100% | 100% | 92% | 85% | 98% | 100% | 82% | 82% |
| fresh | llm_first | 40 | 100% | 98% | 90% | 88% | 95% | 100% | 75% | 75% |
| fresh | hybrid_fill | 40 | 100% | 100% | 92% | 85% | 98% | 98% | 80% | 80% |
| fresh2 | keyword | 30 | 97% | 97% | 100% | 87% | 100% | 100% | 83% | 83% |
| fresh2 | qwen | 30 | 97% | 100% | 97% | 90% | 97% | 90% | 70% | 70% |
| fresh2 | hybrid_intent | 30 | 97% | 100% | 100% | 87% | 100% | 100% | 83% | 83% |
| fresh2 | hybrid_intent_crop | 30 | 97% | 100% | 97% | 87% | 100% | 100% | 80% | 80% |
| fresh2 | hybrid_intent_symptom | 30 | 97% | 100% | 100% | 100% | 100% | 100% | 97% | 97% |
| fresh2 | hybrid_no_offer | 30 | 97% | 100% | 97% | 100% | 100% | 100% | 93% | 93% |
| fresh2 | llm_first | 30 | 97% | 100% | 97% | 87% | 100% | 100% | 80% | 80% |
| fresh2 | hybrid_fill | 30 | 97% | 100% | 97% | 100% | 100% | 100% | 93% | 93% |

`same reply` treats `help` and `other` as one intent, because the app answers both with the same menu;
it is the share of SMS that get exactly the reply the gold slots would give.

Keyword slots always win in the hybrids. `hybrid_intent`: the LLM only supplies the intent when no intent
keyword matched (KeywordNlu intentProb 0). `hybrid_intent_crop`: also the crop when none was found (LlmNlu
as of 01:00 UTC); it names coffee/maize for crops we don't support (cassava, tomato, tea), which keywords
correctly leave empty. `hybrid_intent_symptom`: intent + a missing symptom (it must fit the crop);
`hybrid_no_offer`: intent + crop + symptom; `hybrid_fill`: every empty slot, offer too. The base model
invents symptoms; the fine-tune much less.
`llm_first` = the LLM's intent and crop win whenever it gives them; lang, symptom and offer stay with the keywords.

Model: `ml\reports\knn_e5`.
Near-copies of LoRA training SMS (token Jaccard >= 0.6 with one of the 3,000 synthetic SMS): dev 51/100, heldout 24/50, fresh 3/40, fresh2 7/30. A fine-tuned model's dev/heldout scores are optimistic by that much; `fresh` is the honest one.

| Set | median latency (s) | max (s) | prompt ms (median) | generation ms (median) |
| :-- | --: | --: | --: | --: |
| dev | None | None | None | None |
| heldout | None | None | None | None |
| fresh | None | None | None | None |
| fresh2 | None | None | None | None |

## Misses: dev / qwen

- 3 `madoa ya machungwa chini ya majani ya kahawa` symptom: want `rust` got `phoma`
- 4 `unga wa machungwa kwenye majani` crop: want `` got `bean`
- 19 `viwavijeshi wanakula mahindi` symptom: want `fall_armyworm` got ``
- 20 `funza kwenye mahindi` symptom: want `fall_armyworm` got ``
- 21 `viwavi wamekula majani ya mahindi` symptom: want `fall_armyworm` got ``
- 22 `worms eating my maize leaves` symptom: want `fall_armyworm` got ``
- 23 `there are caterpillars in the maize funnel` symptom: want `fall_armyworm` got ``
- 24 `fall army worm in maize` symptom: want `fall_armyworm` got `leaf_blight`
- 25 `armyworms everywhere` lang: want `en` got `sw`
- 25 `armyworms everywhere` crop: want `` got `maize`
- 25 `armyworms everywhere` symptom: want `fall_armyworm` got `lethal_necrosis`
- 30 `maize leaf blight long grey spots` symptom: want `leaf_blight` got `leaf_spot`
- 39 `leaves look weird today should I spray` crop: want `` got `coffee`
- 39 `leaves look weird today should I spray` symptom: want `` got `cercospora`
- 41 `2 viwavi` symptom: want `fall_armyworm` got `leaf_spot`
- 42 `3 kutu` crop: want `bean` got `coffee`
- 44 `P 1 12000` offer: want `12000` got `11000`
- 45 `P 1 12k` commodity: want `coffee_arabica_parchment` got `coffee_robusta_faq`
- 50 `mnunuzi ananipa 12,000 kwa kilo ya kahawa` offer: want `12000` got `11000`
- 51 `ninauza kahawa kwa elfu 14` offer: want `14000` got `15000`
- 53 `kiboko 5000 ni bei nzuri?` offer: want `5000` got `5500`
- 54 `bei ya FAQ leo` crop: want `coffee` got ``
- 54 `bei ya FAQ leo` commodity: want `coffee_robusta_faq` got ``
- 58 `maharage 2500 kwa kilo` crop: want `bean` got ``
- 58 `maharage 2500 kwa kilo` commodity: want `beans_dry` got ``
- 60 `The buyer offers 12000 for my parchment. Is that fair?` offer: want `12000` got `11500`
- 61 `buyer offering 12.5k per kg coffee` offer: want `12500` got `12000`
- 65 `bei ya coffee 15000` offer: want `15000` got ``
- 69 `mnunuzi amekuja na 11000` offer: want `11000` got `12000`
- 75 `?` lang: want `sw` got `en`
- 85 `Majani ya KAHAWA yana unga wa NJANO!!` symptom: want `rust` got ``
- 86 `mahind yana viwavi` symptom: want `fall_armyworm` got ``
- 89 `mnunuzi wa kahawa anasema 10 elfu` offer: want `10000` got `13000`
- 91 `robusta price kiboko 5500` offer: want `5500` got ``
- 93 `nina kilo 50 za kahawa mnunuzi anatoa 13000` offer: want `13000` got `5000`
- 95 `corn leaves have holes` symptom: want `fall_armyworm` got ``
- 96 `majani ya mahindi yana matundu` symptom: want `fall_armyworm` got ``
- 97 `coffee berries black` symptom: want `` got `phoma`
- 98 `kahawa matunda meusi` symptom: want `` got `rust`
- 99 `bei ya chai` crop: want `` got `coffee`
- 99 `bei ya chai` commodity: want `` got `coffee_arabica_parchment`
- 100 `cassava leaves yellow` crop: want `` got `coffee`

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

- h11 `viwavi jeshi kwenye shamba la mahindi` symptom: want `fall_armyworm` got ``
- h12 `nimeona funza ndani ya mahindi` symptom: want `fall_armyworm` got `streak_virus`
- h13 `caterpilars eating maize` symptom: want `fall_armyworm` got ``
- h14 `the maize has small worms in the middle` symptom: want `fall_armyworm` got `leaf_spot`
- h25 `mtu anataka kununua kahawa yangu kwa 11500` offer: want `11500` got `12500`
- h26 `anatoa 13k kwa kilo` offer: want `13000` got `12000`
- h27 `P 1 14500` commodity: want `coffee_arabica_parchment` got `coffee_arabica_drugar`
- h27 `P 1 14500` offer: want `14500` got `15500`
- h28 `p1 13000` offer: want `13000` got `11000`
- h29 `P2 1000` lang: want `sw` got `en`
- h30 `bei ya kiboko leo 6000` offer: want `6000` got ``
- h49 `bei ya ndizi` crop: want `` got `coffee`
- h49 `bei ya ndizi` commodity: want `` got `coffee_arabica_parchment`

## Misses: fresh / keyword

- f4 `coffee leaf got brown circles with grey middle like an eye` symptom: want `cercospora` got ``
- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got ``
- f8 `corn leaves have long cigar shaped grey brown lesions` symptom: want `leaf_blight` got ``
- f9 `maharagwe yangu majani yana vidoa vya kahawia vyenye kona kona` symptom: want `angular_leaf_spot` got ``
- f15 `buni zinakauka kuanzia juu ya matawi baada ya baridi kali` symptom: want `phoma` got ``

## Misses: fresh / qwen

- f5 `Mahindi yangu yameliwa usiku, kuna kinyesi kama machujo ndani ya kitovu` symptom: want `fall_armyworm` got `streak_virus`
- f6 `worms inside the maize funnel and the leaves have ragged holes` symptom: want `fall_armyworm` got `streak_virus`
- f9 `maharagwe yangu majani yana vidoa vya kahawia vyenye kona kona` symptom: want `angular_leaf_spot` got `rust`
- f11 `Shamba la mahindi limeharibika sana mwaka huu sijui ni nini` symptom: want `` got `leaf_blight`
- f13 `mihogo yangu ina majani yaliyojikunja` crop: want `` got `bean`
- f13 `mihogo yangu ina majani yaliyojikunja` symptom: want `` got `rust`
- f14 `tomato leaves have black spots` crop: want `` got `coffee`
- f14 `tomato leaves have black spots` symptom: want `` got `phoma`
- f18 `broker amekuja anataka kilo ya kahawa kwa 12,500/=` offer: want `12500` got `11500`
- f19 `a buyer came offering UGX 11000 a kilo for my arabica, should i sell` offer: want `11000` got `16000`
- f20 `kiboko wanalipa shs 5800 hapa kijijini, ni sawa?` crop: want `coffee` got `bean`
- f20 `kiboko wanalipa shs 5800 hapa kijijini, ni sawa?` commodity: want `coffee_robusta_kiboko` got `beans_dry`
- f20 `kiboko wanalipa shs 5800 hapa kijijini, ni sawa?` offer: want `5800` got `2500`
- f21 `mahindi wananunua 850 kwa kilo` offer: want `850` got `800`
- f22 `maize going for 1,050 per kg at the market is that low` offer: want `1050` got `1000`
- f24 `how much are beans selling for in Mbale` offer: want `` got `3500`
- f25 `nimepewa elfu kumi na nne kwa kilo ya kahawa` offer: want `14000` got `15000`
- f26 `P 2 950` offer: want `950` got `900`
- f30 `bei ya chai leo` crop: want `` got `coffee`
- f30 `bei ya chai leo` commodity: want `` got `coffee_arabica_parchment`
- f33 `nataka kuotesha miche ya kahawa mwezi ujao` intent: want `planting` got `diagnose`
- f33 `nataka kuotesha miche ya kahawa mwezi ujao` symptom: want `` got `phoma`

## Misses: fresh2 / keyword

- g3 `maharage yangu yana vipele vya kahawia chini ya jani` symptom: want `rust` got ``
- g10 `coffee leaves have grey spots with brown ring` symptom: want `cercospora` got ``
- g11 `mahindi yana madoa ya kijivu marefu kama sigara` symptom: want `leaf_blight` got ``
- g12 `Wadudu wanachimba ndani ya majani ya kahawa` symptom: want `miner` got ``
- g28 `good morning` lang: want `en` got `sw`
- g28 `good morning` intent: want `help` got `other`

## Misses: fresh2 / qwen

- g1 `Shikamoo, majani ya kahawa yanaanguka sana na yana unga wa njano` symptom: want `rust` got ``
- g4 `there are caterpillars in my maize, the leaves have holes` symptom: want `fall_armyworm` got ``
- g5 `funza wamevamia mahindi yote shambani` symptom: want `fall_armyworm` got `lethal_necrosis`
- g9 `ndizi zangu zina ugonjwa` crop: want `` got `maize`
- g13 `bei ya kahawa kiboko leo sokoni ni ngapi` commodity: want `coffee_robusta_kiboko` got `coffee_arabica_parchment`
- g14 `buyer wants to pay 13,500 for parchment` offer: want `13500` got `14000`
- g15 `wanataka kununua mahindi kwa shilingi 750` offer: want `750` got `700`
- g19 `P 3 2700` offer: want `2700` got `2000`
- g30 `the rain was heavy yesterday` lang: want `en` got `sw`
