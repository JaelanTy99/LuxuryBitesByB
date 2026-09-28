/* Luxury Bites by B. — built from mockup D (full site).
   The menu, prices and options come from B.'s Google order form, and the order sheet hands off
   to that form with the customer's treats already filled in. When the Google Form changes,
   update the matching text here: each form value must match the form's wording exactly. */

const FORM = {
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSfC2lgxJJqR9lviBGhhkU86Wy8gDxEkJFHJ7Pdfm-07_UrnuQ/viewform',
  shortUrl: 'https://forms.gle/48eQR3cbqZMoFxMr8',
  partyUrl: '', // Party package form link. Until it's set, party buttons open Instagram DMs.
  instagramDm: 'https://ig.me/m/luxurybitesbyb',
  entries: {
    berrySize: 1180843532, berryChocolate: 611222562, berryAddons: 275457890, berryTheme: 1101649226,
    berryGlitter: 1883889557, berryLettering: 1433846550,
    treatAddons: 665424342, treatTheme: 336724423, treatLettering: 1331454494,
    appleToppings: 1673179481,
    method: 544941931, date: 1099739373, time: 1743114714,
  },
};
const RUSH_FEE = 10;
const FREE_DELIVERY_MIN = 100;
const GLITTER = { price: 5, form: 'Glitter Berry(s) + ($5)' };

// [label in the sentence, value on the Google Form, extra cost]
const CHOC = [['milk', 'Milk'], ['dark', 'Dark'], ['white', 'White']];
const BERRY_CHOC = [...CHOC, ['white & milk', 'White / Milk ($+5)', 5], ['milk & dark', 'Milk/Dark Mix ($+5)', 5], ['white & dark', 'White/Dark ($+5)', 5]];
const APPLE_FLAVORS = ['Blue Raspberry', 'Watermelon', 'Fruit Punch', 'Mango', 'Pineapple', 'Lemon', 'Peach', 'Grape', 'Cherry', 'Cotton Candy'].map(f => [f.toLowerCase(), f]);
const TOPPINGS = ['Jolly Rancher', 'Starburst', 'Nerds', 'Cotton Candy'].map(t => [t, t]);
const COLORS = ['classic white & gold', 'blush pink & gold', 'sunshine yellow', 'emerald green', "robin's egg blue", 'lavender', 'ruby red', 'a custom theme (describe in notes)'];
const TOUCHES = [
  { id: 'topper', label: 'Birthday or holiday topper', price: 1, berry: 'Happy Birthday/Holiday Topper + ($1)', treat: 'Happy Birthday/Holiday Topper + ($1)' },
  { id: 'letters', label: 'Chocolate letters & molds', price: 5, berry: 'Chocolate Letters and molds + ($5)', treat: 'Chocolate Letters and molds + ($5)' },
  { id: 'sanding', label: 'Sanding sugar', price: 3, berry: 'Sanding Sugar + ($3)', treat: 'Sanding Sugar + ($3)' },
  { id: 'hint', label: 'Hint of glitter', price: 2, berry: 'Hint of Glitter + ($2)', treat: 'Hint of Glitter + ($2)' },
  { id: 'knots', label: '6 pretzel knots', price: 5, berry: '(6) Pretzel Knots+ ($5)', treat: 'Pretzel Knots+ ($5)' },
  { id: 'luster', label: 'Luster dust', price: 3, berry: 'Luster Dust + ($3)', treat: 'Luster Dust + ($3)' },
  { id: 'sprinkles', label: 'Sprinkles', price: 2, berry: 'Sprinkles + ($2)', treat: 'Sprinkles + ($2)' },
];
const OCCASIONS = ['Birthday', 'Baby shower', 'Bridal shower', 'Wedding', 'Graduation', 'Anniversary', 'Holiday', 'Gift / thank-you', 'Just because'];
const DISTANCES = [['near', 'Within 10 miles'], ['mid', '10–15 miles'], ['far', '15+ miles'], ['long', 'Raleigh or long distance']];

