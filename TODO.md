# TODO

This file was the pre-hackathon brief for the old two-phone relay prototype. The project has moved on:

- Product, architecture and guardrails: [README.md](README.md)
- Design review and scope decisions: [docs/AUDIT.md](docs/AUDIT.md), [docs/AUDIT-B.md](docs/AUDIT-B.md)
- Live task board and agent coordination: [LEDGER.md](LEDGER.md)
- Demo and video: [docs/DEMO.md](docs/DEMO.md)

The old prototype's open questions are now answered:
- Transport: carrier SMS. Android apps cannot access cellular call audio, so voice calls were dropped.
- The small phone: ordinary carrier SMS works without the app. A compatible Android phone can also run Pandastic in **Basic phone** mode (Chat + Settings, no local AI/photos). Performance on 0.5 GB RAM still needs measurement.
- The strong phone: a 4 GB Android phone.

Current UX: first-launch manual phone-mode selection (Android displays total RAM), changeable in Settings. Capable mode adds local questions and camera/gallery attachments in chat, a Models page (inventory, load, release, offline file import), and opt-in SMS auto replies. There is no chat header, welcome text, separate Photos page or buyer-price form; price questions use chat. See [frontend/README.md](frontend/README.md) for setup, current behavior and limitations. Keep transport on carrier SMS; photo checks run locally on the capable phone.
