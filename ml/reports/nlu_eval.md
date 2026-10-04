# SMS understanding: KeywordNlu vs Qwen3.5-0.8B (GBNF)

Synthetic SMS written by the team (labelled synthetic). `dev` was used to tune the keyword lexicon;
`heldout` was written before any results and never used for tuning. Qwen: Q4_K_M via llama.cpp,
temperature 0, thinking off, 4 CPU threads on a laptop (a phone is slower).

| Set | Model | n | lang | intent | crop | symptom | commodity | offer | all slots |
| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| dev | keyword | 100 | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| dev | qwen | 100 | 66% | 79% | 91% | 72% | 84% | 97% | 31% |
| dev | hybrid_intent_crop | 100 | 100% | 99% | 94% | 100% | 98% | 100% | 93% |
| dev | hybrid_fill | 100 | 100% | 99% | 94% | 86% | 98% | 100% | 81% |
| heldout | keyword | 50 | 100% | 80% | 96% | 86% | 96% | 100% | 68% |
| heldout | qwen | 50 | 68% | 78% | 94% | 64% | 86% | 100% | 34% |
| heldout | hybrid_intent_crop | 50 | 100% | 96% | 96% | 86% | 96% | 100% | 78% |
| heldout | hybrid_fill | 50 | 100% | 96% | 96% | 74% | 96% | 100% | 66% |

`hybrid_intent_crop` = keyword slots always win; the LLM only supplies the intent when no intent keyword
matched (KeywordNlu intentProb 0) and the crop when none was found. `hybrid_fill` also lets it fill symptom
and offer, which is worse: the base model invents symptoms. This is the policy recommended for LlmNlu.

| Set | median latency (s) | max (s) | prompt ms (median) | generation ms (median) |
| :-- | --: | --: | --: | --: |
| dev | 0.86 | 3.1 | 146 | 704 |
| heldout | 1.15 | 2.02 | 170 | 955 |

## Misses: dev / qwen

