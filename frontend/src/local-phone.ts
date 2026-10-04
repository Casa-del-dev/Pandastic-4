/// <reference types="vite/client" />
import type { ChatStatus, HubStatus, PhoneMode, SmsResult } from './native'

type LocalPhone = { number: string; mode: PhoneMode; chat: ChatStatus; hub: HubStatus }
declare global {
  interface Window { __pandasticLocalPhone?: LocalPhone }
}

// Injected only by the explicitly enabled development server. APK/normal previews stay unchanged.
export const isLocalPhone = !window.PandasticNative && Boolean(window.__pandasticLocalPhone)
let state = isLocalPhone ? window.__pandasticLocalPhone : undefined
export const localPhoneNumber = state?.number
export const localPhoneState = () => state

function receive(next: LocalPhone) {
  state = next
  window.dispatchEvent(new CustomEvent('pandastic:chat', { detail: next.chat }))
  window.dispatchEvent(new CustomEvent('pandastic:hub', { detail: next.hub }))
}

if (isLocalPhone) {
  const events = new EventSource('/__phone/events')
  events.onmessage = event => receive(JSON.parse(event.data) as LocalPhone)
  // EventSource reconnects and receives the complete snapshot, including messages missed while away.
  if (import.meta.hot) import.meta.hot.dispose(() => events.close())
}

export async function updateLocalPhone(operation: string, value?: unknown) {
  try {
    const response = await fetch('/__phone/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, value }), signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Local phone setting failed')
    receive(await response.json() as LocalPhone)
  } catch {
    window.dispatchEvent(new CustomEvent('pandastic:local-error'))
  }
}

export async function sendLocalSms(number: string, body: string): Promise<SmsResult> {
  try {
    const response = await fetch('/__phone/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), number: number.trim(), body }), signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { ok: false, error: 'invalid' }
    return await response.json() as SmsResult
  } catch { return { ok: false, error: 'unknown' } }
}
