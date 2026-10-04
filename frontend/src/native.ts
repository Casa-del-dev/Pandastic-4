// Bridge to the Android app (window.PandasticNative, see NativeBridge.java).
// In a desktop browser there is no bridge, so a clearly labelled demo mode answers instead.

export type Lang = 'sw' | 'en'

export type Price = {
  commodity: string
  low: number
  high: number
  currency: string
  unit: string
  date: string
  source_id: string
  offer?: number | null
  gap_pct?: number | null
  stale?: boolean
}

// Contracts §2 decision object. Fields are optional because the interim resolver sends fewer.
export type Decision = {
  status: string
  crop?: string
  label?: string
  prob?: number
  runner_up?: string
  runner_up_prob?: number
  advice_sms?: string
  advice_long?: string
  source?: { id: string; title?: string; url?: string }
  price?: Price
  escalate?: boolean
  stub?: boolean
  quality?: string
  error?: string
}

export type HubContact = { name: string; number: string }
export type HubEntry = { id: number; contact: string; question: string; reply: string | null; status: string; receivedAt: number }
export type HubStatus = {
  enabled: boolean
  running: boolean
  lang: Lang
  contacts: HubContact[]
  smsPermission: boolean
  notificationPermission: boolean
  answeredToday: number
  recent: HubEntry[]
}

type Native = {
  checkPhoto(id: string, base64Jpeg: string, text: string, lang: string): void
  ask(id: string, text: string, lang: string): void
  info(): string
  hubStatus(): string
  setHubEnabled(enabled: boolean): void
  setHubContacts(json: string): void
  setHubLang(lang: string): void
  clearHubHistory(): void
  draftSms(number: string, body: string): void
  share(text: string): void
  speak(text: string, lang: string): boolean
  voices(): string
  stopSpeaking(): void
}

declare global {
  interface Window {
    PandasticNative?: Native
    __pandasticReply?: (id: string, decision: Decision) => void
  }
}

const native = window.PandasticNative
export const isDemo = !native
const waiting = new Map<string, (decision: Decision) => void>()
window.__pandasticReply = (id, decision) => {
  waiting.get(id)?.(decision)
  waiting.delete(id)
}

function call(start: (id: string) => void, timeoutMs = 45000): Promise<Decision> {
  const id = crypto.randomUUID()
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve({ status: 'ERROR', error: 'timeout', escalate: true })
    }, timeoutMs)
    waiting.set(id, decision => { clearTimeout(timer); resolve(decision) })
    start(id)
  })
}

/** Shrinks the photo before it crosses the bridge; the model only needs 224 px. */
async function toJpegBase64(file: File, maxSide = 640): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.88).split(',')[1]
}

export async function checkPhoto(file: File, lang: Lang): Promise<Decision> {
  if (!native) return demoPhoto(file)
  const base64 = await toJpegBase64(file)
  return call(id => native.checkPhoto(id, base64, '', lang))
}

export function ask(text: string, lang: Lang): Promise<Decision> {
  if (!native) return demoAsk(text)
  return call(id => native.ask(id, text, lang))
}

export function modelInfo(): { classifier?: string; classifierStub?: boolean } {
  if (!native) return { classifier: 'demo', classifierStub: true }
  try { return JSON.parse(native.info()) } catch { return {} }
}

// ---- SMS helper ---------------------------------------------------------------------------

let demoHub: HubStatus = {
  enabled: false, running: false, lang: 'sw', smsPermission: true, notificationPermission: true, answeredToday: 2,
  contacts: [{ name: 'Mama', number: '+256 700 000 001' }],
  recent: [
    { id: 2, contact: 'Mama', question: 'p kahawa 12000', reply: 'Kahawa parchment Ago 2026: UGX 15,500/kg (UCDA). Bei 12,000 ni 23% chini. Uliza chama kabla ya kuuza.', status: 'answered', receivedAt: Date.now() - 3600_000 },
    { id: 1, contact: 'Mama', question: 'Majani ya kahawa yana unga wa njano', reply: 'Sina uhakika - huenda ni kutu ya majani. Onyesha jani kwenye simu nyumbani au uliza afisa. Usinyunyizie dawa bado.', status: 'answered', receivedAt: Date.now() - 7200_000 },
  ],
}
const hubListeners = new Set<(status: HubStatus) => void>()
window.addEventListener('pandastic:hub', event => {
  const status = (event as CustomEvent<HubStatus>).detail
  hubListeners.forEach(listener => listener(status))
})

export function hubStatus(): HubStatus {
  if (!native) return demoHub
  try { return JSON.parse(native.hubStatus()) } catch { return { ...demoHub, enabled: false, recent: [], contacts: [] } }
}