// sizes: [menu label, price, phrase in the sentence, form value]. Candy apple "sizes" are the three kinds,
// each with its own quantity and flavour questions on the form.
const PRODUCTS = [
  { id: 'straw', cat: 'berries', group: 'berries', rn: 'i.', tone: 'straw', name: 'Chocolate-Covered Strawberries',
    blurb: 'Juicy strawberries hand-dipped in rich chocolate and finished to match your moment.', note: 'Half dozen to custom dozen',
    sizes: [['Half dozen (6)', 25, 'a half dozen', 'Half Dozen (6): $25'], ['9 count', 30, 'a nine-count box', '9 Count: $30'],
      ['Dozen (12)', 40, 'a dozen', 'Dozen (12): $40'], ['Custom dozen', 45, 'a custom dozen, with lettering or molds', 'Custom Dozen (Includes Edible Lettering / Molds): $45']],
    def: 2, choc: BERRY_CHOC, color: true, touches: true, glitter: true },
  { id: 'sampler', cat: 'boxes', group: 'treats', rn: 'ii.', tone: 'box', name: 'The Luxe Sampler', entry: 769782341,
    blurb: 'A little of everything, boxed and ready to gift: 4 strawberries, 2 Rice Krispies, 2 Oreos and 6 pretzel knots.', note: '4 strawberries, 2 Rice Krispies, 2 Oreos, 6 pretzel knots',
    sizes: [['Sampler box', 35, 'a Luxe Sampler']], choc: CHOC, color: true, touches: true },
  { id: 'pops', cat: 'dipped', group: 'treats', rn: 'iii.', tone: 'pops', name: 'Cake Pops', entry: 312594885,
    blurb: 'Moist cake in a smooth chocolate shell, decorated to your theme.', note: 'Vanilla, funfetti, chocolate or red velvet',
    sizes: [['Dozen', 45, 'a dozen']], flavors: [['vanilla', 'Vanilla'], ['funfetti', 'Funfetti'], ['chocolate', 'Chocolate'], ['red velvet', 'Red velvet']], color: true, touches: true },
  { id: 'krisp', cat: 'dipped', group: 'treats', rn: 'iv.', tone: 'crisp', name: 'Rice Krispies', entry: 433442062,
    blurb: 'Crispy rice treats, dipped in chocolate and decorated.', note: 'Dipped and decorated',
    sizes: [['Dozen', 40, 'a dozen']], choc: CHOC, color: true, touches: true },
  { id: 'oreo', cat: 'dipped', group: 'treats', rn: 'v.', tone: 'oreo', name: 'Chocolate-Covered Oreos', entry: 254092139,
    blurb: 'Oreo cookies dipped in chocolate and dressed to match.', note: 'In milk, dark or white chocolate',
    sizes: [['Dozen', 30, 'a dozen']], choc: CHOC, color: true, touches: true },
  { id: 'rods', cat: 'dipped', group: 'treats', rn: 'vi.', tone: 'pretz', name: 'Chocolate-Covered Pretzel Rods', entry: 750810788,
    blurb: 'Salty-sweet pretzel rods, dipped and drizzled.', note: 'Salty and sweet, drizzled',
    sizes: [['Dozen', 25, 'a dozen']], choc: CHOC, color: true, touches: true },
  { id: 'twists', cat: 'dipped', group: 'treats', rn: 'vii.', tone: 'pretz', name: 'Chocolate-Covered Pretzel Twists', entry: 1763409808,
    blurb: 'Pretzel twists with a chocolate coat and a drizzle on top.', note: 'Salty and sweet, twisted',
    sizes: [['Dozen', 25, 'a dozen']], choc: CHOC, color: true, touches: true },
  { id: 'apple', cat: 'apples', group: 'apples', rn: 'viii.', tone: 'apple', name: 'Candy Apples', each: true, max: 6,
    blurb: 'Crisp apples in a glassy candy shell, in ten flavours. Go classic, super sour, or Candy Land, rolled in candy.', note: 'Classic, super sour or Candy Land',
    sizes: [['Classic', 6, 'a classic candy apple', 564027356, 1205309175], ['Super sour', 7, 'a super sour candy apple', 78937848, 695681141],
      ['Candy Land', 8, 'a Candy Land candy apple', 344789356, 765128514]],
    flavors: APPLE_FLAVORS, toppingSize: 2 },
];

const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
const round2 = n => Math.round(n * 100) / 100;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s[0].toUpperCase() + s.slice(1);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
const photo = (name, alt = '') => `<img src="images/${name}.jpg" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`;

