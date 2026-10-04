"""Leaf classifier pipeline (T10): download -> manifest -> train -> calibrate -> thresholds -> ONNX + JSON.

Runs on Modal (ml/modal_app.py) or locally on CPU (python -m leaf.smoke). Output follows
docs/contracts/README.md section 1, so the app picks it up by replacing the stub files.
"""
