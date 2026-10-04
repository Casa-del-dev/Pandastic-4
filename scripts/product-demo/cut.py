#!/usr/bin/env python3
"""Cut the 60-second product film (docs/PRODUCT-DEMO.md): one punchline per frame, the real app on two phones.

Inputs in product-demo/ (gitignored): vo/NN.mp3 (voice.py), raw/ (emulator footage), fonts/ (Clash Display, Satoshi
from Fontshare), panda.png; app screens from docs/screenshots/demo/. Output: product-demo/pandastic-product-demo.mp4.
"""
import subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / 'product-demo'
SHOTS = ROOT / 'docs' / 'screenshots' / 'demo'
WORK = DEMO / 'work'
W, H, FPS = 1920, 1080, 30
# Light for the product screens, Pandastic green for the brand beats.
LIGHT = dict(bg=(255, 255, 255), bg2=(243, 244, 241), ink=(17, 17, 17), muted=(110, 110, 115), leaf=(28, 120, 78), amber=(206, 116, 22))
DARK = dict(bg=(18, 64, 43), bg2=(30, 92, 63), ink=(248, 245, 236), muted=(176, 204, 186), leaf=(150, 226, 176), amber=(246, 190, 92))
BG, BG2, INK, MUTED, LEAF, AMBER = (LIGHT[k] for k in ('bg', 'bg2', 'ink', 'muted', 'leaf', 'amber'))
RED, CHIP = (200, 52, 52), (243, 244, 246)
CREAM = INK  # text color on light slides


def font(size, kind='display'):
    name = {'display': 'ClashDisplay-Semibold', 'bold': 'ClashDisplay-Bold', 'body': 'Satoshi-Medium',
            'body-bold': 'Satoshi-Bold'}[kind]
    return ImageFont.truetype(str(DEMO / 'fonts' / f'{name}.woff2'), size)


def canvas(mark=True, dark=False):
    th = DARK if dark else LIGHT
    img = Image.new('RGB', (W, H), th['bg'])
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((300, 500, 2400, 1700), fill=140)  # a faint wash from the lower right
    img.paste(Image.new('RGB', (W, H), th['bg2']), (0, 0), glow.filter(ImageFilter.GaussianBlur(260)))
    if mark:
        ImageDraw.Draw(img).text((140, H - 92), 'Pandastic', font=font(30, 'body-bold'), fill=th['muted'])
    return img


def center(d, y, s, f, fill):
    d.text(((W - d.textlength(s, font=f)) / 2, y), s, font=f, fill=fill)


