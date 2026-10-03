import { useEffect, useRef, useState } from 'react'
import { Icon, Panda, type IconName } from './Icons'
import { respond, type Attachment } from './assistant'

type Page = 'assistant' | 'activity' | 'models' | 'devices'
type Message = { id: string; role: 'user' | 'assistant'; text: string; attachment?: Attachment; time: string }
const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'assistant', label: 'Assistant', icon: 'chat' },
  { id: 'activity', label: 'Activity', icon: 'history' },
  { id: 'models', label: 'Local models', icon: 'chip' },
  { id: 'devices', label: 'Phone connections', icon: 'phone' },
]
const maxAttachmentBytes = 10 * 1024 * 1024

export default function App() {
  const [page, setPage] = useState<Page>('assistant')
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<Attachment>()
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const conversationEnd = useRef<HTMLDivElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const microphonePending = useRef(false)
  const requestController = useRef<AbortController | null>(null)
  const urls = useRef(new Set<string>())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const stopWhenPaused = () => { if (recorder.current?.state === 'recording') recorder.current.stop() }
    const onVisibilityChange = () => { if (document.hidden) stopWhenPaused() }
    window.addEventListener('pandastic:pause', stopWhenPaused)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      alive.current = false
      window.removeEventListener('pandastic:pause', stopWhenPaused)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      requestController.current?.abort()
      if (recordingTimer.current) clearTimeout(recordingTimer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach(track => track.stop())
      urls.current.forEach(url => URL.revokeObjectURL(url))
      urls.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const interval = setInterval(() => setSeconds(value => value + 1), 1000)
    return () => clearInterval(interval)
  }, [recording])

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, busy, page])

  function discardAttachment() {
    if (attachment) {
      URL.revokeObjectURL(attachment.url)
      urls.current.delete(attachment.url)
    }
    setAttachment(undefined)
  }

  function attach(file: File, kind: Attachment['kind']) {
    if (file.size > maxAttachmentBytes) {
      setNotice('Please choose a file smaller than 10 MB.')
      return
    }
    discardAttachment()
    const url = URL.createObjectURL(file)
    urls.current.add(url)
    setAttachment({ id: crypto.randomUUID(), file, kind, url })
    setNotice('')
    setPage('assistant')
  }

  function chooseImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Please choose an image file.')
      return
    }
    attach(file, 'image')
  }

  async function toggleRecording() {
    if (microphonePending.current) return
    if (recorder.current?.state === 'recording') {
      recorder.current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Recording is unavailable here. Use localhost or HTTPS in a browser that supports microphone recording.')
      return
    }
    try {
      microphonePending.current = true
      setNotice('')
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { audioStream.getTracks().forEach(track => track.stop()); return }
      stream.current = audioStream
      const mediaRecorder = new MediaRecorder(audioStream)
      recorder.current = mediaRecorder
      const chunks: BlobPart[] = []
      mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      mediaRecorder.onstop = () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current)
        audioStream.getTracks().forEach(track => track.stop())
        recorder.current = null
        stream.current = null
        if (!alive.current) return
        setRecording(false)
        const mime = mediaRecorder.mimeType || 'audio/webm'
        const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
        const file = new File(chunks, `voice-note.${extension}`, { type: mime })
        if (file.size) attach(file, 'audio')
        else setNotice('The recording was empty. Please try again.')
      }
      mediaRecorder.onerror = () => {
        audioStream.getTracks().forEach(track => track.stop())
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
        if (alive.current) { setRecording(false); setNotice('Recording failed. Please try again.') }
      }
      mediaRecorder.start()
      setSeconds(0)
      setRecording(true)
      setPage('assistant')
      recordingTimer.current = setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
      }, 30000)
    } catch {
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      setNotice('Could not access the microphone. Check your browser permissions and try again.')
    } finally {
      microphonePending.current = false
    }
  }

  async function send() {
    if ((!draft.trim() && !attachment) || busy || recording) return
    const request = { text: draft.trim(), attachment }
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages(previous => [...previous, { ...request, id: crypto.randomUUID(), role: 'user', time }])
    setDraft('')
    setAttachment(undefined)
    setBusy(true)
    setNotice('')
    const controller = new AbortController()
    requestController.current = controller
    try {
      const text = await respond(request, controller.signal)
      if (!alive.current || controller.signal.aborted) return
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text, time }])
    } catch {
      if (!controller.signal.aborted && alive.current) setNotice('Could not prepare the response. Please try again.')
    } finally {
      if (alive.current && !controller.signal.aborted) setBusy(false)
    }
  }

  function newConversation() {
    requestController.current?.abort()
    urls.current.forEach(url => URL.revokeObjectURL(url))
    urls.current.clear()
    setMessages([])
    setAttachment(undefined)
    setDraft('')
    setBusy(false)
    setNotice('')
    setPage('assistant')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('assistant') }}>
        <span className="brand-mark"><Panda size={39} /></span>
        <span>Pandastic<span className="brand-subtitle">A little closer to answers.</span></span>
      </a>
      <button className="new-chat" onClick={newConversation} disabled={recording}><Icon name="plus" size={18} /> New conversation</button>
      <span className="section-label nav-label">YOUR SPACE</span>
      <nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)} aria-current={page === item.id ? 'page' : undefined}>
        <Icon name={item.icon} size={19} /><span>{item.label}</span>{page === item.id && <span className="nav-dot" />}
      </button>)}</nav>
      <div className="sidebar-bottom">
        <div className="offline-note"><span className="leaf-icon"><Icon name="leaf" /></span><strong>Built to stay local.</strong><p>Your companion, even when the internet isn’t there.</p></div>
        <div className="profile"><span className="profile-avatar"><Icon name="phone" size={19} /></span><div><strong>This device</strong><span>AI host · frontend preview</span></div><span className="profile-dot" /></div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Your workspace <Icon name="chevron" size={13} /> <strong>{navigation.find(item => item.id === page)?.label}</strong></div><span className="preview-badge"><span /> Frontend preview</span></header>
      <main className={`main-layout ${page !== 'assistant' ? 'single-column' : ''}`}>
        <section className="primary-content">
          {page === 'assistant' && <>
            <div className="page-heading"><div><div className="eyebrow">YOUR LOCAL COMPANION</div><h1>A little help, right here.</h1><p>Ask a question. Share a picture. Find your next step.</p></div><span className="local-tag"><Icon name="shield" size={15} /> On this device</span></div>
            <div className="conversation-card">
              {messages.length === 0 ? <div className="welcome">
                <div className="panda-scene"><span className="scene-ring" /><span className="scene-spark one">✦</span><span className="scene-spark two">✧</span><Panda size={105} /><span className="scene-leaf"><Icon name="leaf" size={23} /></span></div>
                <div className="welcome-kicker">HELLO, I’M PANDASTIC</div><h2>What’s on your mind?</h2><p>Start with something small.<br />A question, a moment, or a picture worth understanding.</p>
                <div className="starter-grid">
                  <button onClick={() => fileInput.current?.click()} disabled={recording}><span className="starter-icon peach"><Icon name="image" size={23} /></span><strong>Show me a picture</strong><span>Choose a photo to explore</span><Icon name="arrow" size={17} /></button>
                  <button onClick={toggleRecording}><span className="starter-icon sage"><Icon name={recording ? 'stop' : 'mic'} size={23} /></span><strong>{recording ? 'Finish recording' : 'Let’s talk'}</strong><span>{recording ? 'Save your voice note' : 'Start with your voice'}</span><Icon name="arrow" size={17} /></button>
                  <button onClick={() => { setDraft('Help me think through a problem.'); textInput.current?.focus() }} disabled={recording}><span className="starter-icon lavender"><Icon name="sparkle" size={23} /></span><strong>Think it through</strong><span>Make room for a question</span><Icon name="arrow" size={17} /></button>
                </div>
                <div className="welcome-footnote"><Icon name="shield" size={14} /> No cloud requests. Your input stays here.</div>
              </div> : <div className="messages" aria-live="polite">
                <div className="conversation-date">THIS CONVERSATION · PREVIEW</div>
                {messages.map(message => <article key={message.id} className={`message ${message.role}`}>
                  <span className={`message-avatar ${message.role}`}>{message.role === 'assistant' ? <Panda size={31} /> : 'Y'}</span>
                  <div className="message-body"><div className="message-meta"><strong>{message.role === 'assistant' ? 'Pandastic' : 'You'}</strong><span>{message.time}</span>{message.role === 'assistant' && <span className="demo-label">Demo response</span>}</div>
                    {message.attachment?.kind === 'image' && <img className="message-image" src={message.attachment.url} alt="Your attached picture" />}
                    {message.attachment?.kind === 'audio' && <audio controls src={message.attachment.url} aria-label="Your recorded voice note" />}
                    {message.text && <p>{message.text}</p>}
                  </div>
                </article>)}
                {busy && <div className="pending" role="status">Preparing a preview response…</div>}
                <div ref={conversationEnd} />
              </div>}
              <form className="composer-area" onSubmit={event => { event.preventDefault(); void send() }}>
                {notice && <div className="notice" role="alert">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
                {attachment && <div className="attachment-preview">{attachment.kind === 'image' ? <img src={attachment.url} alt="Selected picture" /> : <audio controls src={attachment.url} aria-label="Voice note preview" />}<div><strong>{attachment.kind === 'image' ? 'Picture attached' : 'Voice note attached'}</strong><span>{attachment.file.name}</span></div><button type="button" onClick={discardAttachment} aria-label="Remove attachment"><Icon name="close" size={17} /></button></div>}
                <div className={`composer ${recording ? 'is-recording' : ''}`}>
                  {recording ? <div className="recording-status" role="status"><span className="record-dot" /> Recording · {seconds}s<span className="recording-hint">Stops at 30 seconds</span></div> : <textarea ref={textInput} aria-label="Your question" placeholder="Ask anything, or add a picture…" value={draft} onChange={event => setDraft(event.target.value)} rows={2} disabled={busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />}
                  <div className="composer-toolbar"><div className="composer-actions"><button type="button" title="Choose a photo" aria-label="Choose a photo" disabled={busy || recording} onClick={() => fileInput.current?.click()}><Icon name="image" /></button><button type="button" title="Take a photo" aria-label="Take a photo" disabled={busy || recording} onClick={() => cameraInput.current?.click()}><Icon name="camera" /></button><span className="toolbar-divider" /><button className={recording ? 'record-active' : ''} type="button" title={recording ? 'Stop recording' : 'Record voice note'} aria-label={recording ? 'Stop recording' : 'Record voice note'} onClick={toggleRecording} disabled={busy}><Icon name={recording ? 'stop' : 'mic'} /></button></div><span className="composer-mode">{recording ? 'Microphone active' : 'Preview mode'}</span><button className="send-button" type="submit" aria-label="Send request" disabled={busy || recording || (!draft.trim() && !attachment)}><Icon name="send" size={19} /></button></div>
                </div>
                <p className="composer-caption">Local model not connected yet. Responses are demonstrations.</p>
              </form>
            </div>
          </>}

          {page === 'activity' && <><PageHeading eyebrow="A LITTLE HISTORY" title="Your activity" description="Questions and moments from this session." /><div className="detail-card"><div className="card-title"><Icon name="history" /><h2>Recent requests</h2><span className="count-badge">{messages.filter(m => m.role === 'user').length}</span></div>{messages.filter(m => m.role === 'user').length ? messages.filter(m => m.role === 'user').map(message => <div className="activity-row" key={message.id}><span className="activity-icon"><Icon name={message.attachment?.kind === 'image' ? 'image' : message.attachment?.kind === 'audio' ? 'mic' : 'chat'} /></span><div><strong>{message.text || (message.attachment?.kind === 'image' ? 'Picture request' : 'Voice note')}</strong><span>On this device · Preview request</span></div><time>{message.time}</time></div>) : <EmptyState icon="history" title="A fresh start." text="Send your first request to see it here. History is kept only while this page is open." />}</div></>}

          {page === 'models' && <><PageHeading eyebrow="INTELLIGENCE ON YOUR PHONE" title="Local models" description="The building blocks of your offline companion." /><div className="info-banner"><Icon name="chip" /><p>No model runtime is connected yet. The frontend is ready for a local Android model adapter.</p></div><div className="model-grid">{([{ icon: 'chat', title: 'Text understanding', text: 'Turn questions into useful answers.', label: 'Local language model' }, { icon: 'image', title: 'Picture understanding', text: 'Ask about the world in a photo.', label: 'Local vision model' }, { icon: 'mic', title: 'Speech understanding', text: 'Turn your voice into a question.', label: 'Offline speech recognition' }, { icon: 'signal', title: 'Spoken answers', text: 'Hear a reply in a familiar voice.', label: 'Offline text-to-speech' }] as const).map(model => <div className="detail-card model-card" key={model.title}><span className="model-icon"><Icon name={model.icon} size={25} /></span><h2>{model.title}</h2><p>{model.text}</p><span className="model-type">{model.label}</span><div className="model-state"><span className="status-dot muted" /> Not connected</div></div>)}</div></>}

          {page === 'devices' && <><PageHeading eyebrow="HELP THAT REACHES FURTHER" title="Phone connections" description="One phone runs the models. Another calls on them." /><div className="detail-card connection-overview"><div className="connection-device"><span className="device-illustration"><Icon name="phone" size={46} /><Icon name="chip" size={18} /></span><strong>Strong phone</strong><span>Runs the AI locally</span><span className="subtle-badge">This interface</span></div><div className="connection-line"><span /><Icon name="signal" size={22} /><span /><small>Carrier call / SMS / MMS</small></div><div className="connection-device"><span className="device-illustration small-device"><Icon name="phone" size={39} /></span><strong>Small phone</strong><span>Asks, listens, receives</span><span className="subtle-badge">Not connected</span></div></div><div className="info-banner"><Icon name="phone" /><p>Phone-line integration is planned. No calls or messages are handled by this preview. The final connection must work without internet or Wi-Fi.</p></div><div className="detail-card"><div className="card-title"><Icon name="shield" /><h2>Before connecting</h2></div><div className="requirement-row"><span>01</span><div><strong>Confirm the phones</strong><p>Device models, Android versions, and carrier support.</p></div></div><div className="requirement-row"><span>02</span><div><strong>Prove the call audio path</strong><p>Check whether a carrier call can reach the strong phone’s local model.</p></div></div><div className="requirement-row"><span>03</span><div><strong>Choose each channel</strong><p>Voice calls for conversation; SMS/MMS support must be checked separately.</p></div></div></div></>}
        </section>

        {page === 'assistant' && <aside className="context-panel">
          <div className="context-title"><span className="section-label">YOUR COMPANION</span><Icon name="sparkle" size={15} /></div>
          <div className="host-card"><div className="host-card-top"><span className="host-icon"><Icon name="phone" size={24} /></span><span className="subtle-badge">AI host</span></div><h3>Small footprint.<br />Big possibilities.</h3><p>Designed to run on your strong phone, with no cloud model needed.</p><div className="host-status"><span className="status-dot muted" /> Model awaiting setup</div><button onClick={() => setPage('models')}>Explore local models <Icon name="arrow" size={16} /></button></div>
          <div className="capabilities"><h3>A few ways to begin</h3><div><Icon name="chat" size={17} /><span>Work through a question</span></div><div><Icon name="image" size={17} /><span>Look closer at a picture</span></div><div><Icon name="mic" size={17} /><span>Say it in your own words</span></div></div>
          <div className="phone-note"><span className="phone-note-icon"><Icon name="signal" size={18} /></span><h3>Beyond this phone</h3><p>A lighter phone will be able to reach this companion through carrier calls or messages.</p><button onClick={() => setPage('devices')}>See the connection plan <Icon name="arrow" size={15} /></button></div>
          <p className="context-footer">Made for places where<br />connection looks a little different.</p>
        </aside>}
      </main>
      <footer className="workspace-footer"><span>PANDASTIC <span className="footer-dot">·</span> LOCAL BY DESIGN</span><span>One question at a time.</span></footer>
    </div>
    <input className="visually-hidden" ref={fileInput} type="file" accept="image/*" tabIndex={-1} aria-label="Select image file" onChange={event => { chooseImage(event.target.files?.[0]); event.target.value = '' }} />
    <input className="visually-hidden" ref={cameraInput} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-label="Capture image" onChange={event => { chooseImage(event.target.files?.[0]); event.target.value = '' }} />
  </div>
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="empty-state"><Icon name={icon} size={34} /><h3>{title}</h3><p>{text}</p></div>
}
