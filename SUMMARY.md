# Pandastic: our entry, point by point against the challenge brief

**Track:** Agriculture (Annex B) · **Prototype:** [github.com/Casa-del-dev/Pandastic-4](https://github.com/Casa-del-dev/Pandastic-4)
· **Video:** _link to add_ · **Details:** [README](README.md), [data and results](docs/DATA.md),
[demo and video script](docs/DEMO.md)

Pandastic is an offline farm helper for Noor. It runs on the one smartphone in her house, her daughter's. Noor texts
it from her own basic phone while she is on the slope, in Swahili or English, and it answers by SMS within seconds.
At home, it checks a photo of a coffee, maize or bean leaf on the phone itself. Before she sells, it tells her how a
buyer's offer compares with the official price. Nothing goes over the internet: questions and answers travel as
ordinary SMS, and the AI runs on the phone.

| Brief section | Where it is answered here |
| :-- | :-- |
| §05 What you will build: prototype, AI value, proof | [1](#1-the-challenge-and-the-decision-it-improves), [2](#2-what-we-built), [3](#3-the-ai-and-why-a-simpler-tool-would-not-do), [7](#7-evidence-it-works) |
| §06 Rules and AI guardrails | [4](#4-the-rules-06), [5](#5-guardrails-and-responsible-ai-06-and-the-09-passfail) |
| §07 Data: the problem, what we build with, what it does not cover | [6](#6-data-07) |
| §08 Deliverables | [10](#10-deliverables-08) |
| §09 Judging criteria | [11](#11-judging-criteria-09) |
| §02 and Annex B preconditions; §09 scalability | [8](#8-preconditions-02-annex-b), [9](#9-scalability-replicability-and-what-happens-next) |
| §03 What localizing AI development means to us | [12](#12-our-take-what-localizing-ai-development-means-to-us) |

## 1. The challenge and the decision it improves

**Annex B:** Noor's coffee yields have dropped and she cannot say why; the extension officer comes twice a year; at
harvest the middleman names the price. The brief asks for a Small AI solution that helps her make, communicate or act
on one better agricultural decision.

Pandastic helps with two decisions she takes alone today:

- **What is wrong with this leaf, and should I spray?** It identifies a crop problem from a photo or a description,
  with cited advice. When the evidence is weak it says "not sure, don't spray yet, ask the officer".
- **Is this buyer's price fair?** It connects her harvest to an independent, dated price reference before she sells.

**Problem statement** (§08 format): *Because of Pandastic, Noor will check a sick coffee leaf or a buyer's price on the
same day, by SMS from the slope or by photo at home, which she would otherwise do months late or not at all. We know
because one extension worker serves about 1,800 farmers in Uganda (1:500 is recommended), and the official coffee
farm-gate price moved 25% in 21 months* ([sources in §6.1](#61-the-problem-is-real)).

We use **Uganda and its shilling (UGX)** as a stand-in for the fictional Ondera highlands: Uganda grows Arabica in the
highlands, maize and beans below, and publishes monthly coffee farm-gate prices.

## 2. What we built

A working Android app (Java and React, bundled, offline). The phone's owner chooses one of two modes when setting it up:

- **Capable phone** (the daughter's smartphone, target 4 GB RAM): answers SMS automatically, checks photos, and has a
  chat for questions on the phone itself.
- **Basic phone:** a plain SMS chat for a phone too small for the models. Noor needs nothing: her phone's normal SMS app
  is enough.

**Where it sits in Noor's day:**

1. **On the slope, daytime.** She texts the house phone from her basic phone, for example `P 1 12000` ("is 12,000 a
   fair coffee price?") or *"majani ya kahawa yana madoa ya njano"* ("the coffee leaves have yellow spots"). Within
   seconds, the reply arrives in the same SMS thread, in her language, in at most two SMS. For the price, it gives the
   official farm-gate price with its source and month, and says the offer is 23% below it. For a symptom in words, it
   names what it may be, says "don't spray yet", and says to show a photo or ask the extension officer.
2. **At home, evening.** She (or her daughter) photographs a leaf. The phone checks that the photo is sharp, bright
   enough and actually shows a plant, then gives a finding with cited advice, or "not sure, ask a person", or "take the
   photo again".
3. **Before selling.** The same price check works by SMS or in the app, for coffee, maize and beans.

The daughter's phone shows each conversation. The SMS helper runs in the background with a visible notification, and
it only answers numbers the owner has listed. It answers only farming messages; family messages ("how is school?")
get no automatic reply.

## 3. The AI, and why a simpler tool would not do

| AI capability | What it does in Pandastic | Why SMS menus, a spreadsheet or a search would not do the same |
| :-- | :-- | :-- |
| **Computer vision**: leaf classifier, 3 × EfficientNet-B0 averaged in one 13 MB model, run on the phone (ONNX Runtime) | Names one of 10 leaf diseases and pests, or "healthy", for coffee, maize and beans, or says the photo is not a crop leaf | A menu or a spreadsheet cannot look at a leaf. A web search needs data, the right words and trust in the source |
| **Language understanding**: Qwen3.5-0.8B, fine-tuned by us on farmer-style SMS, run on the phone (llama.cpp) | Reads a messy SMS (misspellings, slang, mixed Swahili and English, some Luganda) into a fixed form: what she asks, which crop, which symptom | Keyword matching alone gives the right reply for 83% of our honest test SMS. With the model reading what the keywords miss, it is 93% |
| **Speech, in the app**: offline speech-to-text (Whisper Tiny, English and Swahili) and the phone's text-to-speech | Lets the person at the smartphone speak a question and hear the answer | Helps where reading and typing are hard; no internet needed |

**What is deliberately not AI.** The price comparison is arithmetic in code. The words of every SMS reply are fixed
templates and cited advice rows. The confidence thresholds are code. The models only pick labels and fill slots. A
price check on its own could be a plain SMS service. The AI adds value where the input is a photo or free text, and
because both work offline on a phone the family already owns.

**The model also shows its work.** Each reply ends with one fixed line naming what the phone's AI understood
("AI ya simu imeelewa: bei, kahawa, 12,000" = "the phone's AI understood: price, coffee, 12,000"), so a wrong reading is
visible. In the daughter's chat (not in SMS), the model may also reword the fixed answer. Code checks every rewrite,
and the fixed answer is always shown underneath it.

## 4. The rules (§06)

| Rule | How Pandastic meets it | Honest caveat |
| :-- | :-- | :-- |
| Runs on a device the user already has | Noor uses her own basic phone and its normal SMS app; nothing to install. The AI runs on the household's smartphone. | Tested on Android emulators (two phones and a simulated carrier), not yet on a real phone |
| Core feature works offline | Questions and answers use carrier SMS only. Models, advice and prices are on the phone, and the app's interface blocks every network load. | The only internet use is an optional, one-time download of the language model, which the owner must choose |
| Model files small enough to side-load or send over a weak connection | Leaf model 13 MB and knowledge base 0.4 MB, both inside the app. The language model (542 MB, 4-bit) is optional: copied from a file, or downloaded once (it resumes, and its checksum is verified). The app works fully without it. | The app itself is about 90 MB (arm64), including a 32 MB offline speech model |
| At least one interaction in a local language; name it; how it fares in a less-supported one | **Swahili** (replies in Swahili by default; every message, menu and advice text exists in Swahili) and English. **Less-supported: Luganda.** The app knows the Luganda words for the three crops, and the model reads a Luganda problem report ("emmwanyi zange zirwadde…", "my coffee is sick…") as a coffee problem. The reply is then the safe "not sure, ask the officer", in Swahili. There is no Luganda advice text. | Our Swahili is machine-translated and still needs a native speaker's review. A small model cannot write Swahili reliably (it produces non-words), so all Swahili the farmer reads is fixed text ([docs/LLM-WRITING.md](docs/LLM-WRITING.md)) |

## 5. Guardrails and responsible AI (§06, and the §09 pass/fail)

**Fail-safe: "not sure, ask a person".**
- Every answer has a status. Anything other than a confident photo result or a price ends with "ask a person", and
  every symptom answer adds "don't spray yet".
- **Text alone is never a confident diagnosis.**
- A photo is answered confidently only above a minimum probability chosen on photos the model never trained on.
  "Healthy" needs the strictest threshold (0.99 for coffee), because a wrong "healthy" is the worst answer: the farmer
  does nothing.
- Blurry, dark or non-plant photos get "take it again" or "this is not a leaf we know".

**Avoiding hallucinations.**
- The answer comes from a **fixed list**: templates and advice rows, each citing its source.
- The language model is held to a grammar, so it can only output allowed labels. Code decides which of its readings
  to use: keywords win, and the model fills only what they missed.
- It never chooses the crop, the price or the language.
- We tested whether small models could write the replies. They write Swahili non-words and, in every language, sometimes
  reverse the meaning ("that's a fair price" for an offer 23% below). So automatic SMS always carry the fixed text.

**Human in the loop.**
- The tool informs and flags uncertainty; it never acts for the farmer. It does not send anything to an officer or a
  buyer.
- The phone's owner opts in to automatic SMS replies and chooses which numbers get them.
- Prices carry source and date, and a price older than 120 days is flagged as old.

**Privacy and consent.**
- No message, photo or answer leaves the phone. The SMS log stays on the daughter's phone and can be cleared.
- Family messages that are not farming questions get no reply, and the log records only that one arrived, not its text.
- No personal data was used for training: the SMS training and test data are synthetic, written by the team, and the
  photos come from public, licensed datasets.
- The allowlist limits cost (10 answers per number per hour, 30 in total). It is not authentication, because caller ID
  can be spoofed.

**Bias.**
- Coffee photos come from Brazil, Kenya and Ecuador, maize from Ghana and beans from Uganda: we have no Ugandan coffee
  photos. Results are therefore reported per source, on photos held out from training.
- Swahili and English are covered; Luganda and other local languages only weakly.
- The design starts from the fact that Noor does not hold the smartphone herself: she uses her own basic phone.

## 6. Data (§07)

Full tables with links, licences and sizes: [docs/DATA.md](docs/DATA.md).

### 6.1 The problem is real

| Claim | Number | Source (year, country) |
| :-- | :-- | :-- |
| Too few extension officers | 1 extension worker per ~1,800 farmers, against 1:500 recommended | UFAAS policy brief (2023, Uganda); Auditor General report (2024, Uganda) |
| Coffee is a smallholder crop, mostly sold alone | ~1.8 million coffee households; 23% in producer cooperatives; 0.45 ha average | ILO coffee value-chain mapping (2024, Uganda) |
| The price reference goes stale fast | Arabica parchment farm-gate price UGX 12,500–16,750/kg (25% range) over Dec 2024 – Aug 2026 | MAAIF Coffee Department / UCDA monthly reports (2024–2026, Uganda) |
| A woman farmer is less likely to hold the smartphone | Women in sub-Saharan Africa are 22% less likely to own a smartphone; Uganda's gender gap in mobile-internet use is 33% | GSMA Mobile Gender Gap Report (2025) |

### 6.2 Data we build with

| Data | Source | Licence | Size | Used for |
| :-- | :-- | :-- | :-- | :-- |
| BRACOL coffee leaves (Brazil, white background) | Mendeley Data | CC BY 4.0 | ~1,400 readable images | Leaf model training |
| JMuBEN 1 + 2 coffee lesion close-ups (Kenya) | Mendeley Data | CC BY 4.0 | 58,555 images (1,404 distinct) | Leaf model training |
| RoCoLe Robusta leaves on the plant, smartphone photos (Ecuador) | Mendeley Data | CC BY 4.0 | 1,393 photos, split by plant | Training, calibration and test |
| CCMT maize leaves from local farms (Ghana) | Mendeley Data | CC BY 4.0 | 3,472 images | Maize classes |
| iBean bean leaves, field photos (Uganda, Makerere AI Lab) | Hugging Face | MIT | ~1,300 images | Bean classes |
| PlantDoc (other crops' field photos) | GitHub | CC BY 4.0 | ~2,600 images | "Not a supported leaf" |
| Caltech-101 (objects, animals, scenes) | Caltech | CC BY 4.0 | 4,009 images | "Not a plant" |
| EfficientNet-B0 ImageNet weights (timm) | Hugging Face | Apache-2.0 | 5.3 M parameters | Starting point for the leaf model |
| Coffee farm-gate prices | MAAIF / UCDA monthly reports | Government publication | 84 rows, Dec 2024 – Aug 2026 | Price check |
| Maize and bean market prices | WFP via HDX | CC BY-IGO | 2,138 rows, 2024–2026 | Price check |
| Advice for 13 conditions | CABI PlantwisePlus factsheets, Pacific Pests & Pathogens, two papers | CC BY-SA 4.0, CC BY 4.0 and others (per row) | 13 conditions, EN + SW | Advice text, paraphrased and cited |
| Qwen3.5-0.8B language model | Qwen (Alibaba) | Apache-2.0 | 0.8 B parameters, 542 MB at 4 bits | Reading SMS |
| **Synthetic** farmer SMS, written and generated by the team | Ours | Ours | 3,000 for fine-tuning; 220 for evaluation, in four sets | Fine-tuning and testing the SMS reader |
| Swahili/English keywords, Luganda crop words | Ours | Ours | ~200 terms | Understanding SMS without a model |

### 6.3 What the data does not cover

- **No Ugandan coffee leaf photos.** Coffee comes from Brazil, Kenya and Ecuador. A model never trained on Ecuador's
  phone photos answered only 1% of them, so coffee does not transfer well between countries, and performance on Ugandan
  farmers' photos is untested.
- **Leaves only:** no berries, so no coffee berry disease or berry borer. Those photos fall to "not sure".
- **Maize and bean results come from photos of the same source** as their training data (Ghana, Uganda), not another
  country. There are few healthy-maize and fall-armyworm photos.
- **Prices are national monthly averages**, not Noor's market on the day. Maize and bean prices are retail prices,
  higher than what a farmer is paid, and the reply says so.
- **Advice sources are not Ugandan extension material**, and Uganda's pesticide register was not checked. So the advice
  never gives doses and always says to ask the officer before spraying.
- **All SMS test data is synthetic**, written by non-native speakers. Real farmers' spelling and slang will be harder.
- **No crop calendar:** planting questions are referred to the extension officer.

## 7. Evidence it works

All results below are on data the models never trained on. Photo results come from running the real app on an
Android emulator, photo by photo.

| What | Result |
| :-- | :-- |
| Coffee leaves, smartphone photos (RoCoLe, 360 photos of held-out plants) | Answers 65% confidently; **97.4% of those answers are right**; **no rust leaf called healthy**. The rest get "not sure, ask a person" |
| Maize leaves (CCMT, 336 photos) | Answers 79%; 90.6% right (more lead to the right advice, because two leaf spots share the same advice) |
| Bean leaves (iBean, 129 photos) | Answers 100%; 96.1% right; 1 rust leaf called healthy |
| Photos that are not crop leaves (137 random photos: streets, animals, objects) | 1 answered confidently, 136 turned away |
| SMS understanding (30 SMS never used to tune anything) | Right reply 93% with the model, 83% with keywords alone; on another 40 fresh SMS 95% vs 88% |
| End-to-end SMS on two emulator phones (prices, symptoms, Luganda, family messages ignored, allowlist, 2-SMS limit) | 19 of 19 checks pass. Noor's side was also tried with Google's standard Messages app: no Pandastic app needed |
| Every connection between the interface and the on-phone code | 32 of 32 automated checks pass |
| Speed (emulator) | Photo check under 0.1 s; reading an SMS with the language model 4–5 s |
| Memory (emulator, everything loaded) | ~0.93 GB for the app plus ~0.12 GB for its built-in browser process; the language model file is memory-mapped, so Android can reclaim it under pressure |

**Not yet validated:** a real 4 GB phone, real carrier SMS (delays, filtering), the helper surviving a night of
Android battery saving, and sessions with real farmers.

## 8. Preconditions (§02, Annex B)

- **Connectivity:** only a GSM signal for SMS at the house and on the slope. No data bundle, no Wi-Fi.
- **Digital literacy:** Noor only needs to send an SMS, which she already does. Short codes (`P 1 12000`) and plain
  words both work. The smartphone side is set up once, which matches the brief: the daughter is home at weekends to do
  it. Read-aloud and dictation help at the smartphone.
- **Trusted institutions:** every price names UCDA/MAAIF or WFP, and every piece of advice names its source. The tool
  sends Noor back to the extension officer whenever it is unsure, so it supports the officer instead of replacing them.
- **The farmer registry problem** (Annex B): Pandastic does not need a registry to reach Noor, because she starts the
  conversation from her own phone. Reaching farmers at scale still needs a channel such as her coffee cooperative
  (see §9).

## 9. Scalability, replicability and what happens next

**What another setting can reuse:**
- The **phone pattern**: a basic phone texts an AI on the household smartphone. It fits any setting with one
  smartphone per family and no data.
- The **knowledge base** is built from cited CSV files (prices, advice, keywords). Another country, crop or language
  means new rows, not new code.
- The **training pipeline**:
  - photos are split by plant and by source;
  - thresholds are chosen on a separate calibration set;
  - results are reported per crop and per source;
  - every new model is checked through the real app before it is installed.
- No server cost. The running cost is the SMS airtime for replies.

**Next steps, in order:**
1. A real 4 GB phone and real carrier SMS.
2. Sessions with farmers through a coffee cooperative.
3. Native-speaker review of the Swahili.
4. Ugandan coffee leaf photos, collected with farmers' consent.
5. A crop calendar from rainfall data (CHIRPS or NASA POWER) for planting questions.

Further out:
- **Luganda:** keywords and fixed answers written by native speakers.
- **A smarter on-phone model:** trimming the 248,000-token vocabulary to our languages would remove a third of the model
  file (measured). By our estimate, that would let a 2B model fit in today's memory budget.
- A cooperative-run version, where the cooperative's member list serves as the registry.

## 10. Deliverables (§08)

1. **Prototype:** this repository. Build and run instructions are in the [README](README.md); scenarios, model
   install and demo fallbacks are in [docs/DEMO.md](docs/DEMO.md).
2. **Video (2–5 min):** the script is in [docs/DEMO.md §5](docs/DEMO.md), covering every required item:
   - problem statement: [§1](#1-the-challenge-and-the-decision-it-improves) above;
   - AI capabilities and guardrails: [§3](#3-the-ai-and-why-a-simpler-tool-would-not-do) and [§5](#5-guardrails-and-responsible-ai-06-and-the-09-passfail);
   - tool demo: SMS from a basic phone, a leaf photo, a price check, with mobile data off;
   - where it sits in the day: [§2](#2-what-we-built);
   - our take: [§12](#12-our-take-what-localizing-ai-development-means-to-us).

**Tech stack:**
- Android app in Java, with a React interface in a WebView.
- ONNX Runtime for the leaf model, llama.cpp with a grammar for the language model, whisper.cpp for offline dictation.
- SQLite knowledge base.
- Leaf model and fine-tuning trained on Modal (cloud GPUs).
- Everything runs on the phone.

## 11. Judging criteria (§09)

| Criterion (weight) | Our answer |
| :-- | :-- |
| Built solution, Small AI fidelity (25%) | Works end to end on two emulator phones: SMS from a basic phone, photo, price. Offline; models are 13 MB plus an optional 542 MB ([§2](#2-what-we-built), [§4](#4-the-rules-06)) |
| Development relevance and impact (20%) | Two decisions from Annex B: disease and price ([§1](#1-the-challenge-and-the-decision-it-improves)), grounded in Ugandan extension and price data ([§6.1](#61-the-problem-is-real)) |
| Data grounding (15%) | Every dataset with source, licence and size, synthetic data labelled, gaps listed ([§6](#6-data-07)) |
| Evidence it works (15%) | Held-out results per crop through the real app; SMS tests; what is not yet validated ([§7](#7-evidence-it-works)) |
| Clarity, design, inclusivity, value of AI (15%) | Noor's own SMS app, Swahili first, read-aloud and dictation; AI only where a photo or free text needs it ([§3](#3-the-ai-and-why-a-simpler-tool-would-not-do), [§8](#8-preconditions-02-annex-b)) |
| Scalability and what happens next (10%) | Reusable pattern, data-driven knowledge base, next steps ([§9](#9-scalability-replicability-and-what-happens-next)) |
| Responsible AI, data and safety (pass/fail) | "Not sure — ask a person" fail-safe, fixed list of answers, privacy, consent, bias, human oversight ([§5](#5-guardrails-and-responsible-ai-06-and-the-09-passfail)) |

## 12. Our take: what localizing AI development means to us

Localizing AI meant designing for the phone Noor already has and the language she writes in, not for the model we
would have liked to use. In practice it meant three things.

- **Measuring on data that looks like her world.** A coffee model trained on Brazilian leaves on white paper answered
  almost none of the phone photos from another country. Only photos taken on the plant, held out by plant, told us the
  truth.
- **Being honest about the language gap.** Today's small models read Swahili well enough to help, but they do not write
  it well enough to trust, and Luganda is weaker still. So code and cited sources write the answers.
- **Keeping a person in charge.** When the AI is unsure, it says so and points to the extension officer.

The opportunity is real: a 13 MB model and a basic phone can bring a second opinion to the slope the same day. The risk
is a confident wrong answer, so we chose to answer less often and to be right when we do.
