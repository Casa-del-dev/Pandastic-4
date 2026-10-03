# Pandastic project brief and TODO

Read this file before making future changes. It records the product goal and the decisions that are still open.

## Goal

Build a two-phone system for a place with **no internet access**. The phones must communicate over the **mobile phone network** (for example, carrier voice calls, SMS, or MMS), not Wi-Fi or a local hotspot.

The **strong phone** is the local AI host. It should be able to receive text, speech, and pictures directly, run suitable models on-device, and answer with text and/or speech. It should also handle requests arriving from the small phone.

The **small phone** may have very little RAM. It should capture or send a request and present the answer; it must not need to run the heavy models. The original use case includes calling a phone number and talking to the AI hosted on the strong phone, but the exact way to connect carrier call audio to an on-device model has not been proven.

## Requirements to preserve

- No internet is available during use. Carrier cellular coverage is expected; “offline” here means no internet, not no phone service.
- Phone-line communication is essential. A Wi-Fi/hotspot-only solution does not satisfy the deployment requirement.
- The strong phone must support its own picture input as well as text and speech. Clarify whether picture input means camera capture, gallery selection, or both; the likely product should support both if feasible.
- The small phone must remain lightweight and usable with limited RAM.
- Model inference should happen locally on the strong phone. Do not add cloud model dependencies.
- Treat SMS, MMS, and live voice calls as distinct transport options. SMS is suitable for short text; picture delivery and call audio have different constraints and need real-device/carrier validation.
- Current app code is a prototype, not proof that the target call workflow works.

## Current repository state

- Android app in Java under `android/`.
- Current client/server path is local HTTP over Wi-Fi/hotspot.
- The small phone can record a short AAC clip and submit it to the strong phone.
- The strong phone currently returns fixed demo text rendered through Android offline TTS.
- `SpeechPipeline` is an extension point; no real ASR, LLM, VLM, image understanding, or local knowledge store is implemented.
- No carrier call, SMS, or MMS integration is implemented.
- The README contains Android build and local-network prototype instructions. Those instructions describe the demo only, not the final connectivity requirement.

## Recommended work order

### 1. Confirm target devices and phone-line constraints

- Record the exact strong and small phone models, Android versions, available RAM/storage, and whether either device may be rooted or modified.
- Identify the country/carrier and what service works at the deployment site: voice calls, SMS, MMS, and whether MMS works without mobile data settings enabled.
- Decide whether the main interaction is an incoming normal phone call, SMS request/response, MMS picture exchange, or a combination.
- Test whether a normal cellular call can provide live audio to an app on the strong phone. Do not assume ordinary Android apps can inspect SIM-call audio; verify the documented APIs and a real device early. Investigate a supported call endpoint or external telephony hardware if the stock phone path cannot expose audio.
- Decide how the small phone reaches the strong phone if it lacks its own SIM/service (for example, whether it is itself a basic cellular handset, or uses another supported arrangement).

### 2. Make the strong phone useful on its own

- Replace the fixed demo pipeline with a clean local model interface and a minimal typed prompt/response flow.
- Select a model runtime and model that fit the strong phone's hardware and licensing needs. Measure memory use, latency, heat, storage, and battery on the actual device before selecting a larger model.
- Add direct picture input on the strong phone (camera and/or gallery) and define how image-capable local inference will process it. Keep model loading/inference out of UI code.
- Add speech input on the strong phone: capture audio, run local speech recognition, send the transcript to the local model, and speak the response with offline TTS.
- Keep model files out of Git and document how to install them while internet is available, before deployment.

### 3. Define a transport-independent request interface

- Represent requests and responses independently of Wi-Fi, SMS/MMS, or calls. Include request type (text, speech, image), payload limits, response format, errors, and timeouts.
- Keep the local model pipeline callable from both the strong phone UI and the eventual phone-line adapter.
- Preserve the current Wi-Fi demo only as a development transport if useful; do not present it as meeting the no-internet deployment requirement.

### 4. Prototype the chosen phone-line path

- For calls, prove incoming-call handling, call audio capture/playback, latency, interruptions, and spoken turn-taking on the actual target handset and carrier.
- For SMS, define a compact text protocol, request identifiers, chunking/length limits, retries, and how replies are delivered.
- For MMS, measure real carrier behavior, image size/type limits, delivery delays, and whether receiving images requires mobile data configuration.
- Add authentication/authorization appropriate to the deployment. Do not rely on caller ID alone as a security boundary.
- Test in airplane/no-internet conditions with cellular service enabled, and record exactly what works.

### 5. Make the small-phone experience reliable

- Implement only the capture and transport features supported by the chosen channel.
- Handle weak signal, call drops, delayed messages, duplicate requests, and retries without losing the user's request.
- Keep local storage and memory use bounded; provide clear status when a request is pending or failed.
- Verify the app on the actual low-tier phone. Do not infer compatibility from Android version or RAM alone.

## Open decisions

- What are the exact phone models, especially the strong/AI-host phone?
- Is the primary interaction a live voice call, SMS, MMS, or more than one?
- Does the small phone have its own SIM and voice/SMS service?
- Should the strong phone accept pictures from its own camera, gallery, or both?
- What languages must speech recognition and spoken responses support?
- What is the acceptable response time, and can the user wait for a model to load or process an image?
- Are there restrictions on installing apps, using a custom/default dialer, unlocking/rooting devices, or connecting external hardware?

## Guidance for future coding prompts

Before implementing a feature, check this brief and the current code. Preserve the no-internet, carrier-phone-network requirement and strong-phone-local-inference goal. Clearly distinguish a working prototype from an unverified carrier feature. Prefer small milestones that can be tested on the actual target phones; report any device/carrier assumption that still needs validation.
