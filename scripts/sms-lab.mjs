#!/usr/bin/env node
// SMS lab: test the SMS helper end to end on emulators, by hand or automatically.
//
// The Android emulator no longer delivers SMS from one emulator to another, so this script plays the
// carrier: it watches each emulator's sent messages (content://sms/sent) and delivers them to the other
// one with `adb emu sms send`, as if the SIM numbers below were real. Phones that exist only in the
// terminal ("virtual phones") can text the helper too, like a farmer's basic phone.
//
//   node scripts/sms-lab.mjs setup    # configure: helper phone (capable, SMS helper on, Swahili; --en) + Basic phone
//   node scripts/sms-lab.mjs relay    # be the carrier while you text by hand in the Basic phone's Chat screen
//   node scripts/sms-lab.mjs phone    # a basic phone in this terminal: type an SMS, read the helper's reply
//   node scripts/sms-lab.mjs test     # automated SMS suite (clears the helper's history first: rate limits)
//
//   HUB=emulator-5554 BASIC=emulator-5556 node scripts/sms-lab.mjs ...   (these are the defaults)
//   Start the second emulator with: emulator -avd pandastic_basic -port 5556 (see docs/TESTING.md)
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { ADB, adbFor, connectApp, sleep } from './lib/devtools.mjs'
import { execFileSync } from 'node:child_process'

const HUB = process.env.HUB || 'emulator-5554'
const BASIC = process.env.BASIC || 'emulator-5556'
// The SIM numbers the lab pretends each phone has (Uganda format; nothing is really sent).
const NUMBER = { hub: '+256772000001', basic: '+256772000002', phone: '+256772000003', phone2: '+256772000004',
  stranger: '+256779999999' }
const APK = new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url).pathname

const digits = n => String(n).replace(/[^0-9]/g, '')
const same = (a, b) => digits(a).slice(-9) === digits(b).slice(-9)
const online = serial => {
  try { return execFileSync(ADB, ['-s', serial, 'get-state'], { encoding: 'utf8' }).trim() === 'device' } catch { return false }
}
const nameOf = number => same(number, NUMBER.hub) ? 'helper phone' : same(number, NUMBER.basic) ? 'Basic phone'
  : same(number, NUMBER.phone) ? 'terminal phone' : number

// ---- the carrier ---------------------------------------------------------------------------------

/** Reads new rows of a device's sent box. `content query` prints one row per line; a body may span lines. */
function sentSince(serial, lastId) {
  let out = ''
  try {
    out = adbFor(serial)('shell', 'content', 'query', '--uri', 'content://sms/sent', '--projection', '_id:address:body',
      '--where', `"_id>${lastId}"`, '--sort', '"_id ASC"')
  } catch { return [] }
  const rows = []
  for (const line of out.split('\n')) {
    const m = line.match(/^Row: \d+ _id=(\d+), address=([^,]*), body=(.*)$/)
    if (m) rows.push({ id: Number(m[1]), to: m[2], body: m[3] })
    else if (rows.length && line && !line.startsWith('No result')) rows.at(-1).body += '\n' + line
  }
  return rows
}
function lastSentId(serial) {
  const rows = sentSince(serial, 0)
  return rows.length ? Math.max(...rows.map(r => r.id)) : 0
}
/** Delivers one SMS into an emulator as if it came from `from` (the emulator splits long text into parts). */
function deliver(serial, from, body) {
  adbFor(serial)('emu', 'sms', 'send', digits(from), body.replace(/\s*\n\s*/g, ' '))
}

/**
 * Polls both emulators' sent boxes and delivers each message to its recipient: another emulator, or a
 * virtual phone (onVirtual). Returns a stop function.
 */
