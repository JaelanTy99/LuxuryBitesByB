/* Luxury Bites by B. — built from mockup D (full site).
   The menu, prices and options live in menu.js (shared with the checkout function). The order sheet
   sends customers to Square's hosted checkout to pay the 50% deposit; B.'s Google order form, with
   the treats already filled in, is the fallback when online payment isn't available. When the
   Google Form changes, update the matching text here and in menu.js: each form value must match
   the form's wording exactly. */

const FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSfC2lgxJJqR9lviBGhhkU86Wy8gDxEkJFHJ7Pdfm-07_UrnuQ/viewform',
  shortUrl: 'https://forms.gle/48eQR3cbqZMoFxMr8',
  partyUrl: '', // Party package form link. Until it's set, party buttons start an email to B.
  email: 'bmartin@luxurybitesbyb.co',
  entries: {
    berrySize: 1180843532, berryChocolate: 611222562, berryAddons: 275457890, berryTheme: 1101649226,
    berryGlitter: 1883889557, berryLettering: 1433846550,
    treatAddons: 665424342, treatTheme: 336724423, treatLettering: 1331454494,
    appleToppings: 1673179481,
    method: 544941931, date: 1099739373, time: 1743114714,
  },
};
const { GLITTER, TOPPINGS, COLORS, TOUCHES, OCCASIONS, DISTANCES, PRODUCTS,
  byId, money, unitOf, cleanLine, isRush, quote, niceDate, niceTime, desc, lineText } = LuxuryMenu;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
const photo = (name, alt = '') => `<img src="images/${name}.jpg" alt="${esc(alt)}" loading="lazy">`;
// A missing photo is removed so the colour placeholder shows (done here, not inline, so the strict security policy allows it).
document.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);

const freshBuild = p => ({ size: p.def || 0, choc: 0, flavor: 0, topping: 0, color: 0, touches: [], glitter: 0, qty: 1 });
let sheet = [], seq = 0, cat = 'all';
const build = Object.fromEntries(PRODUCTS.map(p => [p.id, freshBuild(p)]));
let od = { date: '', time: '', method: 'Pickup', distance: 'near', occasion: '', notes: '', lettering: '', agree: false, sent: null };

/* ---------- saving the sheet between visits ---------- */
// Anything read back from the browser is untrusted: cleanLine (menu.js) keeps only known menu choices
// and recalculates prices from the menu.
const STORE = 'luxurybites-sheet-v1';
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && Array.isArray(saved.sheet)) {
    sheet = saved.sheet.map(cleanLine).filter(Boolean);
    seq = Math.max(sheet.length, ...sheet.map(l => l.key), Number.isInteger(saved.seq) ? saved.seq : 0);
    const so = saved.od || {}, str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    Object.assign(od, {
      date: /^\d{4}-\d{2}-\d{2}$/.test(so.date) ? so.date : '', time: /^\d{2}:\d{2}$/.test(so.time) ? so.time : '',
      method: so.method === 'Delivery' ? 'Delivery' : 'Pickup', distance: DISTANCES.some(d => d[0] === so.distance) ? so.distance : 'near',
      occasion: OCCASIONS.includes(so.occasion) ? so.occasion : '', notes: str(so.notes, 1000), lettering: str(so.lettering, 120),
      agree: false, sent: null });
  }
} catch (_) { /* storage unavailable: start fresh */ }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ sheet, seq, od: { ...od, agree: false, sent: null } })); } catch (_) { /* ignore */ }
}

/* ---------- prices (the rules live in menu.js) ---------- */
const daysUntil = d => LuxuryMenu.daysUntil(d, today);
const totals = () => quote(sheet, od, today);

/* ---------- home index ---------- */
function renderHomeList() {
  $('#homeList').innerHTML = PRODUCTS.map(p => {
    const min = Math.min(...p.sizes.map(s => s[1]));
    const varied = new Set(p.sizes.map(s => s[1])).size > 1;
    const small = p.each ? 'Each' : varied ? 'From' : p.sizes.length > 1 ? 'Dozen' : p.sizes[0][0];
    return `<div class="row" data-goto="${p.id}" role="link" tabindex="0"><span class="i">${p.rn}</span><h3>${p.name}</h3><p>${p.note}</p><span class="p">${money(min)}<small>${small}</small></span></div>`;
  }).join('');
}

