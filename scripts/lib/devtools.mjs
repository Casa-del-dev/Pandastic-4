// Shared helpers for the scripts that drive the Pandastic app on emulators/phones over adb + Chrome DevTools.
// Debug builds expose the WebView to DevTools (FrontendActivity), so a script can call window.PandasticNative
// exactly as the UI does.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

export const PACKAGE = 'org.pandastic.relay'
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const sdk = process.env.ANDROID_HOME || `${homedir()}/Android/Sdk`
export const ADB = process.env.ADB || (existsSync(`${sdk}/platform-tools/adb`) ? `${sdk}/platform-tools/adb` : 'adb')
export const EMULATOR = existsSync(`${sdk}/emulator/emulator`) ? `${sdk}/emulator/emulator` : 'emulator'

/** adb bound to one device (serial may be empty when only one device is attached). */
export function adbFor(serial) {
  const target = serial ? ['-s', serial] : []
  return (...args) => execFileSync(ADB, [...target, ...args], { encoding: 'utf8' }).trim()
}

/** Opens a DevTools session on the app's WebView (starting the app if needed); port must differ per device. */
export async function connectApp(serial = process.env.DEVICE, port = 9333) {
  const adb = adbFor(serial)
  let pid = ''
  try { pid = adb('shell', 'pidof', PACKAGE) } catch { /* not running */ }
  // A WebView in the background does not answer DevTools: always bring the app to the front (state is kept).
  adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.FrontendActivity`)
  if (!pid) {
    await sleep(2500)
    pid = adb('shell', 'pidof', PACKAGE)
  }
  pid = pid.split(/\s+/)[0]
  adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`)
  let pages = []
  for (let i = 0; i < 20 && !pages.length; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })
      pages = (await list.json()).filter(p => p.type === 'page')
    }
    catch { await sleep(500) }
  }
  if (!pages.length) throw new Error(`${serial ?? 'device'}: no WebView page (debug build? app in the foreground?)`)
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools socket failed')) })
  let next = 0
  const pending = new Map()
  ws.onclose = () => {  // the page reloaded or the app died: fail what is waiting instead of hanging
    for (const done of pending.values()) done({ error: { message: 'WebView went away (app crashed or page reloaded?)' } })
    pending.clear()
  }
  ws.onmessage = event => {
    const msg = JSON.parse(event.data)
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  /** Evaluates an expression in the page; awaits promises; returns the value. */
  const evaluateOnce = expression => new Promise((resolve, reject) => {
    const id = ++next
    pending.set(id, msg => {
      if (msg.error) return reject(new Error(msg.error.message))
      if (msg.result.exceptionDetails) return reject(new Error(msg.result.exceptionDetails.exception?.description ?? 'page exception'))
      resolve(msg.result.result.value)
    })
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  // The UI reloads its page on some changes (e.g. choosing the phone mode): then the helpers are gone.
  // Wait for the new page, reinstall them and retry once.
  const evaluate = async expression => {
    try { return await evaluateOnce(expression) }
    catch (e) {
      if (!/context was destroyed|__e2e is not defined|Cannot find context/.test(e.message)) throw e
      await sleep(1500)
      await evaluateOnce(INSTALL)
      return evaluateOnce(expression)
    }
  }
  await evaluate(INSTALL)
  return { evaluate, adb, url: pages[0].url, close: () => { ws.close(); try { adb('forward', '--remove', `tcp:${port}`) } catch { /* gone */ } } }
}

// In-page helpers: answers to our ids go to us, everything else still reaches the app's own handler.
export const INSTALL = `(() => {
  // Wrap the app's reply handler once per page load; the helpers below are replaced on every run.
  if (!window.__e2eWaiting) {
    const appReply = window.__pandasticReply;
    const pending = window.__e2eWaiting = new Map();
    window.__pandasticReply = (id, d) => pending.has(id) ? (pending.get(id)(d), pending.delete(id)) : appReply && appReply(id, d);
  }
  const waiting = window.__e2eWaiting;
  window.__e2e = {
    reply(method, args, timeoutMs) {
      const id = 'e2e-' + Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error(method + ' gave no answer in ' + timeoutMs + ' ms')); }, timeoutMs);
        waiting.set(id, d => { clearTimeout(timer); resolve(d); });
        window.PandasticNative[method](id, ...args);
      });
    },
    hubEvent(trigger, timeoutMs) { return window.__e2e.event('pandastic:hub', trigger, timeoutMs); },
    event(name, trigger, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ' + name + ' event')), timeoutMs);
        window.addEventListener(name, e => { clearTimeout(timer); resolve(e.detail); }, { once: true });
        trigger();
      });
    },
    /** manageModels / sendSms answer through their own window callbacks; wrap them once, like __pandasticReply. */
    result(callback, method, args, timeoutMs) {
      const key = '__e2e_' + callback;
      if (!window[key]) {
        const app = window[callback];
        const pending = window[key] = new Map();
        window[callback] = (id, r) => pending.has(id) ? (pending.get(id)(r), pending.delete(id)) : app && app(id, r);
      }
      const id = 'e2e-' + Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { window[key].delete(id); reject(new Error(method + ' gave no answer')); }, timeoutMs);
        window[key].set(id, r => { clearTimeout(timer); resolve(r); });
        window.PandasticNative[method](id, ...args);
      });
    },
    /** frontend/src/native.ts toJpegBase64: longest side 640 px, JPEG quality 0.88. */
    async shrink(base64) {
      const bitmap = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + base64)).blob(), { imageOrientation: 'from-image' });
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bitmap.width * scale); c.height = Math.round(bitmap.height * scale);
      c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88).split(',')[1];
    },
    jpeg(kind) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const g = c.getContext('2d');
      if (kind === 'dark') { g.fillStyle = '#050505'; g.fillRect(0, 0, 640, 480); }
      else {  // a leaf-like shape with spots and texture, so the quality gate lets it through
        g.fillStyle = '#6b5a3a'; g.fillRect(0, 0, 640, 480);
        g.fillStyle = '#2f7d32'; g.beginPath(); g.ellipse(320, 240, 260, 130, 0.3, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = '#9ccc65'; g.lineWidth = 4; g.beginPath(); g.moveTo(90, 330); g.lineTo(560, 150); g.stroke();
        for (let i = 0; i < 400; i++) { g.fillStyle = i % 9 ? 'rgba(20,60,20,0.25)' : '#e09a2a'; g.fillRect((i * 97) % 600 + 20, (i * 57) % 440 + 20, 6, 6); }
      }
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    },
  };
  return true;
})()`
