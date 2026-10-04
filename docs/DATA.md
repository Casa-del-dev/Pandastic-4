# Data: what Pandastic is built on, and what it does not cover

Brief §7.2 asks for two kinds of data: data that shows the problem, and data the tool is built with (dataset, source,
licence, size, **and what it does not cover**). Everything below is in the repository or downloaded by a script in `ml/`.
Synthetic data is labelled synthetic wherever it appears.

## 1. Evidence that the problem is real

| Claim | Number | Source (year, country) |
| :-- | :-- | :-- |
| Extension officers are too few to visit farmers | **1 extension worker per ~1,800 farmers**, against a recommended 1:500. Only 2,561 workers had been recruited across 135 local governments, a shortfall of over 3,000 | [UFAAS policy brief on agricultural extension (2023, Uganda)](https://ufaas-ugandacf.org/wp-content/uploads/2023/12/Policy-Brief-on-Re-energising-AEAS-in-Uganda-FINAL.pdf); Auditor General report for 2024, via [The Cooperator](https://thecooperator.news/ag-faults-ministry-for-shortage-of-agricultural-extension-workers/) |
| Coffee is a smallholder crop, and most farmers sell alone | **~1.8 million households** grow coffee; **23%** are in producer cooperatives; average planted area 0.45 ha | [ILO, Mapping the coffee value chain in Uganda (2024)](https://www.ilo.org/sites/default/files/2024-07/Uganda_Coffee_Value_Chain_Mapping.pdf) |
| The farm-gate price moves a lot, so an old reference misleads | National farm-gate price over 21 months (Dec 2024 – Aug 2026): Arabica parchment **UGX 12,500 – 16,750/kg (25% range)**; Robusta kiboko **UGX 5,250 – 7,750/kg (32% range)** | MAAIF Coffee Department (formerly UCDA) monthly coffee reports, parsed by `ml/fetch_prices.py` into `data/prices_coffee_ucda.csv` |
| A woman farmer is less likely to hold the smartphone herself | In sub-Saharan Africa, women are **22% less likely** to own a smartphone than men (10% for any mobile phone). Uganda's gender gap in mobile-internet use is **33%**, the second highest of the surveyed African countries | [GSMA Mobile Gender Gap Report 2025](https://www.gsma.com/gender-gap-2025/) |

This is why the design is **SMS from a basic phone to the household smartphone**: Noor keeps her own phone on the
slope, the AI runs on the daughter's phone at the house, and there is no data bundle or Wi-Fi.

## 2. Data we build with

### 2.1 Shipped in the app: `assets/models/knowledge.sqlite` (360 KB, built by `ml/build_knowledge.py`)

| Data | Source | Licence | Size | Used for |
| :-- | :-- | :-- | :-- | :-- |
| Coffee farm-gate prices: Arabica parchment, Drugar, Robusta kiboko, FAQ; national monthly averages | [MAAIF Coffee Department / UCDA monthly reports](https://ugandacoffee.go.ug/resource-center/reports/monthly-reports), one report per month, each row citing its PDF | Uganda government publication | 84 rows, Dec 2024 – Aug 2026 | "Is this buyer's price fair?" |
| Maize and dry bean retail prices by market | [WFP food prices for Uganda, via HDX](https://data.humdata.org/dataset/wfp-food-prices-for-uganda) | **CC BY-IGO** | 2,138 market-month rows, Jan 2024 – Aug 2026; plus 64 national 25th–75th percentile rows, marked `derived=1` | Maize and bean price checks |
| Coffee leaf rust advice | [CABI Plantwise factsheet RW014 (Rwanda Agriculture Board)](https://plantwiseplusknowledgebank.org/doi/10.1079/PWKB.20127801774) | CC BY-SA 4.0 | 1 condition | Advice text (paraphrased, cited) |
| Maize grey leaf spot advice | [CABI Plantwise factsheet ZM013 (Zambia Ministry of Agriculture)](https://plantwiseplusknowledgebank.org/doi/full/10.1079/pwkb.20147801404) | CC BY-SA 4.0 | 1 condition | Advice text (paraphrased, cited) |
| Maize streak virus advice | [CABI Plantwise factsheet KE015 (CABI Africa, Kenya)](https://factsheetadmin.plantwise.org/Uploads/PDFs/20117800551.pdf) | CC BY-SA 4.0 | 1 condition | Advice text (paraphrased, cited) |
| Brown eye spot, fall armyworm, northern leaf blight, bean rust, angular leaf spot | [Pacific Pests, Pathogens & Weeds fact sheets](https://apps.lucidcentral.org/ppp/) (ACIAR / SPC) | Free online fact sheets; reuse terms still to confirm | 5 conditions | Advice text (paraphrased, cited) |
| Coffee leaf miner | [Dantas et al., *Insects* 12(12):1130, 2021](https://doi.org/10.3390/insects12121130) | CC BY 4.0 | 1 condition | Advice text |
| Phoma leaf spot | [Pereira & Reis, Revista Cultivar, 2024](https://revistacultivar.com/articles/phoma-spot-or-ascochyta-spot-of-coffee) | Publisher copyright; paraphrased and cited | 1 condition | Advice text |
| Swahili/English keywords and menu codes (`1` coffee, `2` maize, `3` beans, `P` price) | Written by the team | Ours | 178 terms | Understanding SMS without a model |

Every advice and price row carries a `source_id`; the build fails if one is missing. Swahili advice is marked
`translation = machine` (translated by the team), because it has not yet been checked by a native speaker.

### 2.2 Leaf classifier training data (trained on Modal; the coffee test set is being replaced, see results below)

| Dataset | Content | Licence | Size | Role |
| :-- | :-- | :-- | :-- | :-- |
| [BRACOL](https://data.mendeley.com/datasets/yy2k5y8mxg/1) | Arabica leaves, Espírito Santo, **Brazil**, white background | CC BY 4.0 | 1,747 labelled leaves; **the published zip is truncated**, so ~1,400 are readable, of which 1,343 have a single stress (healthy 142, miner 254, rust 465, Phoma 346, Cercospora 136) | Train / validation |
| [JMuBEN](https://data.mendeley.com/datasets/t2r6rszp5c/1) + [JMuBEN2](https://data.mendeley.com/datasets/tgv3zb82nd/1) | Arabica, Kirinyaga, **Kenya**: **128×128 px close-ups of single lesions**, blurry and colour-shifted, not whole leaves | CC BY 4.0 | 58,555 images, mostly rotated/flipped copies: the 8,336 rust images are **632 distinct patches** (1,404 distinct across all classes) | Was the cross-country calibration + test set; it measures lesion patches, not farmer photos, so it is being moved into training |
| [PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset) | Web-scraped field photos, 13 species, no coffee | CC BY 4.0 | ~2,600 images | `other` (not a supported leaf) |
| [iBean (Makerere AI Lab)](https://huggingface.co/datasets/AI-Lab-Makerere/beans) | Bean leaves, **Uganda** field photos | MIT | ~1,300 images | `other` (P0); bean classes (P1, P2) |
| [Caltech-101](https://data.caltech.edu/records/mzrjq-6wc02) | Objects, animals, faces, scenes (102 categories) | CC BY 4.0 | ≤ 40 per category, 4,009 used | `other` (non-plants), split by category so test categories are unseen |
| [CCMT (Crop Pest and Disease Detection)](https://data.mendeley.com/datasets/bwh3zbpkpv/1), raw maize photos | Maize leaves from local farms in **Ghana** | CC BY 4.0 | 3,472 images used: fall armyworm 285, healthy 208, leaf blight 1,000, leaf spot 1,000, streak virus 979 (grasshopper and leaf-beetle folders not used) | Maize classes (P2); listed per image with its public S3 URL in `ml/leaf/ccmt_files.csv` |
| timm `mobilenetv4_conv_small` ImageNet weights | Pretrained backbone | Apache-2.0 | 3.8 M parameters | Starting point |

How it is evaluated: thresholds are chosen on a calibration split, and accuracy, coverage (the share of plant
photos the app answers instead of saying "not sure") and the share of `other` photos wrongly accepted are reported
on a separate test split, overall and **per crop** (`eval.by_crop` in each model's `leaf_classifier.json`).

**Results so far: coffee fails, maize and beans work.** P2 model `leaf-p2-20261004-0209` (14 labels, 12 epochs on an
L4 GPU, 9.8 MB ONNX), test split, at the thresholds chosen on the calibration split:

| Slice | Test photos | Coverage | Accuracy of answered photos | Note |
| :-- | --: | --: | --: | :-- |
| Coffee (Kenya, JMuBEN) | 701 | 4.3% | **0%** | Trained on whole Brazilian leaves on white paper, tested on Kenyan lesion patches: it doesn't transfer |
| Maize (CCMT Ghana + PlantDoc) | 364 | 42% | 98.7% | Same sources as training (other photos of them) |
| Bean (iBean, Uganda) | 129 | 76% | 99.0% | Same source as training |
| `other` wrongly accepted | 231 | | 0% | |

A second P2 run with the reworked pipeline gave the same picture (coffee 0% at 4.6% coverage). The 0% on coffee
means the test set never resembled a farmer's photo. On 200 photos of leaves on the plant (RoCoLe, below), the same
model says `other` or a bean label for most and answers none of them: safe, but no help for coffee.

[RoCoLe](https://data.mendeley.com/datasets/c5yvn32dzg/2) (Ecuador, CC BY 4.0, 1,393 smartphone photos of Robusta
leaves on the plant from 390 plants: healthy 791, rust levels 1–4 602; the 167 red-spider-mite photos are not used)
then joined the data, split by plant, and JMuBEN moved into training. Two runs:

- **`xc`: never trained on RoCoLe** (`leaf-p2-xc-3ad440b2`; thresholds chosen on 40% of RoCoLe's plants, tested on
  the other 60%). On those Ecuador photos it answers **1.2%** (10 of 846), and 2 of the 10 answers are right. A
  model trained on Brazilian and Kenyan coffee images **does not transfer to phone photos of leaves on the plant**.
  Its other slices are same-source: JMuBEN 100% at 95% coverage, maize 92% at 68%, beans 97% at 92%; `other`
  wrongly accepted 1.3%.
- **`mix`: trained on half of RoCoLe's plants (195), tested on 98 other plants** (360 photos: 199 healthy, 161
  rust; same source, not another country). This was the model in the app until 05:32 UTC (`leaf-p2-mix-eff20277`). On the test
  plants it answers **95%** of the photos and **94.5%** of its answers are right; maize 89% at 91% coverage, beans 95%
  at 98%, JMuBEN 99.6% at 97.5% (all same-source); `other` wrongly accepted 4.8%.
  Its most harmful mistake is calling early rust "healthy" (17 of the 161 rusty test photos). So `coffee_healthy`
  now needs probability ≥ 0.95, chosen on the 58 calibration plants for ≥ 95% precision (`ml/leaf/class_thresholds.py`,
  run through the app's own photo path). On the test plants: rust called healthy **17 → 7**, accuracy of answers
  **94.2% → 96.4%**, share answered **95% → 77%**: the extra "not sure, ask a person" answers are mostly healthy
  leaves, the safe direction.

Phone photos carry an orientation tag: 296 of 300 RoCoLe photos are stored sideways. The model must see them
upright (training does `exif_transpose`, and the app's WebView does the same); sideways, its top-1 accuracy on the
test plants drops from 92% to 84%. The app's resize path (640 px JPEG, then a 224 px bilinear resize) changes the
results by under one point.

**Non-plant photos (found by the app team while preparing the user test).** `other` had only ever seen plant leaves,
so on 117 random everyday photos (streets, sea, animals, machines; picsum.photos, through the app path,
`ml/leaf/probe_nonplant.py`) the installed model gave a confident disease or "healthy" answer on **41**. The app now
turns away photos with almost no leaf colour (`QualityGate.plantShare`, thresholds checked on every test photo:
`ml/leaf/photo_stats.py`), which leaves 8. Adding Caltech-101 to `other` and averaging three training seeds
(**`leaf-p2-mix-ens3-0483c29f`, the model in the app from cff9e12 until the EfficientNet-B0 install below**) brings it to **3, and 0 with the gate** (on the
emulator: 20 of 20 random non-plant photos turned away); on 635 Caltech photos of object
kinds never trained on it accepts 1.1%, and other plants' leaves 1.6% (was 4.8%). Every `*_healthy` label now needs
a probability chosen on the calibration split for ≥ 95% precision (coffee ≥ 98%, as 58 calibration plants proved
easier than the test plants): on RoCoLe test plants it calls rust healthy 4 times (the previous model: 7), is
right 96.9% of the time when it answers, but answers 63% instead of 77%. Healthy maize needs 0.99, so it is mostly
"not sure": no lower threshold reaches 95% precision on the calibration photos.

Tried and not shipped (RoCoLe test plants, app path): higher input resolution (288/320/384 px: mild rust, the only
rust ever called healthy, is not a pixel problem); int8 activations (4x smaller but −3 points top-1); averaging over
flipped copies (+0.6 point for 3x the compute). The installed ensemble stores its weights as int8 (7.7 MB for three
models) but computes in fp32, so its answers equal the fp32 ensemble's (the app sets ONNX Runtime's
`session.disable_quant_qdq`, so the weights are expanded once at load: 5 ms per photo instead of 15 ms on a laptop).

**Maize, the weakest crop** (CCMT Ghana test photos, same source as training): the installed model answers 96% of
364 maize test photos and 86% of its answers are right. Half of the 49 wrong answers swap northern leaf blight and
grey leaf spot, whose advice is nearly the same (resistant seed, rotation, deal with crop remains; no spray needed
first), so **93% of maize answers lead to the right advice**. The other 25 mostly confuse streak virus with the two
leaf spots. A separate minimum probability per maize *label* does not help: alone, grey leaf spot and fall armyworm
never reach 90% calibration precision (label noise in the source). One minimum across **all maize labels** does:
`ml/leaf/crop_floors.py` picks, on the calibration split, the lowest one at which the crop's answers are ≥ 90% right
(installed model: 0.75 → maize 78% answered, 90.8% right; coffee and beans already pass at the global threshold).

**Other backbones** (same data, recipe and checks; `--arch`). MobileNetV4-Conv-Medium is worse (top-1 92.2% at a
lower learning rate, 3.3% of other plants accepted; at the default rate it diverged). **EfficientNet-B0 is better**,
mostly on coffee phone photos: one model reaches 95.3% top-1, and three seeds averaged
(`leaf-p2-mix-efficientnetb0-ens3-a16129a8`, int8-stored, 12.7 MB, **installed after the app check below**; on the branch, with
the per-crop maize minimum 0.85) give on the test split 96.3% right at 91% answered (ens3: 93.9% at 87%). On RoCoLe
test plants through the app path it answers 91% (ens3: 63%) and is right 97.3% (96.9%), calling rust healthy 5
times of 161 (4). Maize 92.2% right at 81% answered; other plants accepted 0.5% (1.6%), unseen Caltech non-plants 0%.
Costs: ~3.5x the compute (29 ms vs 8 ms per photo on a laptop) and, of 117 random everyday photos, one passes the
plant-colour gate and gets a confident answer (raspberries on a railing → fall armyworm 0.86; ens3: none).

**Checked through the real app before install (O1, emulator; this model is now installed).** The numbers above
come from a laptop copy of the app's photo path. `scripts/photo-eval.mjs` sends each held-out photo through the app
itself: WebView 640 px JPEG, Android bitmap, ONNX Runtime, gate, thresholds, Resolver. ens3 gave the same
probabilities there as on the laptop (±0.01). EfficientNet-B0 did not (one rust photo: 0.92 laptop, 0.75 app). The
likely cause is the app's last resize, `Bitmap.createScaledBitmap(…, true)` from 640 to 224 px. That is plain bilinear,
while training and the laptop copy use PIL's antialiased resize, and EfficientNet reacts more to the difference. With
its branch thresholds, the candidate called **8 of 161 rust leaves healthy in the app** (ens3: 3). So its minimum
probabilities were chosen again on the **calibration** photos run through the app, with the same rules (each crop's
answers ≥ 90% right; each `*_healthy` label ≥ 99% precision): coffee_healthy 0.99, maize_healthy 0.98, other maize
labels 0.82, bean_healthy 0.54. The 99% target for "healthy" was set after the 8/161 result had been seen on test.
Held-out test photos through the app on the emulator (answered / right when answered / sick leaf called healthy):

| Test photos (held-out) | ens3 (installed until now) | EfficientNet-B0 ×3 (installed) |
| :-- | :-- | :-- |
| Coffee, RoCoLe phone photos (360) | 59.4% / 96.7% / **3** | 65.0% / 97.4% / **0** |
| Maize, CCMT (336) | 89.9% / 87.1% / 0 | 79.2% / 90.6% / 0 |
| Beans, iBean (129) | 96.9% / 96.8% / 0 | 100% / 96.1% / 1 (rust, at 0.65) |
| Non-crop photos: 117 everyday + 20 random (137) | 0 answered | 1 answered |
| `checkPhoto` median in the page (x86_64 emulator) | 45 ms | 80 ms |

The JSON-only fallback (ens3 with maize labels at 0.75) gives maize 76.2% / 90.2% and leaves coffee as ens3. The
calibration-to-test gap is in the JSON (`app_check`). Not tried: an antialiased resize in `LeafClassifier`, which
could recover the laptop numbers but needs both models re-checked.

### 2.3 SMS understanding (all **synthetic**, written or generated by the team)

| Set | Size | Use |
| :-- | :-- | :-- |
| `ml/llm/eval_sms.csv` | 100 SW/EN/mixed SMS with gold slots | Dev set: used to tune the keyword lexicon |
| `ml/llm/eval_sms_heldout.csv` | 50 SMS, written before any results | Held-out test, never used for tuning |
| `ml/llm/eval_sms_fresh.csv` | 40 SMS, written after the LoRA was trained, in phrasings unlike its templates (Sheng, `12,500/=`, unsupported crops) | First measured untouched (keywords 68%), then used to find keyword bugs |
| `ml/llm/eval_sms_fresh2.csv` | 30 SMS, written before those keyword fixes | **The honest test now**: never used to fix anything |
| `ml/llm/gen_train.py` | 3,000 template-generated SMS (no exact copy of an eval text) | LoRA fine-tune of Qwen3.5-0.8B (trained on Modal) |

Results (`ml/reports/nlu_eval.md`). "Same reply" = the app would send exactly the reply the correct slots give (it
answers `help` and `other` with the same menu):

| | held-out (50) | fresh2 (30) |
| :-- | --: | --: |
| Keywords alone, before the fresh-set fixes | 68% | 80% |
| **Keywords alone, now** | 72% (same reply 76%) | 83% (83%) |
| Base Qwen3.5-0.8B alone | 34% | 27% |
| Keywords + Qwen supplying only the intent when no intent keyword matched (the app's policy) | 78% (82%) | 77% (83%) |
| Keywords + Qwen also supplying a missing crop (the app's policy until 03:00 UTC) | 78% (82%) | 70% (77%) |

The keyword fixes are general rules found on the first fresh set: common function words decide the reply language,
a symptom word must fit the crop ("mistari", lines, means leaf-miner trails on coffee and streak virus on maize), and
"season" alone no longer means planting. On fresh2 they move keywords from 80% to 83%.

Later fix (06:11 UTC), found on the **held-out** set, which is therefore no longer untouched for this rule: the price
code typed without its space ("p1 13000", "P2 1000") is now read like "P 1 13000", but only at the start of an SMS
that has a number, because "P1".."P7" are also Ugandan primary-school years ("Sarah's P3 fees"). Since the helper
answers only SMS it recognises as farming (A's `HubPolicy`), these two price checks used to get no reply at all.
Held-out: keywords 72% → 76%, keywords + fine-tune (the app) 94% → 98%; fresh and fresh2 unchanged.

**What the base LLM adds is small.** Over the 120 held-out and fresh SMS, it gives 100 correct replies against 98
for keywords alone: it understands questions in words the lexicon lacks ("mimea inanyauka", "anatoa 13k"), and
calls some chit-chat a question. Taking the crop from it is worse: it answers "coffee" or "maize" when the farmer
names cassava, tomato or tea. It invents symptoms, so the app never takes a symptom, offer, language or crop from it.
The app works without it (the model is a side-loaded 530 MB file).

**The fine-tuned model (LoRA on 3,000 synthetic SMS, `ml/reports/nlu_eval_lora.md`) is different.** Alone it scores
94% on the held-out set, but that number is optimistic: **24 of the 50 held-out SMS have a near-copy** (≥ 60% of
words shared) among its training SMS, against 3 of 40 in the fresh set. On fresh2, which it never saw, it scores 90%
alone. It also stops inventing symptoms, so it may fill a **symptom** the keywords missed (only for a problem
report whose crop the keywords found, and only if the pair is a real label; a text symptom is still never
CONFIDENT), as well as the intent:

| | held-out | fresh | fresh2 |
| :-- | --: | --: | --: |
| Keywords alone | 72% | 88% | 83% |
| Keywords + fine-tune, intent only | 80% | 88% | 80% |
| **Keywords + fine-tune, intent + symptom** (the app) | **94%** | **95%** | **93%** |
| Keywords + base model, intent + symptom | 82% | 85% | 73% |

The model is called for about a third of the SMS (no intent keyword, or a diagnosis without a symptom), median
1.5–2 s on a laptop. The crop, offer, language and commodity always come from the keywords.

### 2.4 Retrieval ("vector database"): measured, not shipped

The app has no vector database. Advice is already retrieved exactly: the classifier's label (e.g. `coffee_rust`) is
the key of a cited row in `knowledge.sqlite`, which beats a similarity search over 26 advice rows. Qwen never writes
advice, so retrieval could only help it **read the SMS**: find the most similar of the 3,000 labelled training SMS
and use their slots, or show them to Qwen as examples. `ml/llm/retrieval_eval.py` measures this. Share of SMS
with all slots right, keywords first and the extra source filling only a missing intent and symptom (as in 2.3):

| Extra source after the keywords | held-out | fresh | fresh2 | Right of 120 | Memory on the phone | Time per SMS (laptop) |
| :-- | --: | --: | --: | --: | :-- | :-- |
| None (keywords alone) | 72% | 88% | 83% | 96 | 0 | < 1 ms |
| Nearest SMS by BM25 (words + 4-letter pieces), no model | 94% | 90% | 90% | **110** | ~1 MB index | ~5 ms |
| Nearest SMS by multilingual-e5-small, no LLM | 94% | 92% | 97% | **113** | 118 MB (int8) + 4.6 MB index | ~6 ms |
| Same, vocabulary trimmed to our SMS (936 tokens) | 92% | 88% | 97% | 110 | ~22–30 MB | ~6 ms |
| Base Qwen, no examples | 82% | 90% | 77% | 100 | 530 MB | 0.9 s |
| Base Qwen + 4 retrieved examples in the prompt | 96% | 90% | 93% | 112 | 530 MB + 1 MB | 2.0 s |
| **Fine-tuned Qwen, no examples (the app)** | 94% | 95% | 93% | **113** | 530 MB | 1.5–2 s |

All rows use the app's rule (LlmNlu, af9e490): the extra source names the intent only when no intent keyword
matched, and a symptom only for a problem report whose crop the keywords found, if the pair is a real label.

- **Retrieval does make the base Qwen smarter**: 4 similar SMS in the prompt lift it from 100 to 112 right, about
  as much as fine-tuning did. But the prompt grows from ~200 cached tokens to ~850 uncached ones, so it is twice as
  slow (≈ 6–10 s on a phone), and the fine-tuned model already gets there without it.
- **Retrieval alone almost replaces the LLM**: BM25 needs no model and gets 110 of 120; e5-small gets 113, the same
  as the fine-tuned Qwen, with a quarter of its memory. That matters for phones that cannot load Qwen and for the
  seconds while it loads.
- **Qwen's own embeddings** (no extra weights) are the weakest retriever: the nearest SMS has the right crop in only
  63% of fresh2, against 90% for BM25 and 97% for e5. A vector-database engine is unnecessary at this size: a
  brute-force search over 3,000 vectors takes under a millisecond.
- Caveat: the 3,000 labelled SMS come from the same templates as the fine-tune's training data, and 24 of the 50
  held-out SMS have a near-copy among them, so fresh2 is the number to trust.

## 3. What the data does not cover

**Prices**
- Coffee prices are **national monthly averages**, not the price in Noor's valley or on the day the buyer comes.
  There are no grade premiums and nothing for the fictional Ondera market.
- Since mid-2026, WFP reports Uganda maize and bean prices **only from refugee-settlement markets**. The nearest
  highland market, Kapchorwa (Mt Elgon), was last reported in December 2025, so the app labels that price as old.
- Maize and bean prices are **retail market prices**; farm-gate prices are usually lower, and the reply says so.
- The Fairtrade minimum price is for green coffee, not parchment, and is not used.

**Leaf photos**
- **No Ugandan coffee leaf photos.** Coffee images come from Brazil (white background; we paste them onto field
  backgrounds) and Kenya (128 px lesion close-ups). Performance on Ugandan phone photos is untested, and on the
  Kenyan patches the coffee classes fail (section 2.2).
- **Leaves only:** no berries, so no coffee berry disease, berry borer or black branches. Those photos fall to `other`,
  which the app answers with "not sure — ask a person".
- Arabica only, no Robusta. Leaves with several stresses at once are excluded from training.
- `other` is made of other crops' leaves; hands, soil, walls or blurry shots are handled by the quality gate and
  thresholds, not learned.
- Maize photos come from one source (CCMT, Ghana) and bean photos from one source (iBean, Uganda), so maize and bean
  results are measured on held-out photos **from the same source**, not another country. Only 208 healthy-maize and
  285 fall-armyworm photos exist, far fewer than for the other classes.

**Advice**
- Advice covers 13 conditions. Maize lethal necrosis has none yet, so the app sends the farmer to the extension officer.
- Sources are from Rwanda, Zambia, Kenya, the Pacific, Brazil and a review paper, not Ugandan extension material. Uganda's pesticide
  registration list was not checked, so the advice never gives doses and always says "ask the officer before spraying".
- Swahili text is machine translated by the team; there is no Luganda advice.

**Language and messages**
- Swahili and English only. Luganda and Lumasaba (Mt Elgon) are not supported: a Luganda SMS gets the safe
  "not sure — show a photo or ask the officer" reply, which is what we would show for a less-supported language.
- All SMS test data is synthetic and written by non-native speakers. No real farmer messages were used, so real
  spelling, slang and abbreviations will be harder than our test sets.

**Planting dates**: no crop calendar is loaded; planting questions get "ask the extension officer".

## 4. Privacy and consent

No data leaves the phones. The SMS log stays on the daughter's phone, only messages from numbers she registers
are answered, and nothing personal is used for training (all SMS training data is synthetic).