def phone(shot, height=900):
    s = Image.open(shot).convert('RGB')
    sw = int(s.width * (height - 36) / s.height)
    s = s.resize((sw, height - 36), Image.LANCZOS)
    body = Image.new('RGBA', (sw + 36, height), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, sw + 35, height - 1), radius=56, fill=(8, 12, 10, 255))
    mask = Image.new('L', s.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s.width - 1, s.height - 1), radius=40, fill=255)
    body.paste(s, (18, 18), mask)
    out = Image.new('RGBA', (body.width + 120, body.height + 120), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((60, 84, body.width + 60, body.height + 64), radius=60, fill=(0, 0, 0, 70))
    out = out.filter(ImageFilter.GaussianBlur(32))
    out.paste(body, (60, 60), body)
    return out


def punch(title, sub=None, shot=None, title_color=None, size=150, dark=False):
    """One punchline (left) and one phone (right), or a centered punchline."""
    th = DARK if dark else LIGHT
    title_color = title_color or th['ink']
    MUTED = th['muted']
    img = canvas(dark=dark)
    d = ImageDraw.Draw(img)
    f = font(size)
    if shot is None:
        lines = title.split('\n')
        y = (H - len(lines) * size * 1.05) / 2 - (40 if sub else 0)
        for line in lines:
            center(d, y, line, f, title_color)
            y += size * 1.05
        if sub:
            center(d, y + 30, sub, font(46, 'body'), MUTED)
        return img
    p = phone(shot)
    img.paste(p, (1160 - 60, (H - p.height) // 2), p)
    lines = title.split('\n')
    y = (H - len(lines) * size * 1.05) / 2 - (50 if sub else 0)
    for line in lines:
        d.text((140, y), line, font=f, fill=title_color)
        y += size * 1.05
    if sub:
        d.text((146, y + 34), sub, font=font(44, 'body'), fill=MUTED)
    return img


def logo_card(tagline=None, dark=True):
    """The app's panda (its SVG, rendered) over the wordmark. On white the panda sits on a soft gray disc."""
    th = DARK if dark else LIGHT
    img = canvas(mark=False, dark=dark)
    d = ImageDraw.Draw(img)
    size, top = 300, (200 if tagline else 240)
    x = (W - size) // 2
    if not dark:
        d.ellipse((x - 20, top - 10, x + size + 20, top + size + 30), fill=(240, 241, 237))
    mark = Image.open(DEMO / 'panda-mark.png').convert('RGBA').resize((size, size), Image.LANCZOS)
    img.paste(mark, (x, top), mark)
    center(d, top + size + 40, 'Pandastic', font(170, 'bold'), th['ink'])
    if tagline:
        center(d, top + size + 260, tagline, font(60, 'body-bold'), th['leaf'])
    return img


def two_phones(left_shot, right_shot, title, left_label, right_label, dark=False):
    th = DARK if dark else LIGHT
    MUTED = th['muted']
    img = canvas(mark=False, dark=dark)
    d = ImageDraw.Draw(img)
    center(d, 70, title, font(96), th['ink'])
    for shot, x, label in ((left_shot, 420, left_label), (right_shot, 1500, right_label)):
        p = phone(shot, 760)
        img.paste(p, (int(x - p.width / 2), 230 - 60), p)
        f = font(32, 'body-bold')
        d.text((x - d.textlength(label, font=f) / 2, 230 + 760 + 22), label, font=f, fill=MUTED)
    return img


# ---------- animated SMS flight ----------

def ease(t):
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def bezier(p0, p1, p2, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])


def envelope(d, x, y, color, label):
    w, h = 132, 92
    x0, y0 = x - w / 2, y - h / 2
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=14, fill=(255, 255, 255, 255), outline=color + (255,), width=5)
    d.line((x0 + 8, y0 + 10, x, y0 + h * 0.58, x0 + w - 8, y0 + 10), fill=color + (255,), width=6, joint='curve')
    f = font(28, 'body-bold')
    lw = d.textlength(label, font=f) + 36
    d.rounded_rectangle((x - lw / 2, y0 - 60, x + lw / 2, y0 - 14), radius=23, fill=color + (255,))
    d.text((x - lw / 2 + 18, y0 - 55), label, font=f, fill=(255, 255, 255, 255))


def sms_flow(dur, name):
    """Noor's SMS flies to the daughter's phone, the phone reads it, the reply flies back. 8 s timeline, stretched."""
    out = WORK / f'{name}.mp4'
    ph = 780
    k = dur / 8.0
    left, after = phone(DEMO / 'raw' / 'sw-before.png', ph), phone(DEMO / 'raw' / 'sw-after.png', ph)
    right = phone(SHOTS / '13-settings.png', ph)
    lx, rx, py = 160, W - 160 - right.width + 120, 175
    gap = ((lx + left.width - 120) + rx) / 2
    base = canvas(mark=False).convert('RGBA')
    d = ImageDraw.Draw(base)
    center(d, 48, 'In her words. In seconds.', font(84), CREAM)
    base_after = base.copy()
    base.alpha_composite(left, (lx - 60, py - 60))
    base_after.alpha_composite(after, (lx - 60, py - 60))
    for b in (base, base_after):
        b.alpha_composite(right, (rx - 60, py - 60))
        bd = ImageDraw.Draw(b)
        for cx, label in ((lx + (left.width - 120) / 2, "Noor · on the slope"), (rx + (right.width - 120) / 2, "Her daughter's phone · at home")):
            f = font(30, 'body-bold')
            bd.text((cx - bd.textlength(label, font=f) / 2, py + ph + 20), label, font=f, fill=MUTED)
    a, b = (lx + left.width - 120 + 10, py + ph * 0.45), (rx - 10, py + ph * 0.45)
    up, down = ((a[0] + b[0]) / 2, 150), ((a[0] + b[0]) / 2, 960)
    chips = [('Read on the phone: coffee · a leaf problem', LEAF), ("Not sure from words: don't spray yet", CREAM),
             ('Send a leaf photo tonight', AMBER)]
    frames = int(dur * FPS)
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                             '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', str(out)],
                            stdin=subprocess.PIPE)
    for i in range(frames):
        t = i / FPS / k
        mix = ease((t - 6.3) / 0.6)
        frame = Image.blend(base, base_after, mix) if 0 < mix < 1 else (base_after if mix >= 1 else base).copy()
        o = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(o)
        if 0.5 <= t <= 2.6:
            q = ease((t - 0.5) / 2.1)
            for j in range(1, 7):
                x, y = bezier(a, up, b, max(0, q - j * 0.03))
                od.ellipse((x - 7, y - 7, x + 7, y + 7), fill=LEAF + (150 - j * 20,))
            envelope(od, *bezier(a, up, b, q), LEAF, 'majani ya kahawa…')
        if 2.5 <= t <= 6.4:
            for r in range(3):
                s = ((t - 2.5) * 0.9 + r / 3) % 1
                pad = 10 + s * 70
                od.rounded_rectangle((rx - pad, py - pad, rx + right.width - 120 + pad, py + ph + pad), radius=60 + pad / 2,
                                     outline=LEAF + (int(200 * (1 - s)),), width=5)
        for n, (label, color) in enumerate(chips):
            show = ease((t - (2.9 + n * 0.8)) / 0.35) * (1 - ease((t - 6.6) / 0.4))
            if show > 0:
                f = font(28, 'body-bold')
                cw = od.textlength(label, font=f) + 40
                cx, cy = gap - cw / 2, 380 + n * 84 + (1 - show) * 30
                od.rounded_rectangle((cx, cy, cx + cw, cy + 60), radius=30, fill=CHIP + (int(250 * show),),
                                     outline=color + (int(255 * show),), width=3)
                od.text((cx + 20, cy + 13), label, font=f, fill=color + (int(255 * show),))
        if 4.9 <= t <= 6.6:
            q = ease((t - 4.9) / 1.7)
            for j in range(1, 7):
                x, y = bezier(b, down, a, max(0, q - j * 0.03))
                od.ellipse((x - 7, y - 7, x + 7, y + 7), fill=AMBER + (150 - j * 20,))
            envelope(od, *bezier(b, down, a, q), AMBER, 'Reply · SMS')
        cap = ease((t - 6.8) / 0.5)
        if cap > 0:
            f = font(64)
            for n, label in enumerate(('No internet.', 'Just SMS.')):
                od.text((gap - od.textlength(label, font=f) / 2, 430 + n * 90), label, font=f,
                        fill=(LEAF if n else CREAM) + (int(255 * cap),))
        frame.alpha_composite(o)
        proc.stdin.write(frame.convert('RGB').tobytes())
    proc.stdin.close()
    proc.wait()
    return out