- 3 `madoa ya machungwa chini ya majani ya kahawa` symptom: want `rust` got `miner`
- 4 `unga wa machungwa kwenye majani` crop: want `` got `coffee`
- 4 `unga wa machungwa kwenye majani` symptom: want `rust` got `leaf_blight`
- 5 `coffee leaves have orange powder underneath` lang: want `en` got `sw`
- 6 `yellow powder under my coffee leaves` lang: want `en` got `sw`
- 7 `my coffee has rust what to spray` lang: want `en` got `sw`
- 9 `maharage yana kutu` lang: want `sw` got `en`
- 9 `maharage yana kutu` symptom: want `rust` got `miner`
- 10 `kuna njia nyeupe ndani ya majani ya kahawa` symptom: want `miner` got `leaf_blight`
- 11 `mchimba majani kwenye kahawa` symptom: want `miner` got `leaf_blight`
- 12 `leaf miner on coffee` lang: want `en` got `sw`
- 13 `white trails inside the coffee leaf` lang: want `en` got `sw`
- 15 `brown eye spot on coffee leaves` lang: want `en` got `sw`
- 15 `brown eye spot on coffee leaves` symptom: want `cercospora` got `angular_leaf_spot`
- 16 `coffee leaves round brown spots grey centre` lang: want `en` got `sw`
- 17 `madoa meusi kwenye kahawa baada ya upepo baridi` symptom: want `phoma` got `leaf_blight`
- 18 `black spots and dry tips on coffee after cold wind` lang: want `en` got `sw`
- 19 `viwavijeshi wanakula mahindi` lang: want `sw` got `en`
- 20 `funza kwenye mahindi` lang: want `sw` got `en`
- 20 `funza kwenye mahindi` symptom: want `fall_armyworm` got `leaf_blight`
- 21 `viwavi wamekula majani ya mahindi` lang: want `sw` got `en`
- 25 `armyworms everywhere` crop: want `` got `maize`
- 26 `mahindi yana mistari ya njano` lang: want `sw` got `en`
- 29 `ukungu kwenye majani ya mahindi` lang: want `sw` got `en`
- 31 `madoa ya pembe kwenye maharage` symptom: want `angular_leaf_spot` got `leaf_blight`
- 33 `mahindi yanakauka na kufa` lang: want `sw` got `en`
- 33 `mahindi yanakauka na kufa` symptom: want `` got `leaf_blight`
- 34 `majani ya kahawa yanageuka njano` symptom: want `` got `rust`
- 35 `my coffee leaves are falling` symptom: want `` got `leaf_blight`
- 36 `wadudu kwenye kahawa` symptom: want `` got `leaf_blight`
- 37 `kuna shida kwenye maharage` symptom: want `` got `leaf_blight`
- 38 `something is wrong with my maize` symptom: want `` got `leaf_blight`
- 39 `leaves look weird today should I spray` crop: want `` got `maize`
- 39 `leaves look weird today should I spray` symptom: want `` got `leaf_blight`
- 41 `2 viwavi` lang: want `sw` got `en`
- 41 `2 viwavi` symptom: want `fall_armyworm` got ``
- 42 `3 kutu` crop: want `bean` got `coffee`
- 43 `Yellow orange powder spots under my coffee leaves lower slope` lang: want `en` got `sw`
- 46 `p 2 900` crop: want `maize` got `coffee`
- 46 `p 2 900` commodity: want `maize_grain` got `coffee_arabica_parchment`
- 47 `P 3 2500` crop: want `bean` got `coffee`
- 47 `P 3 2500` commodity: want `beans_dry` got `coffee_arabica_parchment`
- 48 `bei ya kahawa leo` intent: want `price` got `diagnose`
- 48 `bei ya kahawa leo` commodity: want `coffee_arabica_parchment` got ``
- 49 `bei ya kahawa? mnunuzi anasema 12000` intent: want `price` got `diagnose`
- 49 `bei ya kahawa? mnunuzi anasema 12000` commodity: want `coffee_arabica_parchment` got ``
- 52 `bei ya kiboko` intent: want `price` got `diagnose`
- 52 `bei ya kiboko` commodity: want `coffee_robusta_kiboko` got ``
- 53 `kiboko 5000 ni bei nzuri?` intent: want `price` got `diagnose`
- 53 `kiboko 5000 ni bei nzuri?` commodity: want `coffee_robusta_kiboko` got ``
- 53 `kiboko 5000 ni bei nzuri?` offer: want `5000` got ``
- 54 `bei ya FAQ leo` intent: want `price` got `diagnose`
- 54 `bei ya FAQ leo` symptom: want `` got `leaf_blight`
- 54 `bei ya FAQ leo` commodity: want `coffee_robusta_faq` got ``
- 55 `bei ya mahindi` lang: want `sw` got `en`
- 55 `bei ya mahindi` intent: want `price` got `diagnose`
- 55 `bei ya mahindi` commodity: want `maize_grain` got ``
- 56 `mahindi 900` lang: want `sw` got `en`
- 56 `mahindi 900` intent: want `price` got `diagnose`
- 56 `mahindi 900` commodity: want `maize_grain` got ``
- 56 `mahindi 900` offer: want `900` got ``
- 57 `bei ya maharage sokoni` lang: want `sw` got `en`
- 57 `bei ya maharage sokoni` intent: want `price` got `diagnose`
- 57 `bei ya maharage sokoni` symptom: want `` got `angular_leaf_spot`
- 57 `bei ya maharage sokoni` commodity: want `beans_dry` got ``
- 58 `maharage 2500 kwa kilo` lang: want `sw` got `en`
- 58 `maharage 2500 kwa kilo` intent: want `price` got `diagnose`
- 58 `maharage 2500 kwa kilo` commodity: want `beans_dry` got ``
- 60 `The buyer offers 12000 for my parchment. Is that fair?` lang: want `en` got `sw`
- 61 `buyer offering 12.5k per kg coffee` lang: want `en` got `sw`
- 67 `bei gani` intent: want `price` got `help`
- 68 `what price` crop: want `` got `coffee`
- 68 `what price` commodity: want `` got `coffee_arabica_parchment`
- 69 `mnunuzi amekuja na 11000` intent: want `price` got `diagnose`
- 69 `mnunuzi amekuja na 11000` crop: want `` got `coffee`
- 70 `nipande mahindi lini` lang: want `sw` got `en`
- 70 `nipande mahindi lini` intent: want `planting` got `diagnose`
- 70 `nipande mahindi lini` symptom: want `` got `leaf_blight`
- 71 `msimu wa kupanda maharage` intent: want `planting` got `diagnose`
- 71 `msimu wa kupanda maharage` symptom: want `` got `leaf_blight`
- 78 `help` lang: want `en` got `sw`
- 79 `menu` lang: want `en` got `sw`
- 81 `asante sana` intent: want `other` got `help`
- 82 `thank you` lang: want `en` got `sw`
- 82 `thank you` intent: want `other` got `help`
- 83 `nimefika nyumbani` intent: want `other` got `help`
- 84 `ok` intent: want `other` got `help`
- 86 `mahind yana viwavi` lang: want `sw` got `en`
- 86 `mahind yana viwavi` symptom: want `fall_armyworm` got `leaf_blight`
- 88 `bei ya kahwa` intent: want `price` got `diagnose`
- 88 `bei ya kahwa` commodity: want `coffee_arabica_parchment` got ``
- 89 `mnunuzi wa kahawa anasema 10 elfu` commodity: want `coffee_arabica_parchment` got `coffee_robusta_kiboko`
- 89 `mnunuzi wa kahawa anasema 10 elfu` offer: want `10000` got `10`
- 90 `kahawa ya arabica bei` lang: want `sw` got `en`
- 90 `kahawa ya arabica bei` intent: want `price` got `diagnose`
- 90 `kahawa ya arabica bei` commodity: want `coffee_arabica_parchment` got ``
- 91 `robusta price kiboko 5500` lang: want `en` got `sw`
- 92 `sell 100 kg coffee at 15000` lang: want `en` got `sw`
- 93 `nina kilo 50 za kahawa mnunuzi anatoa 13000` intent: want `price` got `diagnose`
- 93 `nina kilo 50 za kahawa mnunuzi anatoa 13000` commodity: want `coffee_arabica_parchment` got ``
- 94 `maharagwe yana madoa ya pembe` symptom: want `angular_leaf_spot` got `miner`
- 95 `corn leaves have holes` symptom: want `fall_armyworm` got `leaf_blight`
- 96 `majani ya mahindi yana matundu` lang: want `sw` got `en`
- 96 `majani ya mahindi yana matundu` symptom: want `fall_armyworm` got `leaf_blight`
- 97 `coffee berries black` lang: want `en` got `sw`
- 97 `coffee berries black` symptom: want `` got `leaf_blight`
- 98 `kahawa matunda meusi` symptom: want `` got `miner`
- 99 `bei ya chai` intent: want `price` got `help`
- 100 `cassava leaves yellow` lang: want `en` got `sw`
- 100 `cassava leaves yellow` crop: want `` got `coffee`
- 100 `cassava leaves yellow` symptom: want `` got `cercospora`

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
- h41 `best time to plant beans` intent: want `planting` got `other`
- h44 `nisaidie` intent: want `help` got `other`
- h45 `salaam` intent: want `help` got `other`
- h50 `miti ya kahawa inakufa` intent: want `diagnose` got `other`