const freshBuild = p => ({ size: p.def || 0, choc: 0, flavor: 0, topping: 0, color: 0, touches: [], glitter: 0, qty: 1 });
let sheet = [], seq = 0, cat = 'all';
const build = Object.fromEntries(PRODUCTS.map(p => [p.id, freshBuild(p)]));
let od = { date: '', time: '', method: 'Pickup', distance: 'near', occasion: '', notes: '', lettering: '', agree: false, sent: null };

/* ---------- saving the sheet between visits ---------- */
const STORE = 'luxurybites-sheet-v1';
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && Array.isArray(saved.sheet)) {
    sheet = saved.sheet.filter(l => byId[l.pid]);
    seq = saved.seq || sheet.length;
    Object.assign(od, saved.od || {}, { agree: false, sent: null });
  }
} catch (_) { /* storage unavailable: start fresh */ }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ sheet, seq, od: { ...od, agree: false, sent: null } })); } catch (_) { /* ignore */ }
}

/* ---------- prices ---------- */
function unitOf(p, b) {
  let n = p.sizes[b.size][1];
  if (p.choc) n += p.choc[b.choc][2] || 0;
  if (p.touches) n += TOUCHES.filter(t => b.touches.includes(t.id)).reduce((s, t) => s + t.price, 0);
  if (p.glitter) n += b.glitter * GLITTER.price;
  return n;
}
function daysUntil(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return Math.round((new Date(y, m - 1, day) - today) / 864e5);
}
function niceDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function niceTime(t) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function totals() {
  const sub = sheet.reduce((t, l) => t + l.unit * l.qty, 0);
  const days = daysUntil(od.date);
  const rush = sub && days != null && days >= 1 && days <= 2 ? RUSH_FEE : 0;
  let del = 0, delLabel = '';
  if (sub && od.method === 'Delivery') {
    if (od.distance === 'near') delLabel = sub >= FREE_DELIVERY_MIN ? 'Free' : 'On your invoice';
    else if (od.distance === 'mid') del = 10;
    else if (od.distance === 'far') { del = 15; delLabel = '$15+'; }
    else del = 50;
    delLabel = delLabel || money(del);
  }
  const total = sub + rush + del, dep = round2(total / 2);
  return { sub, rush, del, delLabel, total, dep, bal: round2(total - dep), days };
}

