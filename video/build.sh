#!/usr/bin/env bash
# Builds the 58 s technical walkthrough: real media → frames (headless Edge/Chrome) → sound → MP4.
# Needs: bun (or node 22+), Python with Pillow/numpy/scipy, ffmpeg, Edge or Chrome, internet once (fonts), and the
# RoCoLe test photos in data/raw/rocole/photos (ml/leaf/class_thresholds.py fetches them).
# Motion blur: every frame is the average of SUB samples over half the frame time (a film camera's 180° shutter).
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python}
[ -f media/music.mp3 ] || { echo "Put 'Warm Fuzz' by HoliznaCC0 (CC0, freemusicarchive.org) at video/media/music.mp3" >&2; exit 1; }
$PY prepare_media.py
rm -rf out/frames; mkdir -p out/frames
FPS=30; SUB=${SUB:-6}; N=$(( 58 * FPS )); W=${WORKERS:-6}; STEP=$(( (N + W - 1) / W ))
for i in $(seq 0 $(( W - 1 ))); do
  bun render.mjs --fps $FPS --sub $SUB --shutter 0.5 --from $(( i * STEP )) --to $(( (i + 1) * STEP )) --port $(( 9555 + i )) &
done
wait
$PY sfx.py
ffmpeg -y -v error -framerate $(( FPS * SUB )) -i out/frames/s%06d.jpg -i out/audio.wav \
  -vf "tmix=frames=$SUB,select='eq(mod(n\,$SUB)\,$(( SUB - 1 )))',setpts=N/($FPS*TB),noise=c0s=4:c0f=t+u,format=yuv420p" -r $FPS \
  -c:v libx264 -preset slow -crf 20 -tune grain -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:a aac -b:a 192k -ar 48000 -t 58 out/pandastic-walkthrough.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 out/pandastic-walkthrough.mp4