/* ---------- the treats ---------- */
function opts(list, sel, fmt = v => v) { return list.map((v, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(fmt(v, i))}</option>`).join(''); }
function inSheet(pid) { return sheet.filter(l => l.pid === pid).reduce((t, l) => t + l.qty, 0); }
function sentence(p, b) {
  const sel = (key, list, label, fmt) => `<select data-p="${p.id}" data-s="${key}" aria-label="${label}">${opts(list, b[key], fmt)}</select>`;
  let s = `Make it ${p.sizes.length > 1 ? sel('size', p.sizes, 'Size', v => v[2]) : `<span class="fixed">${p.sizes[0][2]}</span>`}`;
  if (p.choc) s += `, dipped in ${sel('choc', p.choc, 'Chocolate', c => c[2] ? `${c[0]} (+$${c[2]})` : c[0])} chocolate`;
  if (p.flavors) s += `, in ${sel('flavor', p.flavors, 'Flavour', f => f[0])}${p.each ? ' flavour' : ''}`;
  if (p.toppingSize != null && b.size === p.toppingSize) s += `, rolled in ${sel('topping', TOPPINGS, 'Candy topping', t => t[0])}`;
  if (p.color) s += `, styled in ${sel('color', COLORS, 'Colour theme')}`;
  if (p.glitter) {
    const counts = Array.from({ length: 13 }, (_, i) => i);
    s += `, with ${sel('glitter', counts, 'Glitter berries', n => n === 0 ? 'no glitter berries' : `${n} glitter berr${n > 1 ? 'ies' : 'y'} (+$${n * GLITTER.price})`)}`;
  }
  return s + '.';
}
function touchesHTML(p, b) {
  if (!p.touches) return '';
  return `<div class="touches"><span class="t" id="tt-${p.id}">Finishing touches <small style="text-transform:none;letter-spacing:0;font-weight:500">(optional, per ${p.sizes[0][0] === 'Dozen' ? 'dozen' : 'box'})</small></span>
    <div class="chips" role="group" aria-labelledby="tt-${p.id}">${TOUCHES.map(t => `<button class="touch" data-touch="${t.id}" data-p="${p.id}" aria-pressed="${b.touches.includes(t.id)}">${t.label}<small>+$${t.price}</small></button>`).join('')}</div></div>`;
}
function treatHTML(p) {
  const b = build[p.id], k = inSheet(p.id);
  return `<article class="treat pad" id="t-${p.id}">
    <figure><div class="ph ${p.tone}" data-label="Photo">${photo(p.photo || p.id, p.name)}</div><figcaption class="cap">Fig. ${PRODUCTS.indexOf(p) + 2}: ${p.name}.</figcaption></figure>
    <div>
      <span class="i">${p.rn}</span>${k ? `<span class="incart">${k} on your sheet</span>` : ''}
      <h2>${p.name}</h2><p class="blurb">${p.blurb}</p>
      <div class="prices">${p.sizes.map(s => `<div><span>${s[0]}</span><span>$${s[1]}${p.each ? '<span class="ea">each</span>' : ''}</span></div>`).join('')}</div>
      <p class="sentence">${sentence(p, b)}</p>
      ${touchesHTML(p, b)}
      <div class="addrow">
        <div class="qty"><button data-bq="-1" data-p="${p.id}" aria-label="One less">−</button><span>${b.qty}</span><button data-bq="1" data-p="${p.id}" aria-label="One more">+</button></div>
        <button class="addbtn" data-add="${p.id}">Add to order sheet →</button>
        <span class="lineprice" id="lp-${p.id}">${money(unitOf(p, b) * b.qty)}</span>
      </div>
    </div>
  </article>`;
}
function renderTreats() {
  $('#treatList').innerHTML = PRODUCTS.filter(p => cat === 'all' || p.cat === cat).map(treatHTML).join('');
  fitSelects();
}
function rerenderTreat(pid, focusKey) {
  const el = $('#t-' + pid);
  if (!el) return;
  el.outerHTML = treatHTML(byId[pid]);
  fitSelects();
  if (focusKey) document.querySelector(`#t-${pid} [data-s="${focusKey}"]`)?.focus();
}
const meas = document.createElement('span');
meas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;visibility:hidden;white-space:pre;font-family:'Bodoni Moda',serif;font-style:italic";
document.body.appendChild(meas);
function fitSelects() {
  $$('.sentence select').forEach(sel => {
    meas.style.fontSize = getComputedStyle(sel).fontSize;
    meas.textContent = sel.options[sel.selectedIndex].text;
    sel.style.width = Math.min(meas.offsetWidth + 24, sel.parentElement.clientWidth) + 'px';
  });
}
addEventListener('resize', fitSelects);
document.fonts?.ready.then(fitSelects);

const LINE_KEYS = ['pid', 'size', 'choc', 'flavor', 'topping', 'color', 'glitter', 'touchKey'];
function addToSheet(pid) {
  const p = byId[pid], b = build[pid];
  const touches = p.touches ? [...b.touches].sort() : [];
  const l = {
    key: ++seq, pid, size: b.size,
    choc: p.choc ? b.choc : null,
    flavor: p.flavors ? b.flavor : null,
    topping: p.toppingSize != null && b.size === p.toppingSize ? b.topping : null,
    color: p.color ? b.color : null,
    glitter: p.glitter ? b.glitter : 0,
    touches, touchKey: touches.join(','), qty: b.qty, unit: unitOf(p, b),
  };
  const same = sheet.find(x => LINE_KEYS.every(k => x[k] === l[k]));
  if (p.max) {
    const already = sheet.filter(x => x.pid === pid && x.size === l.size).reduce((t, x) => t + x.qty, 0);
    if (already + l.qty > p.max) return toast(`Up to ${p.max} of each kind per order. <i>Mention more in your notes.</i>`);
  }
  same ? same.qty += l.qty : sheet.push(l);
  b.qty = 1; od.sent = null;
  save(); renderAll();
  toast(`Added <i>${l.qty} × ${p.name}</i> to your order sheet.`);
}
/* ---------- order sheet ---------- */
function fl(id, label, type = 'text', extra = '', full = false) {
  return `<div class="fl ${full ? 'full' : ''}"><label for="f-${id}">${label}</label><input type="${type}" id="f-${id}" data-f="${id}" value="${esc(od[id])}" ${extra}></div>`;
}
const ROMAN = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.', 'viii.', 'ix.', 'x.', 'xi.', 'xii.'];
function selHTML() {
  if (!sheet.length) return `<p class="empty">Nothing on your sheet yet. <a href="#/treats">Browse the treats →</a></p>`;
  return sheet.map((l, i) => `<div class="it"><span class="i">${ROMAN[i] || (i + 1) + '.'}</span>
    <div><h3>${byId[l.pid].name}</h3><p class="d">${esc(desc(l))}</p><button class="rm" data-rm="${l.key}">Remove</button></div>
    <div class="qty"><button data-lq="-1" data-k="${l.key}" aria-label="One less">−</button><span>${l.qty}</span><button data-lq="1" data-k="${l.key}" aria-label="One more">+</button></div>
    <span class="pr">${money(l.unit * l.qty)}</span></div>`).join('');
}
function ledgerHTML() {
  const T = totals(), where = od.method === 'Pickup' ? 'pickup' : 'delivery';
  return `<span class="kicker"><span class="a">⚜</span> The ledger</span>
    <div class="ln"><span>Subtotal</span><span>${money(T.sub)}</span></div>
    ${T.rush ? `<div class="ln"><span>Rush fee (within 48 hrs)</span><span>$10</span></div>` : ''}
    ${T.delLabel ? `<div class="ln"><span>Delivery</span><span>${T.delLabel}</span></div>` : ''}
    <div class="ln tot"><span>Order total</span><span>${money(T.total)}</span></div>
    <div class="ln dep"><span>${isRush(T.days) ? 'Deposit (50%)' : 'Deposit due today (50%)'}</span><span>${money(T.dep)}</span></div>
    <div class="ln"><span>Due at ${where}</span><span>${money(T.bal)}</span></div>
    ${T.delExtra === 'quoted' ? `<p class="fine">B. quotes the delivery fee, and it's added to what you pay at delivery.</p>` : ''}
    ${T.delExtra === 'more' ? `<p class="fine">Delivery is $15 and up. Anything over $15 is added to what you pay at delivery.</p>` : ''}
    ${isRush(T.days) ? `
    <div class="rushpay"><p><b>Rush orders can't be paid online.</b> B. needs to check there's room first. Message B. on Instagram with your order and date.</p>
      <a class="send" id="rushdm" href="https://ig.me/m/luxurybitesbyb" target="_blank" rel="noopener noreferrer">Message B. on Instagram ↗</a>
      <p class="fine">Your order summary is copied when you tap, so you can paste it into the message.</p></div>
    <div id="errmsg"></div>` : `
    <label class="agree"><input type="checkbox" id="agree" ${od.agree ? 'checked' : ''}><span>I understand the 50% deposit is non-refundable if I cancel, refunded in full if B. can't take my date, and the balance is due at ${where}.</span></label>
    <div id="errmsg"></div>
    <button class="send" id="pay" ${paying ? 'disabled' : ''}>${paying ? 'Opening Square…' : `Pay 50% deposit · ${money(T.dep)}`}</button>
    <p class="fine paynote">You'll pay on Square's secure checkout. Your card details never touch this site. B. then confirms your date.</p>`}`;
}
function methodNote() {
  if (od.method === 'Pickup') return `<p class="note">Pickup is in North Charlotte (28262). <span class="tbd">The exact address and instructions come when B. confirms your order.</span></p>`;
  return `<div class="fl" style="margin-top:22px"><label for="f-distance">How far from North Charlotte?</label><select id="f-distance" data-f="distance">${DISTANCES.map(([v, t]) => `<option value="${v}" ${v === od.distance ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <p class="note">Free on orders of $100+ within 5–10 miles. 10–15 miles is $10, 15+ miles is $15 and up, Raleigh or long distance is $50. You'll add the address on Square's checkout page.</p>`;
}
function renderOrder() {
  const el = $('#orderPage');
  if (od.sent) return renderSent(el);
  el.innerHTML = `
    <div class="phead pad"><p class="kicker"><span class="a">05</span> · Order</p><h1>The Order <em>Sheet</em></h1>
      <p class="deck">Review your selections and tell us when, then pay the 50% deposit on Square's secure checkout. B. confirms your date after that.</p></div>
    <div class="sheet pad">
      <div>
        <h2><i>i.</i>Your selections</h2>
        <div class="sel" id="sel">${selHTML()}</div>
        <h2><i>ii.</i>The details</h2>
        <div class="fields">
          ${fl('date', 'Needed by', 'date', `min="${iso(tomorrow)}"`)}
          ${fl('time', 'Time <small>(pickup or delivery)</small>', 'time')}
          <div class="full" id="rushnote"></div>
          <div class="fl full"><span class="t">Getting it</span><div class="toggle">${['Pickup', 'Delivery'].map(v => `<button data-method="${v}" class="${od.method === v ? 'on' : ''}" aria-pressed="${od.method === v}">${v}</button>`).join('')}</div>
            ${methodNote()}</div>
          <div class="fl full"><label for="f-occasion">Occasion <small>(optional)</small></label><select id="f-occasion" data-f="occasion"><option value="">Choose one</option>${OCCASIONS.map(o => `<option ${o === od.occasion ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="fl full"><label for="f-notes">Colours, theme &amp; notes for B. <small>(optional)</small></label><textarea id="f-notes" data-f="notes" placeholder="Pink and purple Hello Kitty theme, or 3 blue-and-white marble, 3 plain white…">${esc(od.notes)}</textarea></div>
          ${fl('lettering', 'Names or lettering <small>(optional)</small>', 'text', 'placeholder="Happy 30th, Britany"', true)}
        </div>
        <p class="handoff"><b>Your name, phone, email${od.method === 'Delivery' ? ', delivery address' : ''} and card go on Square's checkout page</b>, never on this site. Square passes them to B. with your order.</p>
      </div>
      <aside class="ledger" id="ledger">${ledgerHTML()}</aside>
    </div>`;
  updRush();
}
function renderSent(el) {
  const s = od.sent, where = s.method === 'Pickup' ? 'pickup' : 'delivery';
  el.innerHTML = `<div class="thanks pad">
    <p class="kicker"><span class="a">⚜</span> One more step</p>
    <h1>Almost there, <em>Luxe Babe.</em></h1>
    <p class="deck">${s.opened ? "B.'s order form opened in a new tab with your treats filled in. Finish it there to send your request." : "Open B.'s order form below. Your treats are already filled in. Finish it there to send your request."}</p>
    <a class="big" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${s.opened ? 'Open the form again ↗' : "Open B.'s order form ↗"}</a>
    <div class="how">
      <div><b>1</b><h3>Finish the form.</h3><p>Add your name, phone and email${s.method === 'Delivery' ? ' and delivery address' : ''}, then submit.</p></div>
      <div><b>2</b><h3>Invoice arrives.</h3><p>By email, with your order details and payment instructions.</p></div>
      <div><b>3</b><h3>Pay ${money(s.dep)}.</h3><p>The 50% non-refundable deposit locks in ${esc(s.date)}.</p></div>
      <div><b>4</b><h3>Enjoy.</h3><p>Pay the remaining ${money(s.bal)} at ${where}.</p></div>
    </div>
    <div class="ctas" style="margin-top:48px"><button class="cta" data-unsend>← Back to my order sheet</button><button class="cta" data-clear>Start a new sheet</button></div>
    <p class="fine">Your order summary was also copied, in case you'd like to paste it into the form's notes.</p></div>`;
}
function refreshOrderBits() {
  if ($('#sel')) $('#sel').innerHTML = selHTML();
  if ($('#ledger')) { const e = $('#errmsg')?.innerHTML || ''; $('#ledger').innerHTML = ledgerHTML(); $('#errmsg').innerHTML = e; }
}
function updRush() {
  const el = $('#rushnote'); if (!el) return;
  const d = daysUntil(od.date);
  el.innerHTML = isRush(d) ? `<p class="note warn">⚡ That's within 48 hours, so it's a rush order: +$10, and only if there's room. Rush orders can't be paid online, so message B. on Instagram first.</p>` : '';
}

/* ---------- hand-off to B.'s Google Form ---------- */
function estimateText(T) {
  const extras = [T.rush && `rush fee ${money(T.rush)}`, T.delLabel && `delivery ${T.delLabel}`].filter(Boolean);
  return `Estimated total ${money(T.total)}${extras.length ? ` (includes ${extras.join(', ')})` : ''} · deposit ${money(T.dep)}`;
}
function summaryText(T) {
  return ['Luxury Bites by B. — order sheet', ...sheet.map(lineText),
    od.occasion && `Occasion: ${od.occasion}`, od.notes.trim() && `Colours, theme & notes: ${od.notes.trim()}`,
    od.lettering.trim() && `Lettering: ${od.lettering.trim()}`,
    `Needed: ${niceDate(od.date)}${od.time ? ' at ' + niceTime(od.time) : ''} · ${od.method}${od.method === 'Delivery' ? ` (${DISTANCES.find(d => d[0] === od.distance)[1].toLowerCase()})` : ''}`,
    estimateText(T)].filter(Boolean).join('\n');
}
function prefillUrl(T) {
  const E = FORM.entries, q = new URLSearchParams({ usp: 'pp_url' });
  const add = (entry, v) => { if (v != null && v !== '') q.append(`entry.${entry}`, v); };
  const lines = pid => sheet.filter(l => l.pid === pid);
  const uniq = a => [...new Set(a)];

  // The form takes one size and chocolate per treat, so it gets the first line's choices;
  // every line (with quantities) is spelled out in the notes box below.
  const berries = lines('straw');
  if (berries.length) {
    const p = byId.straw, f = berries[0];
    add(E.berrySize, p.sizes[f.size][3]);
    add(E.berryChocolate, p.choc[f.choc][1]);
    uniq(berries.flatMap(l => l.touches)).forEach(id => add(E.berryAddons, TOUCHES.find(t => t.id === id).berry));
    const glitter = berries.reduce((t, l) => t + l.glitter * l.qty, 0);
    if (glitter) {
      add(E.berryAddons, GLITTER.form);
      add(E.berryGlitter, `${glitter} glitter berr${glitter > 1 ? 'ies' : 'y'}, colours in my notes`);
    }
  }
  const treats = sheet.filter(l => byId[l.pid].group === 'treats');
  const choice = (p, f) => p.choc ? p.choc[f.choc][1] : p.flavors[f.flavor][1];
  PRODUCTS.filter(p => p.group === 'treats').forEach(p => {
    if (p.entry) { const f = lines(p.id)[0]; if (f) add(p.entry, choice(p, f)); return; }
    p.sizes.forEach((sz, i) => { const f = lines(p.id).find(l => l.size === i); if (f) add(sz[3], choice(p, f)); });
  });
  uniq(treats.flatMap(l => l.touches)).forEach(id => add(E.treatAddons, TOUCHES.find(t => t.id === id).treat));

  const apple = byId.apple;
  apple.sizes.forEach((s, i) => {
    const ls = lines('apple').filter(l => l.size === i);
    if (!ls.length) return;
    add(s[3], String(Math.min(apple.max, ls.reduce((t, l) => t + l.qty, 0))));
    uniq(ls.map(l => apple.flavors[l.flavor][1])).forEach(f => add(s[4], f));
    if (i === apple.toppingSize) add(E.appleToppings, TOPPINGS[ls[0].topping][1]);
  });

  const notes = [od.notes.trim(), od.occasion && `Occasion: ${od.occasion}`, 'From the website order sheet:', ...sheet.map(lineText), estimateText(T)].filter(Boolean).join('\n');
  const onlyApples = !berries.length && !treats.length;
  if (berries.length) { add(E.berryTheme, notes); add(E.berryLettering, od.lettering.trim()); }
  if (treats.length || onlyApples) { add(E.treatTheme, notes); add(E.treatLettering, od.lettering.trim()); }

  add(E.method, od.method);
  add(E.date, od.date);
  add(E.time, od.time);
  return `${FORM.url}?${q}`;
}
function copyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  ta.remove();
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
}
function showError(msg, fallback) {
  $('#errmsg').innerHTML = `<p class="errmsg" role="alert">${esc(msg)}${fallback ? ` <button class="linkbtn" data-formfallback>Send it to B.'s order form instead →</button>` : ''}</p>`;
}
function checkOrder() {
  $$('.fl .err').forEach(x => x.classList.remove('err'));
  const d = daysUntil(od.date);
  let msg = '', bad = '';
  if (!sheet.length) msg = 'Your sheet is empty. Add a treat first.';
  else if (!od.date) { msg = 'Please pick the date you need your treats.'; bad = 'date'; }
  else if (d < 1) { msg = 'Please pick a date from tomorrow on. For same-day treats, message B. on Instagram.'; bad = 'date'; }
  else if (!od.agree) msg = 'Please tick the deposit box to continue.';
  if (msg) {
    showError(msg);
    if (bad) { $('#f-' + bad).classList.add('err'); $('#f-' + bad).focus(); }
  }
  return !msg;
}
// Fallback when online payment isn't available: B.'s Google order form, with the treats filled in.
function send() {
  if (!checkOrder()) return;
  const T = totals(), url = prefillUrl(T);
  copyText(summaryText(T));
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  od.sent = { url, opened: !!win, date: niceDate(od.date), method: od.method, dep: T.dep, bal: T.bal };
  renderOrder(); window.scrollTo(0, 0);
}

/* ---------- paying the deposit on Square ---------- */
// The browser sends only the menu choices and the date. The checkout function works the price out
// again from menu.js and replies with a link to Square's hosted checkout, where the customer enters
// their name, contact details and card. Nothing personal is sent to or kept by this site.
const PENDING = 'luxurybites-pending-v1', THANKS = 'luxurybites-thanks-v1';
const ORDER_NO = /^LB-[A-Z2-9]{6}$/;
const SQUARE_PAGE = /^(sandbox\.)?(square\.link|checkout\.square\.site)$/;
let paying = false, paid = null;
function squareUrl(u) {
  try {
    const url = new URL(u);
    // tools/dev_server.py stands in for Square on this computer while testing
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && url.origin === location.origin;
    return (url.protocol === 'https:' && SQUARE_PAGE.test(url.hostname)) || local ? url.href : null;
  } catch (_) { return null; }
}
async function pay() {
  if (paying || !checkOrder()) return;
  const T = totals();
  paying = true; refreshOrderBits();
  let res = null, data = {};
  try {
    res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: sheet.map(({ pid, size, choc, flavor, topping, color, glitter, touches, qty }) => ({ pid, size, choc, flavor, topping, color, glitter, touches, qty })),
        details: { date: od.date, time: od.time, method: od.method, distance: od.distance, occasion: od.occasion, notes: od.notes, lettering: od.lettering },
        agree: od.agree, expected: T.dep,
      }),
    });
    data = await res.json();
  } catch (_) { /* shown below */ }
  const url = squareUrl(data.url);
  if (res && res.ok && url && ORDER_NO.test(data.order)) {
    try { localStorage.setItem(PENDING, JSON.stringify({ order: data.order, bal: data.balance, method: od.method, extra: T.delExtra })); } catch (_) { /* ignore */ }
    return location.assign(url);
  }
  paying = false; refreshOrderBits();
  const down = !res || res.status >= 500;
  showError(down ? (data.error || 'We couldn’t reach Square just now. Please try again in a minute.') : (data.error || 'Something went wrong. Please try again.'), down);
}
// Coming back from Square with the browser's Back button: let the customer try again.
addEventListener('pageshow', e => { if (e.persisted && paying) { paying = false; refreshOrderBits(); } });

// Square sends customers back to /?order=LB-XXXXXX once they've paid. If it's the order this browser
// just sent, the sheet is cleared. The order number is kept for this tab so a refresh still shows it.
function readPaid() {
  const no = new URLSearchParams(location.search).get('order');
  if (ORDER_NO.test(no || '')) {
    let pend = null;
    try { pend = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch (_) { /* ignore */ }
    const mine = pend && pend.order === no;
    paid = { order: no, bal: mine && typeof pend.bal === 'number' ? pend.bal : null, method: mine ? pend.method : '', extra: mine ? pend.extra : '' };
    if (mine) {
      sheet = []; od = { ...od, occasion: '', notes: '', lettering: '', date: '', time: '' }; save();
      try { localStorage.removeItem(PENDING); } catch (_) { /* ignore */ }
    }
    try { sessionStorage.setItem(THANKS, JSON.stringify(paid)); } catch (_) { /* ignore */ }
    history.replaceState(null, '', location.pathname + '#/thanks');
    return;
  }
  try {
    const s = JSON.parse(sessionStorage.getItem(THANKS) || 'null');
    if (s && ORDER_NO.test(s.order)) paid = { order: s.order, bal: typeof s.bal === 'number' ? s.bal : null, method: s.method, extra: s.extra };
  } catch (_) { /* ignore */ }
}
function renderThanks() {
  const where = paid.method === 'Delivery' ? 'delivery' : paid.method === 'Pickup' ? 'pickup' : 'pickup or delivery';
  $('#thanksPage').innerHTML = `<div class="thanks pad">
    <p class="kicker"><span class="a">⚜</span> Deposit paid</p>
    <h1>Thank you, <em>Luxe Babe.</em></h1>
    <p class="orderno">Order <b>${esc(paid.order)}</b></p>
    <p class="deck">Your 50% deposit is in. Keep your order number handy in case you need to reach B.</p>
    <div class="how">
      <div><b>1</b><h3>B. confirms.</h3><p>B. checks your date and confirms your order. If B. can't take it, your deposit is refunded in full.</p></div>
      <div><b>2</b><h3>Receipt by email.</h3><p>Square emails you a receipt for your deposit.</p></div>
      <div><b>3</b><h3>Pay the balance.</h3><p>Pay the remaining ${paid.bal != null ? money(paid.bal) + ' ' : ''}at ${where}${paid.extra === 'quoted' ? ', plus the quoted delivery fee' : paid.extra === 'more' ? ', plus any delivery fee over $15' : ''}.</p></div>
      <div><b>4</b><h3>Enjoy.</h3><p>So rich. So smooth. Elegantly sweet.</p></div>
    </div>
    <div class="ctas" style="margin-top:48px"><a class="cta" href="#/treats">Back to the treats →</a><a class="cta" href="https://ig.me/m/luxurybitesbyb" target="_blank" rel="noopener noreferrer">Questions? Message B. ↗</a></div>
  </div>`;
}

/* ---------- shared ---------- */
function renderAll() {
  renderHomeList(); renderTreats(); refreshOrderBits();
  const count = sheet.reduce((t, l) => t + l.qty, 0), T = totals();
  $('#count').textContent = count;
  document.body.classList.toggle('hassheet', count > 0);
  $('#bartotal').textContent = money(T.total);
  $('#baritems').textContent = `${count} item${count === 1 ? '' : 's'} on your order sheet`;
}
function route() {
  let r = location.hash.replace(/^#\/?/, '') || 'home';
  if (!$(`[data-page="${r}"]`) || (r === 'thanks' && !paid)) r = 'home';
  $$('[data-page]').forEach(s => s.hidden = s.dataset.page !== r);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  document.body.classList.toggle('onorder', r === 'order');
  $('#overlay').hidden = true;
  if (r === 'order') renderOrder();
  if (r === 'thanks') renderThanks();
  if (r === 'treats') fitSelects();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
let tt;
function toast(html) { $('#tmsg').innerHTML = html; $('#toast').classList.add('show'); clearTimeout(tt); tt = setTimeout(() => $('#toast').classList.remove('show'), 3400); }
function goTo(id) {
  cat = 'all'; $$('#filters button').forEach(x => x.classList.toggle('on', x.dataset.c === 'all')); renderTreats();
  location.hash = '#/treats';
  setTimeout(() => $('#t-' + id)?.scrollIntoView({ behavior: 'smooth' }), 60);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const c = s => e.target.closest(s);
  if (c('#overlay nav a')) $('#overlay').hidden = true;
  if (c('[data-overlay]')) return $('#overlay').hidden = !$('#overlay').hidden;
  if (c('[data-goto]')) return goTo(c('[data-goto]').dataset.goto);
  if (c('#filters button')) { cat = c('#filters button').dataset.c; $$('#filters button').forEach(x => x.classList.toggle('on', x.dataset.c === cat)); return renderTreats(); }
  if (c('[data-bq]')) {
    const btn = c('[data-bq]'), p = byId[btn.dataset.p], s = build[p.id];
    s.qty = Math.max(1, Math.min(p.max || 20, s.qty + +btn.dataset.bq)); btn.parentElement.querySelector('span').textContent = s.qty;
    return $('#lp-' + p.id).textContent = money(unitOf(p, s) * s.qty);
  }
  if (c('[data-touch]')) {
    const btn = c('[data-touch]'), p = byId[btn.dataset.p], s = build[p.id], id = btn.dataset.touch;
    s.touches = s.touches.includes(id) ? s.touches.filter(x => x !== id) : [...s.touches, id];
    btn.setAttribute('aria-pressed', s.touches.includes(id));
    return $('#lp-' + p.id).textContent = money(unitOf(p, s) * s.qty);
  }
  if (c('[data-add]')) return addToSheet(c('[data-add]').dataset.add);
  if (c('[data-lq]')) {
    const btn = c('[data-lq]'), l = sheet.find(x => x.key == btn.dataset.k), p = byId[l.pid];
    const same = sheet.filter(x => x.pid === l.pid && x.size === l.size).reduce((t, x) => t + x.qty, 0);
    if (+btn.dataset.lq > 0 && p.max && same >= p.max) return toast(`Up to ${p.max} of each kind per order. <i>Mention more in your notes.</i>`);
    l.qty += +btn.dataset.lq; if (l.qty < 1) sheet = sheet.filter(x => x !== l);
    save(); return renderAll();
  }
  if (c('[data-rm]')) { sheet = sheet.filter(x => x.key != c('[data-rm]').dataset.rm); save(); return renderAll(); }
  if (c('[data-method]')) { od.method = c('[data-method]').dataset.method; save(); return renderOrder(); }
  if (c('#pay')) return pay();
  if (c('[data-formfallback]')) return send();
  if (c('#rushdm')) return copyText(summaryText(totals()));
  if (c('[data-unsend]')) { od.sent = null; return renderOrder(); }
  if (c('[data-clear]')) { sheet = []; od = { ...od, occasion: '', notes: '', lettering: '', date: '', time: '', sent: null }; save(); renderAll(); location.hash = '#/treats'; return; }
  if (c('[data-jump]')) return $('#' + c('[data-jump]').dataset.jump).scrollIntoView({ behavior: 'smooth' });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#overlay').hidden = true;
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-goto]')) { e.preventDefault(); goTo(e.target.dataset.goto); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.s) {
    const p = byId[t.dataset.p], b = build[p.id];
    b[t.dataset.s] = +t.value;
    if (p.toppingSize != null && t.dataset.s === 'size') return rerenderTreat(p.id, 'size');
    fitSelects();
    $('#lp-' + p.id).textContent = money(unitOf(p, b) * b.qty);
  }
  if (t.dataset.f) {
    od[t.dataset.f] = t.value; save();
    if (t.dataset.f === 'distance') refreshOrderBits();
  }
  if (t.id === 'agree') od.agree = t.checked;
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f) {
    od[t.dataset.f] = t.value; t.classList.remove('err'); save();
    if (t.dataset.f === 'date') { updRush(); refreshOrderBits(); }
  }
});

/* hover peek on the home index */
const peek = $('#peek');
document.addEventListener('mouseover', e => {
  const r = e.target.closest('.row');
  if (r) {
    const p = byId[r.dataset.goto];
    if (!peek.classList.contains(p.tone)) { peek.className = `peek show ${p.tone}`; peek.innerHTML = photo(p.photo || p.id); }
    peek.classList.add('show');
  } else if (!e.target.closest('#peek')) peek.classList.remove('show');
});
document.addEventListener('mousemove', e => { if (peek.classList.contains('show')) peek.style.transform = `translate(${e.clientX + 24}px,${e.clientY - 130}px)`; });

/* party buttons and the plain order-form links */
$$('[data-partyform]').forEach(a => {
  if (FORM.partyUrl) { a.href = FORM.partyUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; return; }
  const subject = `Party bundle request: ${a.dataset.bundle || 'Party bundle'}`;
  const body = 'Hi B.,\n\nI\'d like to request a party bundle.\n\nBundle: ' + (a.dataset.bundle || '') + '\nEvent date:\nPickup or delivery:\nMy two colours / theme:\nOccasion:\nAdd-ons (e.g. candy apples, cake pop swap):\n\nThank you!';
  a.href = `mailto:${FORM.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
$$('[data-form-link]').forEach(a => { a.href = FORM.shortUrl; });

readPaid();
if (od.date && daysUntil(od.date) < 1) od.date = '';
renderAll();
route();
