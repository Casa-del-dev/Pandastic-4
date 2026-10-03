Based on your three design files (`DEMO-A-4.md`, `DEMO-A-5.md`, and `DEMO-A-6.md`), you have a coherent product vision: an **offline multimodal assistant running within 4 GB of RAM**, using **asynchronous SMS between the two phones**, and grounded in **economic fair prices and verified agronomic data**.

Below is the complete architectural handoff, with concrete recommendations for your classifier (including the XGBoost idea), your fine-tuning setup, and the datasets to extract immediately.

---

### 1. The Classifier: Can We Use XGBoost?

**Yes, but in a hybrid architecture.**

Images are raw 3D pixel grids ($3 \times 224 \times 224 = 150,528$ values). Feeding raw pixels into XGBoost directly does not work because tree-based models cannot learn spatial convolutions. 

However, you can use **XGBoost as the Multimodal Decision Head**:

```
┌────────────────────────┐
│  Coffee Leaf Photo     │ ──► [ Lightweight MobileNetV4 Feature Extractor ] ──► 128 Image Embeddings
└────────────────────────┘                                                              │
                                                                                        ▼
┌────────────────────────┐                                                    ┌────────────────────┐
│  Tabular Field Data    │                                                    │      XGBOOST       │
│  • Altitude (Highland) │ ─────────────────────────────────────────────────► │  Decision Head     │
│  • Rainfall (CHIRPS)   │                                                    └─────────┬──────────┘
│  • Month / Season      │                                                              │
└────────────────────────┘                                                              ▼
                                                                             Outputs exact class &
                                                                             calibrated confidence:
                                                                             {"Rust": 0.89, "Miner": 0.04}
```

#### The Two Options:
* **Option A: Pure CNN (MobileNetV4-Conv-Small) — ~5 MB (Simplest & Fastest)**  
  End-to-end deep learning. Takes the leaf image $\to$ outputs softmax probabilities for `[Rust, Miner, Cercospora, Phoma, Healthy]`.
* **Option B: MobileNet Feature Extractor + XGBoost (High Innovation Score)**  
  Pass the image through MobileNet to get a 128-dimensional embedding vector, concatenate with 3 tabular fields from the brief (Rainfall from CHIRPS, Month, and Plot Altitude from LSMS-ISA), and train XGBoost on the combined vector.
  * *Why evaluators will like this:* It combines satellite/climate data (Section 7.3 C) with computer vision into a single tabular+vision decision model.

---

### 2. The Complete End-to-End Model Stack (< 1.5 GB Active RAM)

Every component is chosen to execute sequentially on the daughter's **4 GB RAM Android device**:

| Pipeline Stage | Model Selected | Parameters / Size | Format & Runtime | Memory Footprint |
| :--- | :--- | :--- | :--- | :--- |
| **1. Audio Input (STT)** | **`whisper-tiny`** (or Meta MMS) | 39M params (~75 MB) | INT8 ONNX / TFLite | ~120 MB RAM (unloaded after audio) |
| **2. Translation** | **`Helsinki-NLP/opus-mt`** (or NLLB-600M) | 74M params (~65 MB) | 8-bit CTranslate2 / ONNX | ~100 MB RAM |
| **3. Leaf Classifier** | **`MobileNetV4-Small`** (+ optional XGBoost) | 3.8M params (~5 MB) | TFLite / ONNX | ~35 MB RAM |
| **4. RAG Retrieval** | **SQLite with FTS5 / `all-MiniLM-L6-v2`** | 22M params (~45 MB) | SQLite local file | ~50 MB RAM |
| **5. Core Reasoner** | **`openbmb/MiniCPM5-1B`** (or `Qwen3.5-0.8B`) | 1.0B params (~600 MB) | 4-bit GGUF (`Q4_K_M`) | **~1.1 GB RAM** |
| **Total Disk Size** | | **~790 MB Total** | **Fits inside a $0.50 3G bundle** | **Peak RAM: ~1.25 GB** |

---

### 3. Which Datasets to Extract & Use Right Now

From the list in **Annex B.2 and Section 7.3**, here are the three datasets to download and prepare:

#### Dataset 1: `BRACOL` (The Arabica Coffee Leaf Dataset)
* **What is in it:** 1,747 smartphone photos of Arabica coffee leaves taken in mountainous regions (Santa Maria, Brazil), classified into:
  1. `Rust` (*Hemileia vastatrix*) [CLR] — 621 markings
  2. `Miner` (*Leucoptera coffeella*) — 540 markings
  3. `Cercospora` (*Brown Eye Spot*) — 274 markings
  4. `Phoma` (*Phoma costaricensis*) — 464 markings
  5. `Healthy`
