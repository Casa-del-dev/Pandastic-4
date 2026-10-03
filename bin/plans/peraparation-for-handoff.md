Based on your three design files (`DEMO-A-4.md`, `DEMO-A-5.md`, and `DEMO-A-6.md`), you have a coherent product vision: an **offline multimodal assistant running within 4 GB of RAM**, using **asynchronous SMS between the two phones**, and grounded in **economic fair prices and verified agronomic data**. It covers **Noor's whole farm**: coffee on the upper slope, maize and beans below.

Below is the complete architectural handoff: how photos and questions reach the model, the model stack, the datasets to use (and drop), the fine-tuning setup and the knowledge base.

> **Revision 2 (2026-10-04): what changed**
> - Scope widened from coffee only to **coffee, maize and beans**, plus non-disease decisions (planting time, grain quality, price).
> - Photos are turned into a **text photo report** by small classifiers and merged with the question, so the reasoner stays the text-only **MiniCPM5-1B**. There is no crop-selection button: the photo and the question identify the crop.
> - The XGBoost image + weather fusion was dropped for coffee (no paired data). It is kept as a maize-only stretch goal on *Eyes on the Ground*.
> - Dataset list rewritten (section 3). **WFP has no coffee prices.** The earlier "Coffee (Parchment)" row and `fair_price_floor` column were invented and have been removed.
> - Knowledge base now comes from CABI PlantwisePlus and Access Agriculture instead of YouTube transcripts.





### The Dual-Mode Architecture: How It Works

```
                     ┌──────────────────────────────────────────────┐
                     │           THE HOUSEHOLD SETUP                │
                     └──────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ MODE 1: PHYSICAL ACCESS              │  │ MODE 2: REMOTE ACCESS                │
│ (Evenings & Weekends at the House)   │  │ (Daytime: Noor on the Slopes)        │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ • Noor physically holds the          │  │ • Daughter's smartphone stays at     │
│   daughter's smartphone.             │  │   the house (connected to a charger).│
│ • Camera & Multimodal Vision:        │  │ • Noor is 2 km away on the coffee    │
│   Noor scans diseased leaves offline.│  │   slope with her basic button phone. │
│ • Airplane Mode = ON.                │  │ • Noor sends an SMS:                 │
│   Zero wireless signals needed.      │  │   "Yellow spots under coffee leaves" │
│ • Local AI (MiniCPM-V or MobileNet)  │  │ • Daughter's phone intercepts SMS,   │
│   analyzes the leaf directly on the  │  │   runs the on-device Small AI,       │
│   phone screen.                      │  │   and texts Noor back automatically! │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

---

### 1. Image Handling: Photos Become Text for a Text-Only Reasoner

Noor sends **a photo plus a question** (voice or text). The photo never reaches the LLM as pixels. Small classifiers turn it into a short, structured **photo report**. Code merges that report with the question and the retrieved knowledge-base snippets, then passes everything to MiniCPM5-1B.

```
┌──────────────┐   ┌──────────────┐   ┌───────────────────────────┐   ┌────────────────────┐
│ Photo        │──►│ Quality gate │──►│ Router (scene + crop)     │──►│ Specialist head    │──┐
└──────────────┘   │ blur/exposure│   │ shared MobileNetV4 trunk  │   │ for that scene     │  │
                   └──────────────┘   └───────────────────────────┘   └────────────────────┘  │
                                                                                               ▼
┌──────────────┐   ┌──────────────┐   ┌───────────────────────────┐           ┌──────────────────────┐
│ Voice / text │──►│ STT (+ MT)   │──►│ Crop & intent hints       │──────────►│ Resolver (code):     │
└──────────────┘   └──────────────┘   │ ("my beans", "price"…)    │           │ thresholds, conflicts│
                                      └───────────────────────────┘           └──────────┬───────────┘
                                                                                         ▼
                                       Photo report + question + SQLite snippets ──► MiniCPM5-1B ──► answer
