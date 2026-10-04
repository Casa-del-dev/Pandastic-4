#!/usr/bin/env python3
"""Voice-over for the product demo: one MP3 per scene of docs/PRODUCT-DEMO.md, read by ElevenLabs.

Needs ELEVEN_LABS_API_KEY in the environment or in ../.env (never committed). Writes product-demo/vo/NN.mp3.
"""
import json, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOICE = os.environ.get('VOICE_ID', 'EvXuVNqs50Ub7YdFSesj')  # Tom, British
MODEL = 'eleven_multilingual_v2'


def api_key():
    if os.environ.get('ELEVEN_LABS_API_KEY'):
        return os.environ['ELEVEN_LABS_API_KEY']
    for env in (ROOT / '.env', ROOT.parent / '.env'):
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith('ELEVEN_LABS_API_KEY='):
                    return line.split('=', 1)[1].strip().strip('"')
    sys.exit('ELEVEN_LABS_API_KEY not set (environment or .env)')


def scenes():
    """(number, voice-over) from the table in docs/PRODUCT-DEMO.md (the last column)."""
    rows = []
    for line in (ROOT / 'docs' / 'PRODUCT-DEMO.md').read_text().splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 3 and cells[0].isdigit():
            rows.append((int(cells[0]), re.sub(r'\*\*|`', '', cells[-1])))
    return rows


def main():
    out = ROOT / 'product-demo' / 'vo'
    out.mkdir(parents=True, exist_ok=True)
    key = api_key()
    only = {int(a) for a in sys.argv[1:]}
    for number, text in scenes():
        if only and number not in only:
            continue
        body = json.dumps({'text': text, 'model_id': MODEL,
                           'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.25}}).encode()
        req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128',
                                     body, {'xi-api-key': key, 'Content-Type': 'application/json'})
        (out / f'{number:02d}.mp3').write_bytes(urllib.request.urlopen(req, timeout=120).read())
        print(f'scene {number}: {len(text)} characters')


if __name__ == '__main__':
    main()
