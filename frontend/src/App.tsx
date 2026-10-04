import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, Panda, type IconName } from './Icons'
import { labelNames, money, monthYear, strings } from './i18n'
import * as native from './native'
import type { Decision, HubContact, HubStatus, Lang } from './native'

type Screen = 'home' | 'leaf' | 'price' | 'helper'
type Tone = 'good' | 'bad' | 'unsure' | 'calm'
type Crop = 'coffee' | 'maize' | 'beans'

const OFFICER_KEY = 'pandastic.officer'
const LANG_KEY = 'pandastic.lang'

function load(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: setting lasts this session only */ }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => load(LANG_KEY, 'sw') === 'en' ? 'en' : 'sw')
  const [screen, setScreen] = useState<Screen>('home')
  const [hub, setHub] = useState<HubStatus>(() => native.hubStatus())
  const t = strings[lang]

  useEffect(() => native.onHubChange(setHub), [])
  useEffect(() => {
    // Android's back button walks this history instead of closing the app.
    const onPop = (event: PopStateEvent) => setScreen((event.state?.screen as Screen) ?? 'home')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => { document.documentElement.lang = lang; save(LANG_KEY, lang) }, [lang])

  function open(next: Screen) {
    window.history.pushState({ screen: next }, '')
    setScreen(next)
    window.scrollTo(0, 0)
  }

  return <div className="app">
    <header className="topbar">
      {screen === 'home'
        ? <div className="brand"><Panda size={40} /><div><strong>Pandastic</strong><span>{t.appTagline}</span></div></div>
        : <button className="back" onClick={() => window.history.back()}><Icon name="back" size={26} /> {t.back}</button>}
      <div className="lang-switch" role="group" aria-label="Language / Lugha">
        <button aria-pressed={lang === 'sw'} onClick={() => setLang('sw')}>Kiswahili</button>
        <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
      </div>
    </header>

    <main>
      {screen === 'home' && <Home lang={lang} hub={hub} open={open} />}
      {screen === 'leaf' && <LeafCheck lang={lang} />}
      {screen === 'price' && <PriceCheck lang={lang} />}
      {screen === 'helper' && <Helper lang={lang} hub={hub} />}
    </main>
  </div>
}

// ---- Home -----------------------------------------------------------------------------------

function Home({ lang, hub, open }: { lang: Lang; hub: HubStatus; open: (screen: Screen) => void }) {
  const t = strings[lang]
  return <>
    <section className="greeting">
      <h1>{t.hello}</h1>
      <p>{t.whatToday}</p>
    </section>
    <nav className="slabs">
      <button className="slab slab-leaf" onClick={() => open('leaf')}>
        <span className="slab-icon"><Icon name="leafScan" size={56} stroke={2} /></span>
        <span className="slab-text"><strong>{t.leafTitle}</strong><span>{t.leafHint}</span></span>
      </button>
      <button className="slab slab-price" onClick={() => open('price')}>
        <span className="slab-icon"><Icon name="scale" size={56} stroke={2} /></span>
        <span className="slab-text"><strong>{t.priceTitle}</strong><span>{t.priceHint}</span></span>
      </button>
      <button className="slab slab-helper" onClick={() => open('helper')}>
        <span className="slab-icon"><Icon name="basicPhone" size={56} stroke={2} /></span>
        <span className="slab-text">
          <strong>{t.helperTitle}</strong>
          <span className="slab-status"><span className={`pill ${hub.enabled ? 'pill-on' : 'pill-off'}`}>{hub.enabled ? t.helperOn : t.helperOff}</span>{hub.enabled && <span>{t.answeredToday(hub.answeredToday)}</span>}</span>
        </span>
      </button>
    </nav>
    <p className="offline-note"><Icon name="offline" size={20} /> {t.offline}</p>
  </>
}

// ---- Kanga card: the shareable result -------------------------------------------------------

function Kanga({ tone, saying, children }: { tone: Tone; saying?: string; children: ReactNode }) {
  return <article className={`kanga kanga-${tone}`} aria-live="polite">
    <div className="kanga-field">
      {children}
      {saying && <p className="kanga-saying">{saying}</p>}
    </div>
  </article>
}

