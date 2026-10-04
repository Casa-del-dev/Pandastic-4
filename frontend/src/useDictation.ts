import { useEffect, useRef, useState } from 'react'
import type { Lang } from './native'

type Result = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}
export type DictationError = 'unsupported' | 'permission' | 'network' | 'no-speech' | 'failed'

export function useDictation({ lang, active, context, value, setValue }: {
  lang: Lang; active: boolean; context: string; value: string; setValue: (value: string) => void
}) {
  const browser = window as SpeechWindow
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<DictationError>()
  const [interim, setInterim] = useState('')
  const recognition = useRef<Recognition | undefined>(undefined)
  const generation = useRef(0)
  const update = useRef(setValue)
  update.current = setValue

  function cancel() {
    generation.current++
    recognition.current?.abort()
    recognition.current = undefined
    setListening(false); setInterim('')
  }
  useEffect(() => {
    if (!active) cancel()
  }, [active])
  useEffect(() => { cancel(); setError(undefined) }, [lang, context])
  useEffect(() => () => {
    generation.current++
    recognition.current?.abort()
  }, [])

  function toggle() {
    if (recognition.current) { recognition.current.stop(); return }
    if (!Constructor) { setError('unsupported'); return }
    if (!active) return
    setError(undefined)
    const session = ++generation.current
    const currentSession = () => generation.current === session
    let instance: Recognition
    try { instance = new Constructor() }
    catch { setError('failed'); return }
    recognition.current = instance
    instance.lang = lang === 'sw' ? 'sw-KE' : 'en-US'
    instance.continuous = false
    instance.interimResults = true
    instance.maxAlternatives = 1
    const prefix = value.trimEnd()
    instance.onresult = event => {
      if (!currentSession()) return
      const final: string[] = [], partial: string[] = []
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index]
        const words = result.isFinal ? final : partial
        words.push(result[0].transcript)
      }
      if (final.length) update.current([prefix, ...final].filter(Boolean).join(' ').slice(0, 480))
      setInterim(partial.join(' '))
    }
    instance.onerror = event => {
      if (!currentSession() || event.error === 'aborted') return
      setError(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'permission' : event.error === 'network' ? 'network' : event.error === 'no-speech' ? 'no-speech' : 'failed')
      setListening(false); setInterim('')
    }
    instance.onend = () => {
      if (!currentSession()) return
      recognition.current = undefined
      setListening(false); setInterim('')
    }
    try { setListening(true); instance.start() }
    catch { recognition.current = undefined; setListening(false); setError('failed') }
  }
  return { supported: Boolean(Constructor), listening, interim, error, toggle }
}