export function onHubChange(listener: (status: HubStatus) => void): () => void {
  hubListeners.add(listener)
  return () => { hubListeners.delete(listener) }
}

function demoUpdate(change: Partial<HubStatus>) {
  demoHub = { ...demoHub, ...change }
  hubListeners.forEach(listener => listener(demoHub))
}

export function setHubEnabled(enabled: boolean) {
  if (native) native.setHubEnabled(enabled)
  else demoUpdate({ enabled, running: enabled })
}

export function setHubContacts(contacts: HubContact[]) {
  if (native) native.setHubContacts(JSON.stringify(contacts))
  else demoUpdate({ contacts })
}

export function setHubLang(lang: Lang) {
  if (native) native.setHubLang(lang)
  else demoUpdate({ lang })
}

export function clearHubHistory() {
  if (native) native.clearHubHistory()
  else demoUpdate({ recent: [], answeredToday: 0 })
}

// ---- People and voice ---------------------------------------------------------------------

/** Opens the SMS app with a draft. The person reads it and decides whether to send. */
export function draftSms(number: string, body: string) {
  if (native) native.draftSms(number, body)
  else window.open(`sms:${encodeURIComponent(number)}?body=${encodeURIComponent(body)}`)
}

export function share(text: string) {
  if (native) native.share(text)
  else if (navigator.share) void navigator.share({ text }).catch(() => undefined)
}

export function canSpeak(lang: Lang): boolean {
  if (!native) return false
  try { return Boolean(JSON.parse(native.voices())[lang]) } catch { return false }
}

export function speak(text: string, lang: Lang): boolean {
  return native ? native.speak(text, lang) : false
}

export function stopSpeaking() { native?.stopSpeaking() }

// ---- Demo answers (desktop browser only) ---------------------------------------------------

const demoAdvice: Record<string, string> = {
  coffee_rust: 'Coffee leaf rust: yellow powdery spots under the leaves; leaves fall and branches can die. 1) Keep the recommended spacing and prune to open the bush. 2) Remove fallen leaves. 3) Spray copper under the leaves only if the extension officer agrees.',
  coffee_healthy: 'No disease seen on this leaf. Keep checking under the leaves every week.',
}

async function demoPhoto(file: File): Promise<Decision> {
  await new Promise(resolve => setTimeout(resolve, 1400))
  const pick = file.size % 4
  if (pick === 0) return { status: 'CONFIDENT', crop: 'coffee', label: 'coffee_rust', prob: 0.86, runner_up: 'coffee_cercospora', runner_up_prob: 0.07, advice_long: demoAdvice.coffee_rust, source: { id: 'plantwise-rw014-coffee-rust', title: 'PlantwisePlus: Coffee leaf rust' }, escalate: false, stub: true }
  if (pick === 1) return { status: 'CONFIDENT', crop: 'coffee', label: 'coffee_healthy', prob: 0.91, advice_long: demoAdvice.coffee_healthy, source: { id: 'plantwise-rw014-coffee-rust', title: 'PlantwisePlus: Coffee leaf rust' }, escalate: false, stub: true }
  if (pick === 2) return { status: 'UNCERTAIN', crop: 'coffee', label: 'coffee_cercospora', prob: 0.48, runner_up: 'coffee_rust', runner_up_prob: 0.39, escalate: true, stub: true }
  return { status: 'RETAKE', quality: 'blur', escalate: true, stub: true }
}

const demoPrices: Record<string, Price> = {
  coffee: { commodity: 'coffee_arabica_parchment', low: 15500, high: 15500, currency: 'UGX', unit: 'KG', date: '2026-08', source_id: 'ucda-2026-08' },
  maize: { commodity: 'maize_grain', low: 1273, high: 1888, currency: 'UGX', unit: 'KG', date: '2026-08', source_id: 'wfp-hdx-uga-derived' },
  beans: { commodity: 'beans_dry', low: 2875, high: 4273, currency: 'UGX', unit: 'KG', date: '2026-08', source_id: 'wfp-hdx-uga-derived' },
}

async function demoAsk(text: string): Promise<Decision> {
  await new Promise(resolve => setTimeout(resolve, 700))
  const crop = /kahawa|coffee/.test(text) ? 'coffee' : /mahindi|maize/.test(text) ? 'maize' : /maharage|beans/.test(text) ? 'beans' : null
  const offer = Number((text.match(/\d[\d,]*/)?.[0] ?? '').replace(/,/g, '')) || null
  if (!crop) return { status: 'NO_DATA', escalate: true }
  const price = { ...demoPrices[crop], offer, gap_pct: offer ? Math.round((offer - demoPrices[crop].low) / demoPrices[crop].low * 1000) / 10 : null, stale: false }
  return { status: 'PRICE', crop, price, escalate: false, stub: true }
}
