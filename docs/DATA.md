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

### 2.2 Leaf classifier training data (pipeline ready, **not trained yet**; the app ships a labelled stub)

| Dataset | Content | Licence | Size | Role |
| :-- | :-- | :-- | :-- | :-- |
| [BRACOL](https://data.mendeley.com/datasets/yy2k5y8mxg/1) | Arabica leaves, Espírito Santo, **Brazil**, white background | CC BY 4.0 | 1,747 labelled leaves; **the published zip is truncated**, so ~1,400 are readable, of which 1,343 have a single stress (healthy 142, miner 254, rust 465, Phoma 346, Cercospora 136) | Train / validation |
| [JMuBEN](https://data.mendeley.com/datasets/t2r6rszp5c/1) + [JMuBEN2](https://data.mendeley.com/datasets/tgv3zb82nd/1) | Arabica leaves, Kirinyaga, **Kenya**, 128 px crops | CC BY 4.0 | 58,555 images, mostly rotated/flipped copies: the 8,336 rust images are **632 distinct leaves** | Cross-country calibration + test, after rotation/flip-invariant de-duplication |
| [PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset) | Web-scraped field photos, 13 species, no coffee | CC BY 4.0 | ~2,600 images | `other` (not a supported leaf) |
| [iBean (Makerere AI Lab)](https://huggingface.co/datasets/AI-Lab-Makerere/beans) | Bean leaves, **Uganda** field photos | MIT | ~1,300 images | `other` (P0); bean classes (P1, P2) |
| [CCMT (Crop Pest and Disease Detection)](https://data.mendeley.com/datasets/bwh3zbpkpv/1), raw maize photos | Maize leaves from local farms in **Ghana** | CC BY 4.0 | 3,472 images used: fall armyworm 285, healthy 208, leaf blight 1,000, leaf spot 1,000, streak virus 979 (grasshopper and leaf-beetle folders not used) | Maize classes (P2); listed per image with its public S3 URL in `ml/leaf/ccmt_files.csv` |
| timm `mobilenetv4_conv_small` ImageNet weights | Pretrained backbone | Apache-2.0 | 3.8 M parameters | Starting point |

How it is evaluated: thresholds are chosen on half of the de-duplicated Kenyan images, and accuracy, coverage and
the share of `other` photos wrongly accepted are reported on the other half only (`ml/README.md`).

### 2.3 SMS understanding (all **synthetic**, written or generated by the team)

| Set | Size | Use |
| :-- | :-- | :-- |
| `ml/llm/eval_sms.csv` | 100 SW/EN/mixed SMS with gold slots | Dev set: used to tune the keyword lexicon |
| `ml/llm/eval_sms_heldout.csv` | 50 SMS, written before any results | Held-out test, never used for tuning |
| `ml/llm/gen_train.py` | 3,000 template-generated SMS (none duplicates an eval text) | Ready-to-train LoRA for Qwen3.5-0.8B (not run yet) |

Results so far (`ml/reports/nlu_eval.md`), held-out set, share of messages with **all** slots right:
keywords **68%**, Qwen3.5-0.8B alone **34%**, keywords + Qwen filling only the intent and crop **78%** (intent 80% → 96%).
The base model invents symptoms, so the app never takes a symptom from it.

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
  backgrounds) and Kenya (small crops). Performance on Ugandan phone photos is untested.
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
