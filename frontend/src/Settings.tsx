import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './Icons'
import { ModeCards, LanguageChoice } from './PhoneSetup'
import { ux } from './ux'
import { strings } from './i18n'
import * as native from './native'
import { load, save } from './storage'
import type { ChatStatus, HubStatus, Lang, PhoneMode } from './native'

export default function Settings({ lang, setLang, mode, chooseMode, chat, hub }: {
  lang: Lang; setLang: (lang: Lang) => void; mode: PhoneMode; chooseMode: (mode: PhoneMode) => void; chat: ChatStatus; hub: HubStatus
}) {
  const t = ux[lang]
  const [peer, setPeer] = useState(chat.peer)
  const [saved, setSaved] = useState(false)
  const [numberError, setNumberError] = useState('')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [contactError, setContactError] = useState('')
  const [asked, setAsked] = useState(false)
  const [ownNumber, setOwnNumber] = useState(() => load('pandastic.own-number'))
  const [ownNumberSaved, setOwnNumberSaved] = useState(false)
  const [ownNumberError, setOwnNumberError] = useState('')
  const [smsView, setSmsView] = useState<'send' | 'reply'>('send')
  const [addingContact, setAddingContact] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const activeView = mode === 'lite' ? 'send' : smsView
  const memory = native.phoneInfo().totalRamMb
  useEffect(() => setPeer(chat.peer), [chat.peer])

  function savePeer(event: FormEvent) {
    event.preventDefault()
    if (peer.trim() && !native.validNumber(peer)) { setNumberError(t.invalidNumber); return }
    native.setSmsPeer(peer.trim()); setNumberError(''); setSaved(true)
  }
  function saveOwnNumber(event: FormEvent) {
    event.preventDefault()
    if (ownNumber.trim() && !native.validNumber(ownNumber)) { setOwnNumberError(t.invalidNumber); setOwnNumberSaved(false); return }
    save('pandastic.own-number', ownNumber.trim())
    setOwnNumberError(''); setOwnNumberSaved(true)
  }
  function addContact(event: FormEvent) {
    event.preventDefault()
    if (!native.validNumber(number)) { setContactError(t.invalidNumber); return }
    if (hub.contacts.some(contact => native.sameNumber(contact.number, number))) { setContactError(t.duplicate); return }
    native.setHubContacts([...hub.contacts, { name: name.trim() || number.trim(), number: number.trim() }])
    setName(''); setNumber(''); setContactError('')
    setAddingContact(false)
    addButton.current?.focus()
  }
  return <section className="page settings-page">
    <h1>{t.settings}</h1>
    <div className="setting-row settings-language"><h2>{t.language}</h2><LanguageChoice lang={lang} setLang={setLang} /></div>
    {mode === 'capable' && <div className="settings-tabs" role="group" aria-label={t.smsSettings}>
      <button type="button" aria-pressed={activeView === 'send'} onClick={() => setSmsView('send')}><Icon name="send" size={18} />{t.sendSettings}</button>
      <button type="button" aria-pressed={activeView === 'reply'} onClick={() => setSmsView('reply')}><Icon name="message" size={18} />{t.replySettings}{hub.enabled && <span className="status-dot" />}</button>
    </div>}
    {activeView === 'send' && <section className="settings-section sms-settings-panel"><h2>{t.contactSettings}</h2><p className="field-hint">{t.numberHint}</p>
      <form className="number-form" onSubmit={savePeer}><label htmlFor="sms-peer">{t.number}</label><input id="sms-peer" autoComplete="tel" inputMode="tel" type="tel" placeholder={t.numberPlaceholder} value={peer} aria-invalid={Boolean(numberError)} aria-describedby={numberError ? 'number-error' : undefined} onChange={event => { setPeer(event.target.value); setSaved(false); setNumberError('') }} />
        {numberError && <p id="number-error" className="field-error" role="alert">{numberError}</p>}<div className="form-action"><button className="primary compact" type="submit">{t.save}</button>{saved && <span className="saved-note" role="status"><Icon name="check" size={16} />{t.saved}</span>}</div>
      </form>
      {!native.isDemo && <div className="setting-row"><div><h3>{t.smsSetup}</h3><p className="field-hint">{chat.smsPermission ? t.granted : t.notGranted}</p></div>{!chat.smsPermission && <button className="secondary compact" onClick={native.enableSms}>{t.allowSms}</button>}</div>}
    </section>}
    {activeView === 'reply' && <section className="settings-section sms-settings-panel"><div className="setting-row helper-setting"><div><h2>{t.aiReplies}</h2><p className="field-hint">{t.aiRepliesHint}</p></div><button className="switch" role="switch" aria-label={t.aiReplies} aria-checked={hub.enabled} disabled={!hub.enabled && hub.contacts.length === 0} onClick={() => { setAsked(true); native.setHubEnabled(!hub.enabled) }}><span /></button></div>
        <p className="helper-status"><span className={`status-dot ${hub.enabled ? 'capable-dot' : 'inactive-dot'}`} />{hub.enabled ? hub.running ? t.helperOn : t.helperStarting : t.helperOff}{hub.enabled && ` · ${strings[lang].answeredToday(hub.answeredToday)}`}</p>
        {hub.contacts.length === 0 && <p className="field-hint">{t.noContacts}</p>}
        {asked && !hub.enabled && !hub.smsPermission && <p className="field-error" role="alert">{t.permission}</p>}
        <h3 className="subsection-title">{t.allowedPhones}</h3>
        {hub.contacts.length > 0 && <ul className="contacts">{hub.contacts.map(contact => <li key={contact.number}><span className="avatar">{(contact.name || '?').slice(0, 1)}</span><span><strong>{contact.name}</strong><small>{contact.number}</small></span><button className="icon-button" aria-label={`${t.remove} ${contact.name}`} onClick={() => { const contacts = hub.contacts.filter(other => other.number !== contact.number); native.setHubContacts(contacts); if (!contacts.length) native.setHubEnabled(false) }}><Icon name="close" size={19} /></button></li>)}</ul>}
        <button ref={addButton} type="button" className="text-button add-phone-button" aria-expanded={addingContact} aria-controls="add-phone-form" onClick={() => setAddingContact(!addingContact)}><Icon name={addingContact ? 'close' : 'plus'} size={18} />{addingContact ? t.cancel : t.add}</button>
        {addingContact && <form id="add-phone-form" className="add-contact" onSubmit={addContact}>
          <div className="contact-fields"><div><label htmlFor="contact-name">{t.name}</label><input id="contact-name" autoComplete="name" autoFocus placeholder={t.namePlaceholder} value={name} onChange={event => setName(event.target.value)} /></div><div><label htmlFor="contact-number">{t.number}</label><input id="contact-number" autoComplete="tel" type="tel" inputMode="tel" placeholder={t.numberPlaceholder} value={number} aria-invalid={Boolean(contactError)} aria-describedby={contactError ? 'contact-error' : undefined} onChange={event => { setNumber(event.target.value); setContactError('') }} /></div></div>
          {contactError && <p id="contact-error" className="field-error" role="alert">{contactError}</p>}<button className="secondary compact" type="submit"><Icon name="check" size={18} />{t.add}</button>
        </form>}
        <div className="setting-row"><h3>{t.replyLanguage}</h3><LanguageChoice lang={hub.lang} setLang={native.setHubLang} /></div>
    </section>}
    <div className="settings-footer"><details className="settings-disclosure"><summary><span>{t.storage}</span><Icon name="arrow" size={17} /></summary><div className="disclosure-content"><p className="field-hint">{t.privacy}</p><button className="danger-link" disabled={!chat.messages.length && !hub.recent.length} onClick={() => { if (window.confirm(t.clearConfirm)) { native.clearChatHistory(); native.clearHubHistory() } }}><Icon name="trash" size={18} />{t.clear}</button></div></details>
    <details className="settings-disclosure phone-demo"><summary><span>{t.phoneSettings}<small>{t.demoSetup}</small></span><span className="phone-mode-label">{ownNumber || (mode === 'lite' ? t.basic : t.capable)}</span><Icon name="arrow" size={17} /></summary><div className="disclosure-content">
      <form className="own-number-form" onSubmit={saveOwnNumber}><label htmlFor="own-number">{t.ownNumber}</label><p className="field-hint">{t.ownNumberHint}</p><input id="own-number" type="tel" inputMode="tel" autoComplete="tel" placeholder={t.numberPlaceholder} value={ownNumber} aria-invalid={Boolean(ownNumberError)} aria-describedby={ownNumberError ? 'own-number-error' : undefined} onChange={event => { setOwnNumber(event.target.value); setOwnNumberSaved(false); setOwnNumberError('') }} />{ownNumberError && <p id="own-number-error" className="field-error" role="alert">{ownNumberError}</p>}<div className="form-action"><button className="secondary compact" type="submit">{t.save}</button>{ownNumberSaved && <span className="saved-note" role="status"><Icon name="check" size={16} />{t.saved}</span>}</div></form>
      <h2 className="demo-mode-title">{t.demoSetup}</h2><ModeCards lang={lang} mode={mode} choose={chooseMode} /><p className="footnote">{t.modeHelp}{memory != null && ` ${t.memory}: ${(memory / 1024).toFixed(1)} GB.`}</p></div></details>
    </div>{native.isDemo && <p className="footnote preview-note">{t.browser}</p>}
  </section>
}