## Misses: heldout / qwen

- h3 `majani ya buni yana vumbi la njano` crop: want `coffee` got `maize`
- h3 `majani ya buni yana vumbi la njano` symptom: want `rust` got `streak_virus`
- h4 `coffee leaf has rusty orange patches below` lang: want `en` got `sw`
- h5 `my beans leaves got brown powder` symptom: want `rust` got `angular_leaf_spot`
- h7 `coffee leaves have lines inside like tunnels` lang: want `en` got `sw`
- h8 `kahawa ina madoa ya kahawia na katikati kijivu` symptom: want `cercospora` got `leaf_blight`
- h9 `round brown spots coffee leaf` lang: want `en` got `sw`
- h10 `ncha za matawi ya kahawa zimekauka baada ya baridi` symptom: want `phoma` got `rust`
- h11 `viwavi jeshi kwenye shamba la mahindi` lang: want `sw` got `en`
- h12 `nimeona funza ndani ya mahindi` lang: want `sw` got `en`
- h12 `nimeona funza ndani ya mahindi` symptom: want `fall_armyworm` got `leaf_blight`
- h15 `mistari mieupe na njano kwenye mahindi` lang: want `sw` got `en`
- h15 `mistari mieupe na njano kwenye mahindi` symptom: want `streak_virus` got `leaf_blight`
- h17 `majani ya mahindi yana madoa marefu ya kijivu` lang: want `sw` got `en`
- h17 `majani ya mahindi yana madoa marefu ya kijivu` symptom: want `leaf_blight` got `lethal_necrosis`
- h18 `maharage yana madoa yenye pembe` lang: want `sw` got `en`
- h18 `maharage yana madoa yenye pembe` symptom: want `angular_leaf_spot` got `leaf_blight`
- h19 `mimea ya maharage inanyauka` lang: want `sw` got `en`
- h19 `mimea ya maharage inanyauka` symptom: want `` got `leaf_blight`
- h20 `shamba langu la kahawa lina ugonjwa` symptom: want `` got `leaf_blight`
- h21 `my maize looks sick` symptom: want `` got `leaf_blight`
- h22 `mahindi yamegeuka rangi` lang: want `sw` got `en`
- h22 `mahindi yamegeuka rangi` symptom: want `` got `lethal_necrosis`
- h23 `bei ya kahawa wiki hii ni ngapi` intent: want `price` got `diagnose`
- h23 `bei ya kahawa wiki hii ni ngapi` symptom: want `` got `leaf_blight`
- h23 `bei ya kahawa wiki hii ni ngapi` commodity: want `coffee_arabica_parchment` got ``
- h24 `nauza kahawa kesho bei gani` intent: want `price` got `diagnose`
- h24 `nauza kahawa kesho bei gani` symptom: want `` got `rust`
- h24 `nauza kahawa kesho bei gani` commodity: want `coffee_arabica_parchment` got ``
- h26 `anatoa 13k kwa kilo` crop: want `` got `coffee`
- h26 `anatoa 13k kwa kilo` commodity: want `` got `coffee_arabica_parchment`
- h29 `P2 1000` crop: want `maize` got `coffee`
- h29 `P2 1000` commodity: want `maize_grain` got `coffee_arabica_parchment`
- h31 `FAQ inauzwa shilingi ngapi` intent: want `price` got `diagnose`
- h31 `FAQ inauzwa shilingi ngapi` symptom: want `` got `leaf_blight`
- h31 `FAQ inauzwa shilingi ngapi` commodity: want `coffee_robusta_faq` got ``
- h32 `mahindi kilo moja ni shilingi ngapi` lang: want `sw` got `en`
- h32 `mahindi kilo moja ni shilingi ngapi` intent: want `price` got `diagnose`
- h32 `mahindi kilo moja ni shilingi ngapi` commodity: want `maize_grain` got ``
- h33 `naweza kuuza maharage kwa 2800` intent: want `price` got `diagnose`
- h33 `naweza kuuza maharage kwa 2800` commodity: want `beans_dry` got ``
- h34 `what is the price of parchment now` lang: want `en` got `sw`
- h38 `coffee 16k` lang: want `en` got `sw`
- h39 `ni lini nipande kahawa mpya` intent: want `planting` got `diagnose`
- h39 `ni lini nipande kahawa mpya` symptom: want `` got `leaf_blight`
- h40 `mvua imeanza nipande mahindi sasa` lang: want `sw` got `en`
- h40 `mvua imeanza nipande mahindi sasa` intent: want `planting` got `diagnose`
- h40 `mvua imeanza nipande mahindi sasa` symptom: want `` got `leaf_blight`
- h41 `best time to plant beans` lang: want `en` got `sw`
- h46 `sawa nimeelewa` intent: want `other` got `help`
- h47 `thanks` lang: want `en` got `sw`
- h47 `thanks` intent: want `other` got `help`
- h48 `mvua ni nyingi leo` intent: want `other` got `help`
- h49 `bei ya ndizi` intent: want `price` got `help`
- h50 `miti ya kahawa inakufa` symptom: want `` got `leaf_blight`
