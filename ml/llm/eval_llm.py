"""Measure Qwen3.5-0.8B (llama.cpp, GBNF-constrained) against KeywordNlu on the synthetic SMS sets.

Starts llama-server with the GGUF, sends every SMS with ml/llm/system_prompt.txt and ml/llm/slots.gbnf,
temperature 0, thinking disabled, and scores the slots exactly like NluEvalTest (commodity = the crop's
default when a price question names none). Latency is measured on this computer's CPU; a phone is slower.

Usage (from the repo root):
  ml/.venv/Scripts/python ml/llm/eval_llm.py --server ml/artifacts/llm/llama/llama-server.exe \
      --model ml/artifacts/llm/Qwen3.5-0.8B-Q4_K_M.gguf [--keyword-predictions dev.csv heldout.csv]
Writes ml/reports/nlu_eval.md and ml/reports/nlu_eval.json.
"""
import argparse
import csv
import json
import statistics
import subprocess
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SLOTS = ["lang", "intent", "crop", "symptom", "commodity", "offer"]
DEFAULT_COMMODITY = {"coffee": "coffee_arabica_parchment", "maize": "maize_grain", "bean": "beans_dry"}


def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def effective(pred: dict) -> dict:
    out = {k: ("" if pred.get(k) is None else str(pred.get(k))) for k in SLOTS}
    if out["intent"] == "price":
        out["commodity"] = out["commodity"] or DEFAULT_COMMODITY.get(out["crop"], "")
    else:
        out["commodity"] = ""
    return out


def score(gold_rows, predictions) -> dict:
    correct = {k: 0 for k in SLOTS}
    exact, misses = 0, []
    for row in gold_rows:
        pred = predictions.get(row["id"])
        if pred is None:
            continue
        ok = True
        for k in SLOTS:
            if (row[k] or "") == (pred.get(k) or ""):
                correct[k] += 1
            else:
                ok = False
                misses.append(f"{row['id']} `{row['text']}` {k}: want `{row[k]}` got `{pred.get(k)}`")
        exact += ok
    n = len(gold_rows)
    return {"n": n, **{k: round(correct[k] / n, 3) for k in SLOTS}, "all_slots": round(exact / n, 3), "misses": misses}


def hybrid(kw: dict, qwen: dict, fill_all: bool) -> dict:
    """Keyword values always win. The LLM only fills what the keywords left empty:
    fill_all=False -> only intent (when no intent keyword matched, intent_prob 0) and crop; fill_all=True -> every empty slot."""
    out = dict(kw)
    no_intent_evidence = kw.get("intent_prob", "0") in ("0", "0.0") and kw["intent"] == "other"
    if no_intent_evidence and qwen["intent"]:
        out["intent"] = qwen["intent"]
    if not kw["crop"]:
        out["crop"] = qwen["crop"]
    if fill_all:
        for k in ("symptom", "offer"):
            if not kw[k]:
                out[k] = qwen[k]
    return effective({k: (out[k] or None) for k in SLOTS} | {"commodity": kw["commodity"] or None})


def ask(base: str, system: str, grammar: str, text: str) -> tuple[dict, float, dict]:
    body = {
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": f"SMS: {text}"}],
        "temperature": 0, "max_tokens": 80, "grammar": grammar, "cache_prompt": True,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    started = time.perf_counter()
    r = requests.post(f"{base}/v1/chat/completions", json=body, timeout=120)
    r.raise_for_status()
    elapsed = time.perf_counter() - started
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content), elapsed, data.get("timings", {})


def write_report(results: dict, threads: int) -> None:
    reports = ROOT / "ml/reports"
    reports.mkdir(parents=True, exist_ok=True)
    (reports / "nlu_eval.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    lines = ["# SMS understanding: KeywordNlu vs Qwen3.5-0.8B (GBNF)", "",
             "Synthetic SMS written by the team (labelled synthetic). `dev` was used to tune the keyword lexicon;",
             "`heldout` was written before any results and never used for tuning. Qwen: Q4_K_M via llama.cpp,",
             f"temperature 0, thinking off, {threads} CPU threads on a laptop (a phone is slower).", "",
             "| Set | Model | n | lang | intent | crop | symptom | commodity | offer | all slots |",
             "| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: |"]
    for name, r in results.items():
        for model in ("keyword", "qwen", "hybrid_intent_crop", "hybrid_fill"):
            if model in r:
                s = r[model]
                lines.append(f"| {name} | {model} | {s['n']} | " + " | ".join(f"{s[k]:.0%}" for k in SLOTS + ["all_slots"]) + " |")
    lines += ["", "`hybrid_intent_crop` = keyword slots always win; the LLM only supplies the intent when no intent keyword",
              "matched (KeywordNlu intentProb 0) and the crop when none was found. `hybrid_fill` also lets it fill symptom",
              "and offer, which is worse: the base model invents symptoms. This is the policy recommended for LlmNlu.", "",
              "| Set | median latency (s) | max (s) | prompt ms (median) | generation ms (median) |", "| :-- | --: | --: | --: | --: |"]
    for name, r in results.items():
        lines.append(f"| {name} | {r['latency_s']['median']} | {r['latency_s']['max']} | {r['prompt_ms_median']} | {r['gen_ms_median']} |")
    for name, r in results.items():
        for model in ("keyword", "qwen"):
            if model in r and r[model]["misses"]:
                lines += ["", f"## Misses: {name} / {model}", ""] + [f"- {m}" for m in r[model]["misses"]]
    (reports / "nlu_eval.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote ml/reports/nlu_eval.md")