```

#### Router classes (what is in the photo)
`coffee_leaf` · `maize_leaf` · `bean_leaf` · `maize_grain` · `other / not supported`
(stretch: `maize_field_view` for whole-plot photos)

#### Specialist heads (one small head per scene, shared backbone)
| Head | Classes | Train on | Test on |
| :--- | :--- | :--- | :--- |
| `coffee_leaf` | rust, miner, cercospora, phoma, healthy | BRACOL | **JMuBEN** (different country, de-duplicated) |
| `maize_leaf` | fall armyworm, streak virus, lethal necrosis, leaf blight, leaf spot, healthy | CCMT maize + Makerere FAW + Tanzania maize | Hold out one source per shared class (streak, FAW, healthy) |
| `bean_leaf` | angular leaf spot, bean rust, healthy | Makerere beans | Random split only: **no independent test set exists** (state this) |
| `maize_grain` | mould, insect damage, discoloured, broken, sound | Maize kernel dataset (YOLO labels → per-image labels first) | Held-out split |
| `maize_field_view` *(stretch)* | drought stress, weeds, OK | Eyes on the Ground | Held-out farms |

Class names always carry the crop (`coffee_rust`, `bean_rust`). The three crops all have "rust", but the treatments differ.

#### Resolver: decided in code, not by the LLM
1. **Quality gate:** blurry or dark photo → status `RETAKE`.
2. **Crop agreement:** if the question names a crop and the router agrees → continue. If they disagree, or the router is unsure between two crops → status `ASK_CROP` (one short question: "Is this maize or beans?"). This replaces a crop-selection button on every photo.
3. **Router says `other`** → status `UNSUPPORTED`.
4. **Head confidence:** top score and margin over the runner-up above threshold → `CONFIDENT`, otherwise `UNCERTAIN`. Calibrate with temperature scaling and set the thresholds on the test sets above; do not hard-code guesses.

Example photo report injected into the prompt:
```
[PHOTO REPORT]
scene: maize_leaf (0.96) | crop named in question: maize (agrees)
finding: maize_fall_armyworm (0.84) | runner-up: maize_leaf_blight (0.09)
photo quality: ok
status: CONFIDENT
```

#### Why this instead of a vision-language model
* **Keeps MiniCPM5-1B**, which is text-only (~0.5 GB at Q4).
* **The fail-safe is deterministic.** Calibrated scores and thresholds are checked in code. The 1B model never judges its own visual certainty, which matters for the Pass/Fail criterion.
* **No made-up visual findings.** The LLM only sees labels from a fixed list.
* **Trained on our field datasets.** A small VLM would not know BRACOL, JMuBEN or the Makerere data without a separate fine-tune.
* **Limitation (state it in the video):** anything outside the label set (a black branch, berries, roots, a new pest) returns "not supported — ask a person".
* *Alternative considered:* `Qwen3.5-0.8B` (natively multimodal, Apache-2.0). Revisit only if open-ended visual questions become a requirement.

#### What happened to XGBoost (old "Option B")
Fusing image embeddings with rainfall, altitude and month needs photos that **carry their own location and date**. BRACOL, JMuBEN and the other coffee sets do not, so for coffee those features would be invented. **Eyes on the Ground** (Kenyan maize plot photos, each with GPS and timestamp) does carry them: join CHIRPS / NASA POWER per photo and train XGBoost on `[embedding + weather]` for the `maize_field_view` head. **Stretch goal only.**

---

### 2. The Complete End-to-End Model Stack (< 1.5 GB Active RAM)

Every component is chosen to execute sequentially on the daughter's **4 GB RAM Android device**. *RAM and size figures are estimates: benchmark on the actual phone.*

| Pipeline Stage | Model Selected | Parameters / Size | Format & Runtime | Memory Footprint |
| :--- | :--- | :--- | :--- | :--- |
| **1. Audio Input (STT)** | **`whisper-tiny`** (or Meta MMS, CC BY-NC) | 39M params (~75 MB) | INT8 ONNX / TFLite | ~120 MB RAM (unloaded after audio) |
| **2. Translation** | **`Helsinki-NLP/opus-mt`** (or NLLB-600M, CC BY-NC) | 74M params (~65 MB) | 8-bit CTranslate2 / ONNX | ~100 MB RAM |
| **3. Photo → Text** | **`MobileNetV4-Conv-Small`** trunk + router + 4 heads | ~3.8M params (~5–10 MB) | TFLite / ONNX | ~35–50 MB RAM |
| **4. RAG Retrieval** | **SQLite with FTS5 / `all-MiniLM-L6-v2`** | 22M params (~45 MB) | SQLite local file | ~50 MB RAM |
| **5. Core Reasoner** | **`openbmb/MiniCPM5-1B`** (text-only) | 1.08B params (~0.5 GB) | 4-bit GGUF (`Q4_K_M`) | **~1.1 GB RAM** |
| **Total Disk Size** | | **~790 MB Total** | | **Peak RAM: ~1.25 GB** |

---

### 3. Datasets

Brief rule (Section 7.2): name every dataset, its source, license and size, **and what it does not cover**. That last part is scored.

**Stand-in geography:** Ondera is fictional. Most of the usable data is East African (Uganda, Kenya, Tanzania), so use **Uganda** as the stand-in for prices, speech and statistics. *(Team decision: confirm.)*

#### 3.1 Data you build with

**Photos (classifier heads)**
| Dataset | Content | License | Role |
| :--- | :--- | :--- | :--- |
| [BRACOL](https://data.mendeley.com/datasets/yy2k5y8mxg/1) | 1,747 Arabica leaf photos (Espírito Santo, Brazil), labelled with main stress + severity; 2,147 symptom crops | CC BY 4.0 | `coffee_leaf` training. Leaves on a **white background**: apply field augmentation (affine, shadows, noise, foliage backgrounds). Recount classes from the CSV; don't quote per-class numbers until then. |
| [JMuBEN + JMuBEN2](https://data.mendeley.com/datasets/t2r6rszp5c/1) | 58,555 Arabica leaf images, Kirinyaga, Kenya; same 5 classes as BRACOL | CC BY | `coffee_leaf` **test set** (from another country). Images are rotated/flipped copies of fewer originals: **de-duplicate before splitting**. Check that the BRACOL ↔ JMuBEN label names match. |
| [RoCoLe](https://pmc.ncbi.nlm.nih.gov/articles/PMC6727496/) | 1,560 Robusta leaf photos, Ecuador, real backgrounds; rust levels 1–4, red spider mite | check | Extra field-condition test for rust |
| [CCMT](https://data.mendeley.com/datasets/bwh3zbpkpv/1) | 24,881 raw field images, Ghana: maize (5,389), cassava, cashew, tomato | check | Maize → `maize_leaf`; **cassava, cashew, tomato → `other`** |
| [Tanzania maize](https://pmc.ncbi.nlm.nih.gov/articles/PMC10998077/) (NM-AIST/TARI, Harvard Dataverse) | 18,148 smartphone photos: lethal necrosis, streak virus, healthy | check | `maize_leaf` |
| [Makerere fall armyworm](https://air.ug/?page_id=3464) | 2,699 maize images, healthy vs FAW, Uganda | check | `maize_leaf` |
| [Makerere beans / iBean](https://github.com/AI-Lab-Makerere/ibean) | 15,335 field images, Uganda: angular leaf spot, bean rust, healthy | check | `bean_leaf` |
| [Maize kernel defects](https://doi.org/10.3390/data11070175) (Harvard Dataverse) | 5,143 smartphone images, 13,533 labelled kernels: mould, insect damage, discolouration, breakage | CC BY 4.0 | `maize_grain`. **Visible mould is not an aflatoxin test.** Output "risk, get it tested", never "safe". |
| [PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset) | 2,598 web-scraped images, 13 species | CC BY 4.0 | Non-target crops → `other`; corn classes as extra `maize_leaf` data. Labels are noisy. |
| [Makerere cassava](https://air.ug/?page_id=3464) | Cassava field images, Uganda | check | `other` only |
| [Eyes on the Ground](https://source.coop/lacuna/eyes-on-the-ground) | 28,077 maize plot photos, Kenya, each with GPS + timestamp; damage, growth stage, yield labels | CC BY-SA 4.0 | **Stretch:** `maize_field_view` + XGBoost with weather |
| [CoLeaf-DB](https://pmc.ncbi.nlm.nih.gov/articles/PMC10293970/) | 1,006 coffee leaves, Peru, nutrient deficiencies (N, P, K, Mg, B…) | check | **Stretch:** "yields dropped, no visible disease" |

**Prices (SQLite tables, never invented)**
| Source | Covers | Notes |
| :--- | :--- | :--- |
| [WFP food prices via HDX](https://data.humdata.org/dataset/wfp-food-prices-for-uganda) | Maize, beans (monthly, by market) | **No coffee.** CC BY 4.0. Columns: `date, admin1, admin2, market, commodity, unit, pricetype, currency, price, usdprice`. |
| MAAIF Coffee Department (formerly UCDA) farm-gate prices | Arabica parchment, FAQ, kiboko in UGX/kg | Exactly what Noor sells. E.g. Sep 2025 Arabica parchment 16,000–17,000 UGX/kg. Taken from published reports and posts; no bulk download. |
| [World Bank Pink Sheet](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-July-2026.pdf) | Monthly international Arabica price ($/kg) | Monthly Excel available. International reference only. |
| [Fairtrade Minimum Price](https://dailycoffeenews.com/2026/08/04/fairtrade-international-raises-price-minimums-again/) | Washed Arabica **$1.80/lb**, **$2.00/lb from 1 Dec 2026**; premium $0.20/lb | Set for *green* coffee, not parchment. Any parchment "floor" derived from it must state the conversion ratio and be labelled **derived**. |
| [RATIN (EAGC)](https://ratin.net/) | Maize and dry-bean prices, East Africa | Optional; mostly in reports. |

Store `source` and `date` on every price row. If the newest price is older than a set age, the answer must say it is out of date.

**Timing and pest pressure (SQLite tables)**
| Source | Use |
| :--- | :--- |
| [FAO Crop Calendar](https://data.apps.fao.org/catalog/dataset/crop-calendar-by-country-crop-and-activity) | Sowing/harvest windows by agro-ecological zone (44 countries) for maize/bean planting advice |
| CHIRPS | Rainfall and rainy-season onset for the stand-in district (precomputed small table) |
| [NASA POWER](https://power.larc.nasa.gov/) | Temperature and humidity (rust risk), no registration |
| [FAMEWS](https://data.apps.fao.org/catalog/dataset/fall-armyworm-traps-famews-global-latlon) (FAO) | Fall armyworm trap/scouting reports → "armyworm reported nearby" alert |
| iSDAsoil / SoilGrids | *Optional:* soil pH and nutrients for "why are yields down" |

**Language and speech** (pick the local language first; the brief requires naming it)
| Dataset | Use | License |
| :--- | :--- | :--- |
| [WAXAL](https://blog.google/intl/en-africa/company-news/outreach-and-initiatives/introducing-waxal-a-new-open-dataset-for-african-speech-technology/) (Google, Feb 2026) | 21 African languages, ~1,250 transcribed hours (incl. Luganda, Swahili, Acholi): STT fine-tune/eval | Permissive (check per language) |
| [Sunbird SALT](https://huggingface.co/datasets/Sunbird/salt) | 25k sentences, English + Luganda, Runyankole, Acholi, Lugbara, Ateso, Swahili; agriculture among topics; speech for some | CC BY-SA 4.0 |
| Mozilla Common Voice | STT training | CC0 |
| FLEURS / FLORES-200 | Benchmarks for STT / translation | CC BY 4.0 / CC BY-SA 4.0 |
| [Kallaama](https://www.openslr.org/151/) | 125 h farming speech (Wolof, Pulaar, Sereer) | Only if the stand-in is Senegal |

#### 3.2 Data that shows the problem (cite, do not train on)
LSMS-ISA (Uganda National Panel Survey: plot yields, crop sales prices, extension visits), FAOSTAT (yields, producer prices), GSMA Mobile Gender Gap, Global Findex, OpenCelliD, WDI / Microdata Library / HDX.

#### 3.3 Dropped
| Dataset | Reason |
| :--- | :--- |
| PlantVillage | Studio images; better field data exists for all three crops |
| Digital Earth Africa, Sentinel-2 / Landsat | 10–30 m pixels on a 2 ha shaded plot; too much work for a weekend |
| WorldPop, OpenStreetMap, VIIRS | Not needed for this tool |
| OPUS | Only needed if training our own translation model |
| MASSIVE | Intents are home-assistant (alarms, music); write our own intent list instead |
| AI4Bharat / IndicVoices | South Asian languages |
| YouTube transcripts | Can't be verified; unclear license |

#### 3.4 What the data does not cover (put this in the video)
* **Coffee:** white backgrounds (BRACOL); two countries only; no coffee berry disease or berry borer photos; leaves only.
* **Beans:** a single source (Makerere), so no test on data from another source.
* **Maize:** good field coverage; grasshopper and leaf beetle only from Ghana.
* **Grain:** visual defects only; no toxin measurement.
* **Prices:** coffee farm-gate prices only from Uganda reports; nothing for the fictional Ondera market.
* **Anything else in a photo** → `UNSUPPORTED`.

---

### 4. The Fine-Tuning Strategy (LoRA on the LLM)

Do not fine-tune the LLM on raw Wikipedia text. Fine-tune **`MiniCPM5-1B`** using **QLoRA** on structured prompts made of photo report + question + retrieved snippets. Teach it to treat the photo report and price rows as the **only** facts, and to follow the status set by the resolver.

#### The LoRA Configuration:
* **Quantization:** 4-bit NormalFloat (`nf4`) via `bitsandbytes`.
* **LoRA Rank ($r$):** 16, **Alpha ($\alpha$):** 32.
* **Target Modules:** `["q_proj", "v_proj", "k_proj", "o_proj"]`.
* **Adapter Size:** Only **~12 MB**.

#### The Training Data Schema (Create 300–500 JSONL pairs)
Cover every decision type: diagnosis (all three crops), grain quality, planting time, price, and text-only questions with no photo. These pairs are **synthetic**: label them as such in the submission (Section 7.2 of the brief).

```json
{
  "instruction": "Answer using only the photo report, price rows and snippets. Follow the status.",
  "input": "[PHOTO REPORT] scene: maize_leaf (0.96) | crop named in question: maize (agrees) | finding: maize_fall_armyworm (0.84) | runner-up: maize_leaf_blight (0.09) | quality: ok | status: CONFIDENT\n[SNIPPET plantwise:faw-01] ...\nQuestion: 'What is eating my maize?'",
  "output": "{\"crop\": \"maize\", \"condition\": \"Fall armyworm\", \"confidence\": 0.84, \"advice\": \"<from snippet faw-01>\", \"source\": \"plantwise:faw-01\", \"escalate_to_officer\": false}"
}
```

```json
{
  "instruction": "Answer using only the photo report, price rows and snippets. Follow the status.",
  "input": "[PRICE] Arabica parchment, farm-gate, 16,000-17,000 UGX/kg, source: MAAIF, 2025-09\nQuestion: 'The buyer offers 12,000 for my parchment. Is that fair?'",
  "output": "{\"crop\": \"coffee\", \"price_advice\": \"12,000 is 25% below the lowest farm-gate price reported for September 2025 (16,000). This price may be out of date — check with the cooperative before selling.\", \"source\": \"MAAIF 2025-09\", \"escalate_to_officer\": false}"
}
```

*Include ~15% fail-safe examples, one group per resolver status, to satisfy the Pass/Fail criterion:*
```json
{
  "instruction": "Answer using only the photo report, price rows and snippets. Follow the status.",
  "input": "[PHOTO REPORT] scene: other (0.71) | status: UNSUPPORTED\nQuestion: 'Why is the branch black?'",
  "output": "{\"condition\": \"Not supported\", \"advice\": \"Not sure — ask a person. Do not spray chemicals yet.\", \"escalate_to_officer\": true, \"referral\": \"Logged for Sub-county Extension Officer visit.\"}"
}
```
Other statuses to cover: `UNCERTAIN` (low score/margin), `RETAKE` (bad photo), `ASK_CROP` (question and photo disagree), stale price, and grain mould (always "get it tested").

---

### 5. The RAG / Knowledge Base Component

To avoid overloading the 1B LLM with a 1,000-token context window on a 4 GB device:
1. Extract short markdown snippets (under 150 words each, each with a source ID) from:
   * **[CABI PlantwisePlus Knowledge Bank](https://plantwiseplusknowledgebank.org/)**: Pest Management Decision Guides and Factsheets for Farmers (coffee leaf rust, fall armyworm, bean rust, angular leaf spot, maize streak…), available in over 100 languages.
   * **[Access Agriculture](https://www.accessagriculture.org/)**: farmer-to-farmer video scripts in local languages (incl. Ugandan coffee titles).
   * Check reuse terms for both before shipping.
2. Store them in a local **SQLite database** on the phone, next to the price, crop-calendar and weather tables (structured rows, not text).
3. The resolver uses the finding label (e.g. `maize_fall_armyworm`) to fetch the matching protocol and injects it with its source ID.
4. Advice is copied from verified sources and cited, so the model **cannot invent treatments**.

---

### Next Immediate Action Items

1. **Download image data:** BRACOL, JMuBEN (de-duplicate), CCMT, Tanzania maize, Makerere FAW + beans, maize kernel set, PlantDoc. Build the router and the four heads; report results on data from a different source than the training data.
2. **Build the SQLite tables:** WFP maize/bean prices, MAAIF coffee farm-gate prices, FAO crop calendar, CHIRPS/NASA POWER summary for the stand-in district. Every row has `source` + `date`.
3. **Write the resolver and photo-report format,** then generate the synthetic JSONL pairs and train the LoRA.
4. **Prepare the demo set:** one clear coffee-rust photo, one maize FAW photo, one blurry photo (`RETAKE`), one unsupported photo (`UNSUPPORTED`), and one price question against a low offer.
5. **Choose and name the local language;** pick WAXAL / SALT / Common Voice accordingly.