function ToneMark({ tone }: { tone: Tone }) {
  const icon: IconName = tone === 'good' ? 'check' : tone === 'bad' ? 'alert' : 'question'
  return <span className={`tone-mark tone-${tone}`}><Icon name={icon} size={34} stroke={2.6} /></span>
}

function Confidence({ prob, lang }: { prob: number; lang: Lang }) {
  const filled = Math.round(prob * 5)
  return <p className="confidence">
    <span className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <span key={i} className={i < filled ? 'on' : ''} />)}</span>
    {strings[lang].sure}: {Math.round(prob * 100)}%
  </p>
}

function splitSteps(text?: string): { intro: string; steps: string[] } {
  if (!text) return { intro: '', steps: [] }
  const parts = text.split(/\s*\d\)\s+/)
  return { intro: parts[0].trim(), steps: parts.slice(1).map(step => step.trim()).filter(Boolean) }
}

function labelName(label: string | undefined, lang: Lang): string {
  if (!label) return ''
  return labelNames[lang][label] ?? label.replace(/_/g, ' ')
}

type Reading = { tone: Tone; title: string; detail?: string; steps: string[]; saying?: string; confident?: number }

function readPhoto(decision: Decision, lang: Lang): Reading {
  const t = strings[lang]
  const { intro, steps } = splitSteps(decision.advice_long)
  switch (decision.status) {
    case 'CONFIDENT':
      if (decision.label?.endsWith('_healthy')) return { tone: 'good', title: t.healthy, detail: intro || decision.advice_sms, steps, saying: t.sayingHealthy, confident: decision.prob }
      return { tone: 'bad', title: labelName(decision.label, lang), detail: intro || decision.advice_sms, steps, saying: t.sayingProblem, confident: decision.prob }
    case 'RETAKE':
      return { tone: 'calm', title: t.retakeTitle, detail: t.retake[decision.quality ?? 'blur'] ?? t.retake.blur, steps: [], saying: t.photoTips }
    case 'UNSUPPORTED':
      return { tone: 'unsure', title: t.unsupportedTitle, detail: `${t.unsupported} ${t.askPerson}`, steps: [], saying: t.dontSprayYet }
    default:
      return {
        tone: 'unsure', title: t.notSure,
        detail: [decision.label && !decision.label.endsWith('_healthy') && decision.label !== 'other' ? t.maybe(labelName(decision.label, lang)) + '.' : '', t.askPerson].filter(Boolean).join(' '),
        steps: [], saying: t.dontSprayYet,
      }
  }
}

function CardActions({ lang, reading, sourceTitle }: { lang: Lang; reading: Reading; sourceTitle?: string }) {
  const t = strings[lang]
  const [voice, setVoice] = useState(() => native.canSpeak(lang))
  useEffect(() => {
    // The offline voice engine starts a moment after the app; ask again once.
    const timer = setTimeout(() => setVoice(native.canSpeak(lang)), 1500)
    return () => { clearTimeout(timer); native.stopSpeaking() }
  }, [lang])
  const spoken = [reading.title, reading.detail, ...reading.steps, reading.saying].filter(Boolean).join('. ')
  const summary = `Pandastic: ${reading.title}.${reading.confident ? ` ${t.sure} ${Math.round(reading.confident * 100)}%.` : ''}${reading.detail ? ` ${reading.detail}` : ''}${sourceTitle ? ` (${t.source}: ${sourceTitle})` : ''}`
  return <div className="card-actions">
    <button className="action action-strong" onClick={() => native.draftSms(load(OFFICER_KEY, ''), summary)}><Icon name="person" /> {t.askOfficer}</button>
    {voice && <button className="action" onClick={() => native.speak(spoken, lang)}><Icon name="speaker" /> {t.listen}</button>}
    <button className="action" onClick={() => native.share(summary)}><Icon name="share" /> {t.shareCard}</button>
  </div>
}

function DemoBadge({ show, lang }: { show?: boolean; lang: Lang }) {
  return show ? <p className="demo-badge">{strings[lang].demoBadge}</p> : null
}

// ---- Leaf check ------------------------------------------------------------------------------

