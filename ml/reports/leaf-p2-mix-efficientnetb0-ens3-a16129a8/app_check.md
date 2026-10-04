# App check before install (O1, 2026-10-04, B)

Every held-out photo was sent through the real app on an Android emulator (x86_64, API 35, debug build) with
`scripts/photo-eval.mjs`. Each photo is shrunk by the WebView exactly as the UI does it (640 px JPEG, quality 0.88)
and then goes through `checkPhoto`: Android bitmap, quality gate, ONNX Runtime, thresholds, Resolver. Photos:
RoCoLe test plants (coffee, Ecuador phone photos, the `mix` split), the CCMT and iBean test split of
`manifest-p2-mix.csv` (4 CCMT files the WebView cannot decode are left out), 117 random everyday photos
(`data/raw/picsum`) and 20 more random photos.

## Why the floors changed

The laptop copy of the app path (`class_thresholds.app_input`) gave the same probabilities as the app for the
previous model, ens3 (±0.01). It did not for this EfficientNet-B0 ensemble (one rust photo: 0.92 laptop, 0.75 app).
The app's last resize is `Bitmap.createScaledBitmap(…, true)` from 640 to 224 px, which is not antialiased; PIL's
resize, used for training and the laptop copy, is. With the branch's floors (coffee_healthy 0.95, maize 0.85), the
app called **8 of 161 rust leaves healthy** (ens3: 3).

The floors were therefore chosen again on the **calibration** photos run through the app
(`app_check_calib_branch_floors.csv`, `python -m leaf.app_floors`): each crop's answers ≥ 90% right, and each
`*_healthy` answer ≥ 99% right. Result: coffee_healthy 0.99, maize_healthy 0.98, other maize labels 0.82,
bean_healthy 0.54. The 99% target was set after the 8/161 test result had been seen.

## Held-out test photos through the app

Answered (CONFIDENT) / right when answered / a sick leaf called healthy.

| Photos | ens3 (`app_check_test_ens3.csv`) | this model, installed floors (`app_check_test.csv`) |
| :-- | :-- | :-- |
| Coffee, RoCoLe (360: 199 healthy, 161 rust) | 59.4% / 96.7% / 3 | 65.0% / 97.4% / 0 |
| Maize, CCMT (336) | 89.9% / 87.1% / 0 | 79.2% / 90.6% / 0 |
| Beans, iBean (129) | 96.9% / 96.8% / 0 | 100% / 96.1% / 1 (bean rust → healthy 0.65) |
| Non-crop photos (137) | 0 answered | 1 answered (fall armyworm 0.85) |
| `checkPhoto` median in the page | 45 ms | 80 ms (92 ms with the LLM loaded) |

`app_check_test.csv` comes from the final APK with these floors. Re-scoring it with `leaf.app_floors` gives coffee
65.3% answered, because one healthy photo (C10P30H1, shown as 0.99 after rounding to 4 decimals) is just under the
0.99 floor in the app. Bridge test on the same APK: 75/75.

Not tried: an antialiased resize in `LeafClassifier`. It could bring the app's numbers back to the laptop's, but
both models would need to be checked again.