# ---------- ffmpeg ----------

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(' '.join(map(str, cmd)) + '\n' + r.stderr[-2000:])


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                capture_output=True, text=True).stdout.strip())


def still(img, dur, name, zoom=None):
    """A static frame (no push-in: it read as an odd zoom). zoom is ignored, kept for the call sites."""
    png, out = WORK / f'{name}.png', WORK / f'{name}.mp4'
    img.save(png)
    run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-i', str(png), '-t', str(dur),
         '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-tune', 'stillimage', str(out)])
    return out


def scene(n, parts):
    lst = WORK / f'scene{n}.txt'
    lst.write_text(''.join(f"file '{c}'\n" for c, _ in parts))
    v = WORK / f'scene{n}-v.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(v)])
    total = sum(s for _, s in parts)
    out = WORK / f'scene{n}.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(v), '-i', str(DEMO / 'vo' / f'{n:02d}.mp3'), '-filter_complex',
         f"[1:a]adelay=200|200,apad,atrim=0:{total},aresample=44100[a];[0:v]fade=t=in:st=0:d=0.2,fade=t=out:st={total - 0.2}:d=0.2[v]",
         '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
         '-ac', '2', '-t', str(total), str(out)])
    return out


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    vo = {n: duration(DEMO / 'vo' / f'{n:02d}.mp3') + 0.6 for n in range(1, 10)}
    s = []
    d = vo[1]
    d += 1.0
    s.append(scene(1, [(still(punch('1 officer.', size=190, dark=True), 2.2, 'p1a', 0.02), 2.2),
                       (still(punch('1,800 farmers.', 'Uganda · UFAAS 2023', title_color=DARK['amber'], size=190, dark=True), d - 2.2, 'p1b'), d - 2.2)]))
    d = vo[2] + 1.2
    s.append(scene(2, [(still(punch('Noor waits\nmonths.', size=170, dark=True), 2.4, 'p2a', 0.02), 2.4),
                       (still(logo_card(dark=False), d - 2.4, 'p2b', 0.04), d - 2.4)]))
    s.append(scene(3, [(sms_flow(vo[3] + 1.6, 'p3'), vo[3] + 1.6)]))
    d = max(vo[4] + 1.2, 6.0)
    s.append(scene(4, [(still(punch('Just ask.', 'Photo in. Plain words out.', SHOTS / '03-photo-rust.png'), d, 'p4'), d)]))
    d = max(vo[5] + 1.2, 6.0)
    s.append(scene(5, [(still(punch("It knows\nwhen it\ndoesn't know.", 'Not sure? It sends her to a person.', SHOTS / '04-photo-not-sure.png',
                                    size=120), d, 'p5'), d)]))
    d = max(vo[6] + 1.2, 6.0)
    s.append(scene(6, [(still(punch('Sell with\nproof.', "The buyer's offer vs the official price.", SHOTS / '08-chat-price.png', size=140),
                              d, 'p6'), d)]))
    d = max(vo[7] + 1.2, 5.5)
    s.append(scene(7, [(still(punch('Family\nstays family.', 'Personal texts get no reply.', DEMO / 'raw' / 'family.png', size=130),
                              d, 'p7'), d)]))
    d = max(vo[8] + 1.2, 6.0)
    s.append(scene(8, [(still(two_phones(DEMO / 'raw' / 'sw-after.png', DEMO / 'raw' / 'helper-home.png', 'No servers. No data bundle.',
                                         'Her basic phone', "Her daughter's phone", dark=True), d, 'p8', 0.02), d)]))
    d = vo[9] + 2.3
    s.append(scene(9, [(still(logo_card('Small AI, where the farm is.', dark=True), d, 'p9', 0.03), d)]))
    lst = WORK / 'all.txt'
    lst.write_text(''.join(f"file '{c}'\n" for c in s))
    joined = WORK / 'joined.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(joined)])
    out = DEMO / 'pandastic-product-demo.mp4'
    total = duration(joined)
    music = DEMO / 'music.mp3'  # ElevenLabs Music, generated for this film
    if music.exists():  # a quiet bed under the voice, faded in and out
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(joined), '-stream_loop', '-1', '-i', str(music), '-filter_complex',
             f"[1:a]atrim=0:{total},volume=0.16,afade=t=in:st=0:d=0.8,afade=t=out:st={total - 2.5}:d=2.5[m];"
             "[0:a][m]amix=inputs=2:duration=first:normalize=0[a]",
             '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out)])
    else:
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(joined), '-c', 'copy', '-movflags', '+faststart', str(out)])
    print(out, round(duration(out), 1), 's')


if __name__ == '__main__':
    main()