/* ---------- home index ---------- */
function renderHomeList() {
  $('#homeList').innerHTML = PRODUCTS.map(p => {
    const min = Math.min(...p.sizes.map(s => s[1]));
    const small = p.each ? 'Each' : p.sizes.length > 1 ? 'From' : p.sizes[0][0];
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
    <figure><div class="ph ${p.tone}" data-label="Photo">${photo(p.id, p.name)}</div><figcaption class="cap">Fig. ${PRODUCTS.indexOf(p) + 2}: ${p.name}.</figcaption></figure>
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
meas.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-family:'Bodoni Moda',serif;font-style:italic";
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
function desc(l) {
  const p = byId[l.pid];
  return [
    p.sizes[l.size][0],
    l.choc != null ? p.choc[l.choc][0] + ' chocolate' : '',
    l.flavor != null ? p.flavors[l.flavor][0] + (p.each ? ' flavour' : '') : '',
    l.topping != null ? 'rolled in ' + TOPPINGS[l.topping][0] : '',
    l.color != null ? COLORS[l.color] : '',
    ...(l.touches || []).map(id => TOUCHES.find(t => t.id === id).label.toLowerCase()),
    l.glitter ? `${l.glitter} glitter berr${l.glitter > 1 ? 'ies' : 'y'}` : '',
  ].filter(Boolean).map(cap).join(' · ');
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
    <div class="ln tot"><span>Estimated total</span><span>${money(T.total)}</span></div>
    <div class="ln dep"><span>Deposit on your invoice (50%)</span><span>${money(T.dep)}</span></div>
    <div class="ln"><span>Due at ${where}</span><span>${money(T.bal)}</span></div>
    <p class="fine">B. confirms the final total on your invoice. Deposits are non-refundable.</p>
    <label class="agree"><input type="checkbox" id="agree" ${od.agree ? 'checked' : ''}><span>I understand the 50% deposit is non-refundable and the balance is due at ${where}.</span></label>
    <div id="errmsg"></div>
    <button class="send" id="send">Continue to B.'s order form ⚜</button>
    <p class="fine">B.'s order form opens in a new tab with your treats, date and pickup or delivery filled in.</p>`;
}
function methodNote() {
  if (od.method === 'Pickup') return `<p class="note">Pickup is in North Charlotte (28262). <span class="tbd">The exact address and instructions are sent with your invoice.</span></p>`;
  return `<div class="fl" style="margin-top:22px"><label for="f-distance">How far from North Charlotte?</label><select id="f-distance" data-f="distance">${DISTANCES.map(([v, t]) => `<option value="${v}" ${v === od.distance ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <p class="note">Free on orders of $100+ within 5–10 miles. 10–15 miles is $10, 15+ miles is $15 and up, Raleigh or long distance is $50. You'll add the address on B.'s form.</p>`;
}
function renderOrder() {
  const el = $('#orderPage');
  if (od.sent) return renderSent(el);
  el.innerHTML = `
    <div class="phead pad"><p class="kicker"><span class="a">05</span> · Order</p><h1>The Order <em>Sheet</em></h1>
      <p class="deck">Review your selections and tell us when. B.'s order form opens next with everything filled in, and your invoice follows by email.</p></div>
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
        <p class="handoff"><b>Your name, phone and email go on B.'s order form</b>, which opens next with your treats filled in. That way everything reaches B. in one place.</p>
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
    <a class="big" href="${esc(s.url)}" target="_blank" rel="noopener">${s.opened ? 'Open the form again ↗' : "Open B.'s order form ↗"}</a>
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
  el.innerHTML = d != null && d >= 1 && d <= 2 ? `<p class="note warn">⚡ That's within 48 hours, so it's a rush order: +$10, and only if there's room. B. will confirm.</p>` : '';
}

/* ---------- hand-off to B.'s Google Form ---------- */
function lineText(l) { return `${l.qty} × ${byId[l.pid].name} (${desc(l)}): ${money(l.unit * l.qty)}`; }
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
  PRODUCTS.filter(p => p.group === 'treats').forEach(p => {
    const f = lines(p.id)[0];
    if (f) add(p.entry, p.choc ? p.choc[f.choc][1] : p.flavors[f.flavor][1]);
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
function send() {
  $$('.fl .err').forEach(x => x.classList.remove('err'));
  const d = daysUntil(od.date);
  let msg = '', bad = '';
  if (!sheet.length) msg = 'Your sheet is empty. Add a treat first.';
  else if (!od.date) { msg = 'Please pick the date you need your treats.'; bad = 'date'; }
  else if (d < 1) { msg = 'Please pick a date from tomorrow on. For same-day treats, message B. on Instagram.'; bad = 'date'; }
  else if (!od.agree) msg = 'Please tick the deposit box to continue.';
  if (msg) {
    $('#errmsg').innerHTML = `<p class="errmsg" role="alert">${msg}</p>`;
    if (bad) { $('#f-' + bad).classList.add('err'); $('#f-' + bad).focus(); }
    return;
  }
  const T = totals(), url = prefillUrl(T);
  copyText(summaryText(T));
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  od.sent = { url, opened: !!win, date: niceDate(od.date), method: od.method, dep: T.dep, bal: T.bal };
  renderOrder(); window.scrollTo(0, 0);
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
  if (!$(`[data-page="${r}"]`)) r = 'home';
  $$('[data-page]').forEach(s => s.hidden = s.dataset.page !== r);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  document.body.classList.toggle('onorder', r === 'order');
  $('#overlay').hidden = true;
  if (r === 'order') renderOrder();
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
  if (c('#send')) return send();
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
    if (!peek.classList.contains(p.tone)) { peek.className = `peek show ${p.tone}`; peek.innerHTML = photo(p.id); }
    peek.classList.add('show');
  } else if (!e.target.closest('#peek')) peek.classList.remove('show');
});
document.addEventListener('mousemove', e => { if (peek.classList.contains('show')) peek.style.transform = `translate(${e.clientX + 24}px,${e.clientY - 130}px)`; });

/* party buttons and the plain order-form links */
$$('[data-partyform]').forEach(a => { a.href = FORM.partyUrl || FORM.instagramDm; a.target = '_blank'; a.rel = 'noopener'; });
$$('[data-form-link]').forEach(a => { a.href = FORM.shortUrl; });

if (od.date && daysUntil(od.date) < 1) od.date = '';
renderAll();
route();
