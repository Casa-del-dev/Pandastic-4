import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from './Icons'
import { ModeCards, LanguageChoice } from './PhoneSetup'
import { ux } from './ux'
import { strings } from './i18n'
import * as native from './native'
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
  const memory = native.phoneInfo().totalRamMb
  useEffect(() => setPeer(chat.peer), [chat.peer])

  function savePeer(event: FormEvent) {
    event.preventDefault()
    if (peer.trim() && !native.validNumber(peer)) { setNumberError(t.invalidNumber); return }
    native.setSmsPeer(peer.trim()); setNumberError(''); setSaved(true)
  }
  function addContact(event: FormEvent) {
    event.preventDefault()
    if (!native.validNumber(number)) { setContactError(t.invalidNumber); return }
    if (hub.contacts.some(contact => native.sameNumber(contact.number, number))) { setContactError(t.duplicate); return }
    native.setHubContacts([...hub.contacts, { name: name.trim() || number.trim(), number: number.trim() }])
    setName(''); setNumber(''); setContactError('')
  }
  return <section className="page settings-page">
    <h1>{t.settings}</h1>
    <section className="settings-section"><h2>{t.phoneSettings}</h2><ModeCards lang={lang} mode={mode} choose={chooseMode} /><p className="footnote">{t.modeHelp}{memory != null && ` ${t.memory}: ${(memory / 1024).toFixed(1)} GB.`}</p>
      <div className="setting-row"><h3>{t.language}</h3><LanguageChoice lang={lang} setLang={setLang} /></div>
    </section>
    <section className="settings-section"><h2>{t.contactSettings}</h2><p className="field-hint">{t.numberHint}</p>
      <form className="number-form" onSubmit={savePeer}><label htmlFor="sms-peer">{t.number}</label><input id="sms-peer" autoComplete="tel" inputMode="tel" type="tel" placeholder={t.numberPlaceholder} value={peer} aria-invalid={Boolean(numberError)} aria-describedby={numberError ? 'number-error' : undefined} onChange={event => { setPeer(event.target.value); setSaved(false); setNumberError('') }} />
        {numberError && <p id="number-error" className="field-error" role="alert">{numberError}</p>}<div className="form-action"><button className="primary compact" type="submit">{t.save}</button>{saved && <span className="saved-note" role="status"><Icon name="check" size={16} />{t.saved}</span>}</div>
      </form>
      {!native.isDemo && <div className="setting-row"><div><h3>{t.smsSetup}</h3><p className="field-hint">{chat.smsPermission ? t.granted : t.notGranted}</p></div>{!chat.smsPermission && <button className="secondary compact" onClick={native.enableSms}>{t.allowSms}</button>}</div>}
    </section>
    {mode === 'capable' && <>
      <section className="settings-section"><div className="setting-row helper-setting"><div><h2>{t.aiReplies}</h2><p className="field-hint">{t.aiRepliesHint}</p></div><button className="switch" role="switch" aria-label={t.aiReplies} aria-checked={hub.enabled} disabled={!hub.enabled && hub.contacts.length === 0} onClick={() => { setAsked(true); native.setHubEnabled(!hub.enabled) }}><span /></button></div>
        <p className="helper-status"><span className={`status-dot ${hub.enabled ? 'capable-dot' : 'inactive-dot'}`} />{hub.enabled ? hub.running ? t.helperOn : t.helperStarting : t.helperOff}{hub.enabled && ` · ${strings[lang].answeredToday(hub.answeredToday)}`}</p>
        {hub.contacts.length === 0 && <p className="field-hint">{t.noContacts}</p>}
        {asked && !hub.enabled && !hub.smsPermission && <p className="field-error" role="alert">{t.permission}</p>}
        <h3 className="subsection-title">{t.allowedPhones}</h3>
        {hub.contacts.length > 0 && <ul className="contacts">{hub.contacts.map(contact => <li key={contact.number}><span className="avatar">{(contact.name || '?').slice(0, 1)}</span><span><strong>{contact.name}</strong><small>{contact.number}</small></span><button className="icon-button" aria-label={`${t.remove} ${contact.name}`} onClick={() => { const contacts = hub.contacts.filter(other => other.number !== contact.number); native.setHubContacts(contacts); if (!contacts.length) native.setHubEnabled(false) }}><Icon name="close" size={19} /></button></li>)}</ul>}
        <form className="add-contact" onSubmit={addContact}><label htmlFor="contact-name">{t.name}</label><input id="contact-name" placeholder={t.namePlaceholder} value={name} onChange={event => setName(event.target.value)} /><label htmlFor="contact-number">{t.number}</label><input id="contact-number" type="tel" inputMode="tel" placeholder={t.numberPlaceholder} value={number} aria-invalid={Boolean(contactError)} onChange={event => { setNumber(event.target.value); setContactError('') }} />{contactError && <p className="field-error" role="alert">{contactError}</p>}<button className="secondary compact" type="submit"><Icon name="plus" size={18} />{t.add}</button></form>
        <div className="setting-row"><h3>{t.replyLanguage}</h3><LanguageChoice lang={hub.lang} setLang={native.setHubLang} /></div>
      </section>

    </>}
    <section className="settings-section"><h2>{t.storage}</h2><p className="field-hint">{t.privacy}</p><button className="danger-link" disabled={!chat.messages.length && !hub.recent.length} onClick={() => { if (window.confirm(t.clearConfirm)) { native.clearChatHistory(); native.clearHubHistory() } }}><Icon name="trash" size={18} />{t.clear}</button></section>
    {native.isDemo && <p className="footnote preview-note">{t.browser}</p>}
  </section>
}