function LeafCheck({ lang }: { lang: Lang }) {
  const t = strings[lang]
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<{ file: File; url: string }>()
  const [decision, setDecision] = useState<Decision>()
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  function choose(file?: File) {
    if (!file || !file.type.startsWith('image/')) return
    setDecision(undefined)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function check() {
    if (!photo || busy) return
    setBusy(true)
    try { setDecision(await native.checkPhoto(photo.file, lang)) }
    catch { setDecision({ status: 'ERROR', escalate: true }) }
    finally { setBusy(false) }
  }

  function restart() {
    setPhoto(undefined)
    setDecision(undefined)
    camera.current?.click()
  }

  const reading = decision && readPhoto(decision, lang)
  return <section className="flow">
    <h1>{t.leafTitle}</h1>
    {!photo && <>
      <button className="capture" onClick={() => camera.current?.click()}>
        <Icon name="camera" size={64} stroke={2} />
        <strong>{t.takePhoto}</strong>
      </button>
      <p className="tip">{t.photoTips}</p>
      <button className="link-button" onClick={() => gallery.current?.click()}><Icon name="image" /> {t.choosePhoto}</button>
    </>}

    {photo && !reading && <>
      <div className={`photo-frame ${busy ? 'scanning' : ''}`}>
        <img src={photo.url} alt="" />
        {busy && <span className="scan-line" />}
      </div>
      {busy
        ? <p className="status-line" role="status">{t.checking}</p>
        : <div className="stack">
            <button className="primary" onClick={() => void check()}><Icon name="leafScan" /> {t.checkThis}</button>
            <button className="link-button" onClick={restart}><Icon name="camera" /> {t.takePhoto}</button>
          </div>}
    </>}

    {photo && reading && decision && <>
      <Kanga tone={reading.tone} saying={reading.saying}>
        <div className="verdict">
          <img className="verdict-photo" src={photo.url} alt="" />
          <ToneMark tone={reading.tone} />
        </div>
        <h2>{reading.title}</h2>
        {reading.confident !== undefined && <Confidence prob={reading.confident} lang={lang} />}
        {reading.detail && <p className="detail">{reading.detail}</p>}
        {reading.steps.length > 0 && <>
          <h3>{t.whatToDo}</h3>
          <ol className="steps">{reading.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </>}
        {decision.source?.title && <p className="source">{t.source}: {decision.source.title}</p>}
      </Kanga>
      <DemoBadge show={decision.stub} lang={lang} />
      {decision.status !== 'RETAKE' && <CardActions lang={lang} reading={reading} sourceTitle={decision.source?.title} />}
      <button className="primary" onClick={restart}><Icon name={decision.status === 'RETAKE' ? 'camera' : 'again'} /> {decision.status === 'RETAKE' ? t.takePhoto : t.another}</button>
    </>}

    <input className="visually-hidden" ref={camera} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
    <input className="visually-hidden" ref={gallery} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} />
  </section>
}

// ---- Price check -----------------------------------------------------------------------------

const cropWords: Record<Lang, Record<Crop, string>> = {
  sw: { coffee: 'kahawa', maize: 'mahindi', beans: 'maharage' },
  en: { coffee: 'coffee', maize: 'maize', beans: 'beans' },
}
const cropIcons: Record<Crop, IconName> = { coffee: 'cherry', maize: 'maize', beans: 'bean' }

function PriceCheck({ lang }: { lang: Lang }) {
  const t = strings[lang]
  const [crop, setCrop] = useState<Crop>()
  const [offer, setOffer] = useState('')
  const [decision, setDecision] = useState<Decision>()
  const [busy, setBusy] = useState(false)
  const offerValue = Number(offer.replace(/[^0-9]/g, ''))

  async function check() {
    if (!crop || !offerValue || busy) return
    setBusy(true)
    // Same path as an SMS: the keyword NLU reads crop, intent and the offered number.
    try { setDecision(await native.ask(`${cropWords[lang][crop]} ${lang === 'sw' ? 'bei' : 'price'} ${offerValue}`, lang)) }
    catch { setDecision({ status: 'ERROR', escalate: true }) }
    finally { setBusy(false) }
  }

  if (decision) return <section className="flow">
    <h1>{t.priceTitle}</h1>
    <PriceCard decision={decision} lang={lang} />
    <DemoBadge show={decision.stub} lang={lang} />
    <button className="primary" onClick={() => { setDecision(undefined); setOffer('') }}><Icon name="again" /> {t.checkPrice}</button>
  </section>

  return <section className="flow">
    <h1>{t.priceTitle}</h1>
    <h2 className="question">{t.whichCrop}</h2>
    <div className="crop-choice">
      {(['coffee', 'maize', 'beans'] as Crop[]).map(option =>
        <button key={option} aria-pressed={crop === option} onClick={() => setCrop(option)}>
          <Icon name={cropIcons[option]} size={40} stroke={2} />{t[option]}
        </button>)}
    </div>
    {crop && <form className="offer" onSubmit={event => { event.preventDefault(); void check() }}>
      <label htmlFor="offer"><h2 className="question">{t.offerQuestion}</h2></label>
      <div className="offer-field">
        <input id="offer" inputMode="numeric" autoComplete="off" placeholder="12,000" value={offer}
          onChange={event => setOffer(event.target.value.replace(/[^0-9]/g, '') ? money(Number(event.target.value.replace(/[^0-9]/g, ''))) : '')} />
        <span>{t.perKg}</span>
      </div>
      <button className="primary" type="submit" disabled={!offerValue || busy}><Icon name="scale" /> {busy ? '…' : t.checkPrice}</button>
    </form>}
  </section>
}

function PriceCard({ decision, lang }: { decision: Decision; lang: Lang }) {
  const t = strings[lang]
  const price = decision.price
  if (!price || (decision.status !== 'PRICE' && decision.status !== 'PRICE_STALE')) {
    const reading: Reading = { tone: 'unsure', title: t.notSure, detail: `${t.noPrice} ${t.askPerson}`, steps: [] }
    return <>
      <Kanga tone="unsure" saying={t.sayingPrice}><ToneMark tone="unsure" /><h2>{reading.title}</h2><p className="detail">{reading.detail}</p></Kanga>
      <CardActions lang={lang} reading={reading} />
    </>
  }
  const offer = price.offer ?? undefined
  const gap = price.gap_pct ?? undefined
  const stale = decision.status === 'PRICE_STALE' || price.stale
  const low = gap !== undefined && gap < -5
  const tone: Tone = stale ? 'unsure' : offer === undefined ? 'calm' : low ? 'bad' : 'good'
  const title = offer === undefined ? `${money(price.low)}–${money(price.high)} ${price.currency}` : low ? t.priceLow(Math.round(-gap!)) : t.priceFair
  const lo = Math.min(price.low, offer ?? price.low) * 0.85
  const hi = Math.max(price.high, offer ?? price.high) * 1.1
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`
  const range = price.low === price.high ? money(price.low) : `${money(price.low)}–${money(price.high)}`
  const reading: Reading = { tone, title, detail: `${t.marketPrice}: ${range} ${price.currency}/kg (${monthYear(price.date, lang)})`, steps: [] }

  return <>
    <Kanga tone={tone} saying={t.sayingPrice}>
      <ToneMark tone={tone} />
      <h2>{title}</h2>
      <div className="price-bar" role="img" aria-label={`${t.marketPrice} ${range}${offer ? `, ${t.yourOffer} ${money(offer)}` : ''}`}>
        <span className="price-band" style={{ left: at(price.low), width: price.low === price.high ? '6px' : `calc(${at(price.high)} - ${at(price.low)})` }} />
        {offer !== undefined && <span className={`price-pin ${low ? 'pin-low' : ''}`} style={{ left: at(offer) }} />}
      </div>
      <dl className="price-legend">
        <div><dt><span className="key key-band" />{t.marketPrice}</dt><dd>{range}</dd></div>
        {offer !== undefined && <div><dt><span className={`key key-pin ${low ? 'pin-low' : ''}`} />{t.yourOffer}</dt><dd>{money(offer)}</dd></div>}
      </dl>
      <p className="detail">{price.currency} / kg, {monthYear(price.date, lang)}</p>
      {stale && <p className="detail warn">{t.priceOld(monthYear(price.date, lang))}</p>}
      <p className="source">{t.source}: {price.source_id.startsWith('ucda') ? 'UCDA / MAAIF' : price.source_id.startsWith('wfp') ? 'WFP (HDX)' : price.source_id}</p>
    </Kanga>
    <CardActions lang={lang} reading={reading} />
  </>
}

// ---- SMS helper ------------------------------------------------------------------------------

function Helper({ lang, hub }: { lang: Lang; hub: HubStatus }) {
  const t = strings[lang]
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [officer, setOfficer] = useState(() => load(OFFICER_KEY, ''))
  const [asked, setAsked] = useState(false)

  function addContact() {
    if (number.replace(/[^0-9]/g, '').length < 7) return
    native.setHubContacts([...hub.contacts, { name: name.trim() || 'Mama', number: number.trim() }])
    setName('')
    setNumber('')
  }

  function removeContact(contact: HubContact) {
    native.setHubContacts(hub.contacts.filter(other => other !== contact))
  }

  return <section className="flow">
    <h1>{t.helperTitle}</h1>
    <p className="lead">{t.helperIntro}</p>

    <button className={`switch ${hub.enabled ? 'switch-on' : ''}`} role="switch" aria-checked={hub.enabled}
      disabled={!hub.enabled && hub.contacts.length === 0}
      onClick={() => { setAsked(true); native.setHubEnabled(!hub.enabled) }}>
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span><strong>{hub.enabled ? t.helperOn : t.helperOff}</strong>{hub.enabled && <small>{t.answeredToday(hub.answeredToday)}</small>}</span>
    </button>
    {asked && !hub.enabled && !hub.smsPermission && <p className="detail warn">{t.needsPermission}</p>}

    <div className="panel">
      <h2>{t.whoCanAsk}</h2>
      <ul className="contacts">
        {hub.contacts.map(contact => <li key={contact.number}>
          <span className="avatar">{(contact.name || '?').slice(0, 1)}</span>
          <span><strong>{contact.name}</strong><span>{contact.number}</span></span>
          <button className="icon-button" aria-label={`${t.remove} ${contact.name}`} onClick={() => removeContact(contact)}><Icon name="close" /></button>
        </li>)}
      </ul>
      <form className="add-contact" onSubmit={event => { event.preventDefault(); addContact() }}>
        <input aria-label={t.name} placeholder={t.name} value={name} onChange={event => setName(event.target.value)} />
        <input aria-label={t.number} placeholder="+256 7…" inputMode="tel" value={number} onChange={event => setNumber(event.target.value)} />
        <button className="action" type="submit"><Icon name="plus" /> {t.add}</button>
      </form>
    </div>

    <div className="panel">
      <h2>{t.replyLanguage}</h2>
      <div className="segmented">
        <button aria-pressed={hub.lang === 'sw'} onClick={() => native.setHubLang('sw')}>Kiswahili</button>
        <button aria-pressed={hub.lang === 'en'} onClick={() => native.setHubLang('en')}>English</button>
      </div>
    </div>

    <div className="panel codes">
      <h2>{t.codesTitle}</h2>
      <dl>{t.codes.map(([code, meaning]) => <div key={code}><dt>{code}</dt><dd>{meaning}</dd></div>)}</dl>
      <p className="detail">{t.codesExample}</p>
    </div>

    <div className="panel">
      <h2>{t.officerTitle}</h2>
      <input aria-label={t.officerTitle} placeholder="+256 7…" inputMode="tel" value={officer}
        onChange={event => { setOfficer(event.target.value); save(OFFICER_KEY, event.target.value) }} />
      <p className="detail">{t.officerHint}</p>
    </div>

    <div className="panel">
      <h2>{t.recent}</h2>
      {hub.recent.length === 0 ? <p className="detail">{t.noMessages}</p> : <ol className="thread">
        {hub.recent.map(entry => <li key={entry.id}>
          <p className="bubble bubble-in"><small>{entry.contact || '—'}</small>{entry.question}</p>
          {entry.reply
            ? <p className="bubble bubble-out">{entry.reply}</p>
            : <p className="bubble bubble-note">{entry.status === 'rate_limited' ? t.rateLimited : entry.status === 'failed' ? t.failed : t.pending}</p>}
        </li>)}
      </ol>}
      <p className="detail">{t.privacy}</p>
      {hub.recent.length > 0 && <button className="link-button" onClick={() => native.clearHubHistory()}><Icon name="trash" /> {t.clearHistory}</button>}
    </div>
  </section>
}
