#!/usr/bin/env node
// Real Android Contacts -> native bridge -> Settings suggestions. Never sends an SMS.
import assert from 'node:assert/strict'
import { connectApp, sleep } from './lib/devtools.mjs'
const devices = [[process.env.HUB || 'emulator-5554', '+256772000001', '+256772000002', 9391], [process.env.BASIC || 'emulator-5556', '+256772000002', '+256772000001', 9392]]
for (const [serial, own, peer, port] of devices) {
  const app = await connectApp(serial, port)
  const original = JSON.parse(await app.evaluate('PandasticNative.hubStatus()'))
  const originalPeer = JSON.parse(await app.evaluate('PandasticNative.chatStatus()')).peer
  try {
    const info = await app.evaluate('JSON.parse(PandasticNative.phoneInfo())')
    assert.equal(info.number, own)
    assert.equal(info.numberSource, 'lab')
    const contacts = await app.evaluate("__e2e.result('__pandasticContactsReply', 'phoneContacts', [], 10000)")
    assert.ok(contacts.contacts.some(contact => contact.number === peer), 'The opposite phone must exist in Android Contacts')
    await app.evaluate('document.querySelector(".bottom-nav button:last-child").click()')
    for (let i = 0; i < 30 && !await app.evaluate('Boolean(document.querySelector(".contact-suggestions li button"))'); i++) await sleep(100)
    assert.equal(await app.evaluate('document.querySelector(".own-number-summary strong").textContent'), own)
    assert.equal(await app.evaluate('Boolean(document.querySelector("#own-number"))'), false)
    await app.evaluate(`document.querySelector('.contact-suggestions li button').click()`)
    assert.equal(await app.evaluate('document.querySelector("#sms-peer").value'), peer)
    assert.equal(await app.evaluate('JSON.parse(PandasticNative.chatStatus()).peer'), peer)
    // Phone-number search works with the leading + and formatted input.
    await app.evaluate(`(()=>{const input=document.querySelector('#contact-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, '${peer.slice(0,8)}');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await sleep(100)
    assert.ok(await app.evaluate('document.querySelectorAll(".contact-suggestions li").length') > 0)
    if (info.mode === 'capable') {
      await app.evaluate(`PandasticNative.setHubContacts(${JSON.stringify(JSON.stringify(original.contacts.filter(contact => contact.number !== peer)))})`)
      await sleep(150)
      await app.evaluate('document.querySelector(".settings-tabs button:nth-child(2)").click()')
      await sleep(100)
      await app.evaluate('document.querySelector(".add-phone-button").click()')
      await sleep(100)
      await app.evaluate('document.querySelector(".contact-suggestions li button").click()')
      assert.equal(await app.evaluate('document.querySelector("#contact-number").value'), peer)
      assert.ok(await app.evaluate('document.querySelector("#contact-name").value'))
      await app.evaluate('document.querySelector("#add-phone-form button[type=submit]").click()')
      await sleep(150)
      assert.ok((await app.evaluate('JSON.parse(PandasticNative.hubStatus()).contacts')).some(contact => contact.number === peer))
    }
    console.log(`PASS ${serial}: automatic own number, real Android contact suggestions/search, destination selection${info.mode === 'capable' ? ', allowed-contact selection' : ''}`)
  } finally {
    await app.evaluate(`PandasticNative.setSmsPeer(${JSON.stringify(originalPeer)}); PandasticNative.setHubContacts(${JSON.stringify(JSON.stringify(original.contacts))}); PandasticNative.setHubEnabled(${original.enabled}); document.querySelector('.bottom-nav button:first-child').click()`)
    app.close()
  }
}