def evaluate_model(server_path: str, model_path: str, threads: int = 4, port: int = 8089, save_predictions: bool = True) -> dict:
    """Start llama-server with the GGUF, run both SMS sets through it, return per-set scores and latency."""
    system = (HERE / "system_prompt.txt").read_text(encoding="utf-8").strip()
    grammar = (HERE / "slots.gbnf").read_text(encoding="utf-8")
    sets = {"dev": read(HERE / "eval_sms.csv"), "heldout": read(HERE / "eval_sms_heldout.csv")}
    server = subprocess.Popen([str(Path(server_path).resolve()), "-m", str(Path(model_path).resolve()), "--port", str(port), "-c", "2048",
                               "-t", str(threads), "--jinja", "-np", "1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    results = {}
    try:
        for _ in range(180):
            try:
                if requests.get(f"{base}/health", timeout=2).status_code == 200:
                    break
            except requests.RequestException:
                pass
            time.sleep(1)
        for name, rows in sets.items():
            predictions, latencies, prompt_ms, gen_ms, failures = {}, [], [], [], 0
            for row in rows:
                try:
                    pred, elapsed, timings = ask(base, system, grammar, row["text"])
                    predictions[row["id"]] = effective(pred)
                    latencies.append(elapsed)
                    prompt_ms.append(timings.get("prompt_ms", 0))
                    gen_ms.append(timings.get("predicted_ms", 0))
                except Exception as e:  # grammar makes this unlikely; count it rather than crash
                    failures += 1
                    predictions[row["id"]] = {k: "" for k in SLOTS}
                    print("failed:", row["text"], e)
            if save_predictions:
                (ROOT / "ml/reports").mkdir(parents=True, exist_ok=True)
                with open(ROOT / f"ml/reports/qwen_predictions_{name}.csv", "w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=["id"] + SLOTS)
                    w.writeheader()
                    for rid, pred in predictions.items():
                        w.writerow({"id": rid, **pred})
            results[name] = {
                "qwen": score(rows, predictions),
                "latency_s": {"median": round(statistics.median(latencies), 2), "max": round(max(latencies), 2)} if latencies else {},
                "prompt_ms_median": round(statistics.median(prompt_ms)) if prompt_ms else None,
                "gen_ms_median": round(statistics.median(gen_ms)) if gen_ms else None,
                "failures": failures,
            }
            print(name, json.dumps({k: v for k, v in results[name]["qwen"].items() if k != "misses"}), results[name]["latency_s"])
    finally:
        server.terminate()
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server")
    parser.add_argument("--model")
    parser.add_argument("--report-only", action="store_true", help="rewrite the .md from ml/reports/nlu_eval.json")
    parser.add_argument("--threads", type=int, default=4, help="4 threads ~ a mid-range phone's big cores")
    parser.add_argument("--port", type=int, default=8089)
    parser.add_argument("--keyword-predictions", nargs=2, metavar=("DEV", "HELDOUT"),
                        help="CSV files written by NluEvalTest with -Dpandastic.evalOut")
    args = parser.parse_args()
    if args.report_only:
        write_report(json.loads((ROOT / "ml/reports/nlu_eval.json").read_text(encoding="utf-8")), args.threads)
        return

    results = evaluate_model(args.server, args.model, args.threads, args.port)
    sets = {"dev": read(HERE / "eval_sms.csv"), "heldout": read(HERE / "eval_sms_heldout.csv")}
    if args.keyword_predictions:
        for name, path in zip(("dev", "heldout"), args.keyword_predictions):
            kw = {r["id"]: r for r in read(path)}
            results[name]["keyword"] = score(sets[name], kw)
            qwen = {r["id"]: r for r in read(ROOT / f"ml/reports/qwen_predictions_{name}.csv")}
            results[name]["hybrid_fill"] = score(sets[name], {i: hybrid(kw[i], qwen[i], fill_all=True) for i in kw})
            results[name]["hybrid_intent_crop"] = score(sets[name], {i: hybrid(kw[i], qwen[i], fill_all=False) for i in kw})
            print(name, "keyword", json.dumps({k: v for k, v in results[name]["keyword"].items() if k != "misses"}))

    write_report(results, args.threads)


if __name__ == "__main__":
    main()