function startCarrier({ onVirtual = () => {}, log = console.log } = {}) {
  const phones = [{ serial: HUB, number: NUMBER.hub }, ...(online(BASIC) ? [{ serial: BASIC, number: NUMBER.basic }] : [])]
  for (const p of phones) p.last = lastSentId(p.serial)
  let stopped = false
  ;(async () => {
    while (!stopped) {
      for (const p of phones) {
        for (const sms of sentSince(p.serial, p.last)) {
          p.last = sms.id
          const target = phones.find(q => q !== p && same(q.number, sms.to))
          if (target) {
            log(`  [carrier] ${nameOf(p.number)} -> ${nameOf(target.number)}: ${oneLine(sms.body)}`)
            deliver(target.serial, p.number, sms.body)
          } else onVirtual({ from: p.number, to: sms.to, body: sms.body, at: Date.now() })
        }
      }
      await sleep(700)
    }
  })()
  return () => { stopped = true }
}
const oneLine = text => text.replace(/\s+/g, ' ').slice(0, 160)

// ---- setup ---------------------------------------------------------------------------------------

async function setup() {
  if (!online(HUB)) throw new Error(`${HUB} is not running: start the emulator first (make run)`)
  const devices = [HUB, ...(online(BASIC) ? [BASIC] : [])]
  if (!online(BASIC)) console.log(`note: ${BASIC} is not running; only the terminal phone will work (see docs/TESTING.md)`)
  for (const serial of devices) {
    const adb = adbFor(serial)
    const installed = adb('shell', 'pm', 'list', 'packages', 'org.pandastic.relay').includes('org.pandastic.relay')
    if (!installed || process.argv.includes('--install')) {
      if (!existsSync(APK)) throw new Error('no debug APK: run make build first')
      console.log(`${serial}: installing ${APK}`)
      adb('install', '-r', APK)
    }
    for (const p of ['RECEIVE_SMS', 'SEND_SMS', 'POST_NOTIFICATIONS']) {
      try { adb('shell', 'pm', 'grant', 'org.pandastic.relay', `android.permission.${p}`) } catch { /* older Android */ }
    }
    try { adb('shell', 'dumpsys', 'deviceidle', 'whitelist', '+org.pandastic.relay') } catch { /* no battery prompt */ }
  }

  const hub = await connectApp(HUB, 9333)
  await hub.evaluate(`PandasticNative.setPhoneMode('capable')`)
  await hub.evaluate(`PandasticNative.setHubContacts(${JSON.stringify(JSON.stringify([
    { name: 'Noor (Basic phone)', number: NUMBER.basic }, { name: 'Noor (kabambe)', number: NUMBER.phone },
    { name: 'Juma (kabambe)', number: NUMBER.phone2 }]))})`)
  await hub.evaluate(`PandasticNative.setHubLang('${process.argv.includes('--en') ? 'en' : 'sw'}')`)  // Swahili first
  await hub.evaluate(`PandasticNative.setHubEnabled(true)`)
  let status = {}
  for (let i = 0; i < 20 && !status.running; i++) { await sleep(500); status = JSON.parse(await hub.evaluate('PandasticNative.hubStatus()')) }
  hub.close()
  if (!status.running) throw new Error(`SMS helper did not start on ${HUB}: ${JSON.stringify(status)}`)
  console.log(`${HUB}: helper phone ${NUMBER.hub}, SMS helper ON, replies in the SMS's language (default ${status.lang === 'en' ? 'English' : 'Swahili'}), allows ${NUMBER.basic} + ${NUMBER.phone}`)

  if (online(BASIC)) {
    const basic = await connectApp(BASIC, 9334)
    await basic.evaluate(`PandasticNative.setPhoneMode('lite')`)
    await basic.evaluate(`PandasticNative.setSmsPeer(${JSON.stringify(NUMBER.hub)})`)
    basic.close()
    console.log(`${BASIC}: Basic phone ${NUMBER.basic}, chats with ${NUMBER.hub}`)
  }
  console.log(`\nNext: node scripts/sms-lab.mjs relay   (then type in the Basic phone's Chat screen)\n   or: node scripts/sms-lab.mjs phone   (type here)`)
}

// ---- interactive -----------------------------------------------------------------------------------

async function relay() {
  console.log(`Carrier running between ${HUB} (${NUMBER.hub}) and ${online(BASIC) ? `${BASIC} (${NUMBER.basic})` : 'no Basic phone'}. Ctrl+C to stop.`)
  startCarrier({ onVirtual: sms => console.log(`  [carrier] ${nameOf(sms.from)} -> ${sms.to}: ${oneLine(sms.body)}  (no such phone in the lab)`) })
  await new Promise(() => {})
}