* **Metadata Structure:** Contains image files + CSV labeling the primary biotic stress and severity (Healthy, Very Low, Low, High, Very High).
* **The Image Preprocessing You Outlined (`DEMO-A-6.md`):**
  * *The Reality:* Original BRACOL leaves were placed on partially white backgrounds.
  * *Your Augmentation Pipeline:* Apply random affine transformations, shadow injection, Gaussian noise, and overlay natural foliage backgrounds to simulate real field conditions on Noor's mountain slope.

#### Dataset 2: `PlantDoc` (Real-World Field Noise Counterweight)
* **What is in it:** 2,598 images across 13 plant species scraped from uncontrolled outdoor field conditions (with dirt, shadows, and hands holding leaves).
* **How to use it:** Mix 200–300 background samples from PlantDoc into your BRACOL training run to prevent the classifier from overfitting to clean studio backgrounds.

#### Dataset 3: `WFP Food Prices via HDX` (The Middleman Price Reference)
* **What is in it:** CSV database from the UN World Food Programme tracking domestic market commodity prices by region, market, and date.
* **Extracted Schema for Noor:**
  ```csv
  date,country,market,commodity,unit,price_local_currency,fair_price_floor
  2024-08,Region_East,Ondera_District,Coffee (Parchment),KG,280,265
  2024-08,Region_East,Ondera_District,Maize,KG,45,40
  2024-08,Region_East,Ondera_District,Dry Beans,KG,110,98
  ```
* **Why it matters:** Noor grows **coffee** on the upper slope, and **maize and beans** below (Page 5). This table gives her the data to challenge low middleman offers.

---

### 4. The Fine-Tuning Strategy (LoRA on the LLM)

Do not fine-tune the LLM on raw Wikipedia text. Fine-tune **`MiniCPM5-1B`** using **QLoRA** on structured triage and negotiation prompts.

#### The LoRA Configuration:
* **Quantization:** 4-bit NormalFloat (`nf4`) via `bitsandbytes`.
* **LoRA Rank ($r$):** 16, **Alpha ($\alpha$):** 32.
* **Target Modules:** `["q_proj", "v_proj", "k_proj", "o_proj"]`.
* **Adapter Size:** Only **~12 MB**.

#### The Training Data Schema (Create 200–400 JSONL pairs):
```json
{
  "instruction": "Evaluate field diagnosis and economic advice.",
  "input": "Classifier detected: Coffee Leaf Rust (Confidence: 89%). Market parchment price is 240, buyer offers 190. Question: 'What should I do?'",
  "output": "{\"condition\": \"Coffee Leaf Rust\", \"confidence\": 0.89, \"treatment\": \"Prune infected lower branches. Apply approved copper-based fungicide before seasonal rains.\", \"price_advice\": \"Fair market floor is 265 per KG. Middleman offer of 190 is 28% below benchmark. Negotiate or pool with Ondera Cooperative.\", \"escalate_to_officer\": false}"
}
```

*Include 15% fail-safe examples to satisfy the Pass/Fail criteria:*
```json
{
  "instruction": "Evaluate field diagnosis and economic advice.",
  "input": "Classifier detected: Unknown / Blurry (Confidence: 41%). Question: 'Why is the branch black?'",
  "output": "{\"condition\": \"Uncertain\", \"confidence\": 0.41, \"treatment\": \"Not sure — ask a person. Do not spray chemicals yet.\", \"price_advice\": \"N/A\", \"escalate_to_officer\": true, \"referral\": \"Logged for Sub-county Extension Officer visit.\"}"
}
```

---

### 5. The RAG / Knowledge Base Component

To avoid overloading the 1B LLM with a 1,000-token context window on a 4 GB device:
1. Extract short markdown snippets (under 150 words each) from:
   * Standard Arabica coffee pest management guides (FAO / East African Coffee Extension protocols).
   * Verified YouTube transcripts on Coffee Leaf Rust and Coffee Berry Borer pruning techniques.
2. Store them in a local **SQLite database** on the phone.
3. When the classifier predicts `"Coffee Leaf Rust"`, the app pulls the corresponding treatment protocol from SQLite and injects it into the prompt.
4. This ensures deterministic, verified treatment instructions with **zero hallucination**.

---

### Next Immediate Action Items

1. **Download BRACOL:** Grab the images and labels from Mendeley Data or Kaggle to set up your MobileNet training folder.
2. **Build the WFP Price Table:** Pull 20 rows of historical coffee/maize/bean price series into a local CSV or SQLite table.
3. **Assemble the Evaluation Script:** Prepare your two test images (one clear coffee leaf rust image, one blurry image) to demonstrate both the accurate diagnosis and the fail-safe guardrail during your video presentation.