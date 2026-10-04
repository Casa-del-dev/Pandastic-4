#!/usr/bin/env bash
# Builds the 57 s technical walkthrough: real media → frames (headless Edge/Chrome) → sound → MP4.
# Needs: bun (or node 22+), Python with Pillow/numpy/scipy, ffmpeg, Edge or Chrome, the RoCoLe test photos in
# data/raw/rocole/photos (ml/leaf/class_thresholds.py fetches them) and the frontend's node_modules (fonts).
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python}
[ -f media/music.mp3 ] || { echo "Put 'Warm Fuzz' by HoliznaCC0 (CC0, freemusicarchive.org) at video/media/music.mp3" >&2; exit 1; }
$PY prepare_media.py
rm -rf out/frames; mkdir -p out/frames
N=$(( 57 * 30 )); W=${WORKERS:-6}; STEP=$(( (N + W - 1) / W ))
for i in $(seq 0 $(( W - 1 ))); do bun render.mjs --fps 30 --from $(( i * STEP )) --to $(( (i + 1) * STEP )) --port $(( 9555 + i )) & done
wait
$PY sfx.py
ffmpeg -y -v error -framerate 30 -i out/frames/f%05d.jpg -i out/audio.wav \
  -vf "noise=c0s=7:c0f=t+u,format=yuv420p" -c:v libx264 -preset slow -crf 17 -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:a aac -b:a 192k -ar 48000 -t 57 out/pandastic-walkthrough.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 out/pandastic-walkthrough.mp4