async function phone() {
  const me = process.argv[3] && /\d/.test(process.argv[3]) ? process.argv[3] : NUMBER.phone
  console.log(`You are a basic phone, ${me}. Type an SMS for the helper phone (${NUMBER.hub}); Ctrl+D to stop.`)
  console.log(`Try: P 1 12000 | bei ya kahawa 12000 | mahindi bei 900 | ? | majani ya kahawa yana unga wa njano`)
  startCarrier({
    log: () => {},
    onVirtual: sms => { if (same(sms.to, me)) console.log(`\n< ${sms.body}\n`) },
  })
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })
  rl.prompt()
  rl.on('line', line => {
    if (line.trim()) { deliver(HUB, me, line.trim()); console.log('  (sent; the helper answers in 1-30 s)') }
    rl.prompt()
  })
  await new Promise(resolve => rl.on('close', resolve))
  process.exit(0)
}

// ---- automated suite -----------------------------------------------------------------------------

const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/
function segments(text) {
  if (GSM7.test(text)) return text.length <= 160 ? 1 : Math.ceil(text.length / 153)
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67)
}

async function test() {
  if (!online(HUB)) throw new Error(`${HUB} is not running`)
  const hub = await connectApp(HUB, 9333)
  const before = JSON.parse(await hub.evaluate('PandasticNative.hubStatus()'))
  if (!before.running) throw new Error('the SMS helper is off: run node scripts/sms-lab.mjs setup first')
  if (!process.argv.includes('--keep-history')) await hub.evaluate('PandasticNative.clearHubHistory()')
  const sw = before.lang !== 'en'
  console.log(`helper ${HUB}, replies in ${sw ? 'Swahili' : 'English'}; virtual phones ${NUMBER.phone}, ${NUMBER.stranger}\n`)

  const inbox = []
  const stop = startCarrier({ log: () => {}, onVirtual: sms => inbox.push(sms) })
  const results = []
  async function sms(name, from, text, check, { timeoutMs = 45000, expectReply = true } = {}) {
    const sentAt = Date.now()
    deliver(HUB, from, text)
    let reply
    while (!reply && Date.now() - sentAt < (expectReply ? timeoutMs : 12000)) {
      await sleep(400)
      reply = inbox.find(m => same(m.to, from) && m.at >= sentAt)
    }
    if (reply) inbox.splice(inbox.indexOf(reply), 1)
    let ok, note
    if (!expectReply) { ok = !reply; note = reply ? `unexpected reply: ${oneLine(reply.body)}` : 'no reply, as expected' }
    else if (!reply) {  // say why: the helper's log knows (rate_limited, failed, still pending)
      const entry = JSON.parse(await hub.evaluate('PandasticNative.hubStatus()')).recent
        .find(e => e.question === text && e.receivedAt >= sentAt - 5000)
      ok = false
      note = entry ? `no reply: helper log says "${entry.status}"${entry.status === 'rate_limited' ? ' (10 per number per hour; run without --keep-history)' : ''}`
        : 'no reply, and the helper never logged the SMS'
    }
    else {
      const parts = segments(reply.body)
      const problem = parts > 2 ? `${parts} SMS parts (max 2)` : !reply.body.startsWith('Pandastic:') ? 'reply without the Pandastic: prefix'
        : check(reply.body)
      ok = !problem
      note = `${((reply.at - sentAt) / 1000).toFixed(1)} s, ${parts} part${parts > 1 ? 's' : ''}: ${oneLine(reply.body)}${problem ? `  <- ${problem}` : ''}`
    }
    results.push({ ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      > ${text}\n      < ${note}`)
  }
  const has = (re, why) => body => re.test(body) ? null : why

  await sms('price code with an offer', NUMBER.phone, 'P 1 12000', has(/UGX ?15,500/, 'no UGX 15,500 coffee price'))
  await sms('Swahili coffee price question', NUMBER.phone, 'bei ya kahawa leo ni ngapi? wananipa 12000',
    has(/UGX/, 'no price in the reply'))
  await sms('maize price without a price word', NUMBER.phone, 'mahindi 900', has(/UGX/, 'no maize price'))
  await sms('beans price in English', NUMBER.phone, 'beans price 3000', has(/UGX/, 'no beans price'))
  await sms('menu', NUMBER.phone, '?', has(/P ?1|bei|price/i, 'menu does not explain the price code'))
  await sms('symptom in words: never a confident diagnosis', NUMBER.phone, 'majani ya kahawa yana unga wa njano',
    body => /hakika|sure|picha|photo|afisa|officer|uliza|ask/i.test(body) ? null : 'no "not sure / ask a person / photo" guidance')
  await sms('price without a crop asks which crop', NUMBER.phone, 'bei ni ngapi leo?',
    has(/kahawa|mahindi|maharage|coffee|maize|beans/i, 'does not ask which crop'))
  // Read by the language model when one is side-loaded (another sender: 10 answers per number per hour).
  const safe = body => /hakika|sure|afisa|officer|uliza|ask/i.test(body) ? null : 'no "not sure / ask a person" wording'
  // "emmwanyi" = coffee in Luganda; the keywords don't know it, so no disease of another crop may be named.
  await sms('Luganda coffee problem: safe, no other crop\'s disease', NUMBER.phone2,
    'emmwanyi zange zirwadde amakoola gafuuse kyenvu',
    body => safe(body) ?? (/mahindi|maize|maharage|bean/i.test(body) ? 'names a maize/bean disease for coffee' : null),
    { timeoutMs: 60000 })
  await sms('symptom the keywords miss (fine-tuned LLM names it, still not sure)', NUMBER.phone2,
    'coffee leaves have grey spots with brown ring', safe, { timeoutMs: 60000 })
  await sms('pest the keywords miss (fine-tuned LLM names it, still not sure)', NUMBER.phone2,
    'Wadudu wanachimba ndani ya majani ya kahawa', safe, { timeoutMs: 60000 })
  await sms('unknown number gets no reply (allowlist)', NUMBER.stranger, 'P 1 12000', () => null, { expectReply: false })
  await sms('own echo is ignored (no reply loops)', NUMBER.phone, 'Pandastic: test echo', () => null, { expectReply: false })

  if (online(BASIC)) {
    const basic = await connectApp(BASIC, 9334)
    const sentAt = Date.now()
    const r = await basic.evaluate(`__e2e.result('__pandasticSmsReply', 'sendSms', [${JSON.stringify(NUMBER.hub)}, 'bei ya kahawa 12000'], 30000)`)
    let got
    while (!got && Date.now() - sentAt < 60000) {
      await sleep(700)
      got = JSON.parse(await basic.evaluate('PandasticNative.chatStatus()')).messages
        .find(m => m.direction === 'in' && same(m.number, NUMBER.hub) && m.time >= sentAt)
    }
    const ok = r.ok && got && /UGX/.test(got.body)
    results.push({ ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  Basic phone app -> helper -> Basic phone chat\n      > bei ya kahawa 12000\n      < ${got ? `${((got.time - sentAt) / 1000).toFixed(1)} s: ${oneLine(got.body)}` : `no reply in the chat (send ${JSON.stringify(r)})`}`)
    basic.close()
  } else console.log(`SKIP  Basic phone app round trip (${BASIC} not running)`)

  stop()
  const after = JSON.parse(await hub.evaluate('PandasticNative.hubStatus()'))
  hub.close()
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed; helper answered ${after.answeredToday} today`)
  process.exit(failed ? 1 : 0)
}

const keepAlive = setInterval(() => {}, 1000)  // Node's WebSocket alone does not keep the process alive
const command = process.argv[2]
const commands = { setup, relay, phone, test }
if (!commands[command]) {
  console.log('usage: node scripts/sms-lab.mjs setup | relay | phone [number] | test [--keep-history]')
  process.exit(2)
}
try {
  await commands[command]()
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(1)
}
clearInterval(keepAlive)
process.exit(0)
