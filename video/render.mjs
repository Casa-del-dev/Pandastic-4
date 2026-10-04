#!/usr/bin/env bun
// Renders video/index.html frame by frame in headless Edge/Chrome (DevTools protocol): every frame calls render(t),
// so the output is exact and repeatable. Writes JPEG sub-frames to video/out/frames/ and the sound cues to out/cues.json.
// Motion blur: each output frame is --sub samples spread over --shutter of the frame time (0.5 = a film camera's 180°);
// build.sh averages them with ffmpeg.
//
//   bun video/render.mjs --stills 1,5.5,9.8          # a few frames for a layout check (out/still-<t>.png)
//   bun video/render.mjs --fps 30 --sub 6 [--from N --to M --port P]   # frames N..M-1 (build.sh runs several in parallel)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def }
const browser = process.env.BROWSER
  || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => { try { return Bun.file(p).size > 0 } catch { return false } })
const scale = Number(arg('scale', '1'))
const port = Number(arg('port', '9555'))
const profile = join(here, 'out', `profile-${port}`)
mkdirSync(join(here, 'out', 'frames'), { recursive: true })

const proc = spawn(browser, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=1920,1080`, `--force-device-scale-factor=${scale}`, '--hide-scrollbars', '--allow-file-access-from-files',
  '--disable-gpu', '--mute-audio', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch { }
  if (!target) await sleep(250)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => { ws.onopen = r })
let id = 0; const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: scale, mobile: false })
await send('Page.navigate', { url: pathToFileURL(join(here, 'index.html')).href })
await sleep(1500)
const info = await evaluate('window.ready')
writeFileSync(join(here, 'out', 'cues.json'), JSON.stringify(info))

async function shot(t, file) {
  await evaluate(`render(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`)
  const jpeg = file.endsWith('.jpg')
  const { data } = await send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 94, fromSurface: true } : { format: 'png', fromSurface: true })
  writeFileSync(file, Buffer.from(data, 'base64'))
}

if (arg('stills')) {
  for (const t of arg('stills').split(',').map(Number)) await shot(t, join(here, 'out', `still-${t.toFixed(2)}.png`))
  console.log('stills written to video/out/')
} else {
  const fps = Number(arg('fps', '30')), n = Math.round(info.duration * fps)
  const sub = Number(arg('sub', '1')), shutter = Number(arg('shutter', '0.5'))
  const from = Number(arg('from', '0')), to = Math.min(n, Number(arg('to', String(n))))
  const started = Date.now()
  for (let f = from; f < to; f++) {
    for (let j = 0; j < sub; j++) {
      const t = Math.max(0, (f + (sub > 1 ? ((j + 0.5) / sub - 0.5) * shutter : 0)) / fps)
      await shot(t, join(here, 'out', 'frames', `s${String(f * sub + j).padStart(6, '0')}.jpg`))
    }
    if ((f - from) % 100 === 0) console.log(`[${port}] frame ${f} (${from}..${to - 1}), ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
  console.log(`[${port}] frames ${from}..${to - 1} done in ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
ws.close(); proc.kill(); process.exit(0)
