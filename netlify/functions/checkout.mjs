/* Luxury Bites by B. — creates a Square payment link for the 50% deposit.
   The browser sends only the menu choices and the date. The total is recalculated here from the
   shared menu (public/menu.js), never taken from the browser, then Square's Checkout API makes a
   hosted payment page. Name, email, phone, address and card are entered only on Square's page.

   Environment variables (Netlify → Project configuration → Environment variables, never in the repo):
     SQUARE_ACCESS_TOKEN  Square access token (sandbox or production, matching SQUARE_ENV)
     SQUARE_LOCATION_ID   Square location the payment goes to
     SQUARE_ENV           "sandbox" or "production"; anything else switches online payment off */

import '../../public/menu.js';

const { cleanLine, quote, isRush, lineText, money, niceDate, niceTime, byId, DISTANCES, OCCASIONS } = globalThis.LuxuryMenu;

const SQUARE_VERSION = '2026-09-16';
const SQUARE_API = { sandbox: 'https://connect.squareupsandbox.com', production: 'https://connect.squareup.com' };
// Payment pages Square may send customers to (sandbox and production).
const SQUARE_PAGE = /^(sandbox\.)?(square\.link|checkout\.square\.site)$/;
const SITES = [/^https:\/\/(www\.)?luxurybitesbyb\.co$/, /^https:\/\/([a-z0-9-]+--)?luxurybitesbyb\.netlify\.app$/];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SUPPORT_EMAIL = 'bmartin@luxurybitesbyb.co';
const MAX_BODY = 20000, MAX_LINES = 30, MAX_DAYS_AHEAD = 366;

export const config = {
  path: '/api/checkout',
  // Stops anyone filling B.'s Square account with unpaid payment links.
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const fail = (status, code, error) => reply(status, { code, error });
const env = name => globalThis.Netlify?.env.get(name) || '';
// Free text from customers: drop control characters (newlines and tabs are kept), trim, cap the length.
const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';

// Today's date in Charlotte, as a Date at local midnight (the shape menu.js's date maths expects).
function charlotteToday(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function orderNumber() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'LB-' + [...bytes].map(b => abc[b % abc.length]).join('');
}

// Reads and checks the request. Returns { order } or { error: Response }.
function readOrder(body) {
  const bad = msg => ({ error: fail(400, 'invalid', msg) });
  if (!body || typeof body !== 'object') return bad('We couldn’t read your order. Please refresh and try again.');
  const { lines: raw, details: d = {}, agree, expected } = body;
  if (!Array.isArray(raw) || !raw.length) return bad('Your order sheet is empty. Add a treat first.');
  if (raw.length > MAX_LINES) return bad('That’s a lot of treats! Please message B. on Instagram for big orders.');
  const lines = raw.map(cleanLine);
  if (lines.includes(null)) return bad('Your order sheet has an item we couldn’t read. Please refresh and try again.');
  for (const l of lines) {
    const p = byId[l.pid];
    if (p.max && lines.filter(x => x.pid === l.pid && x.size === l.size).reduce((t, x) => t + x.qty, 0) > p.max)
      return bad(`Up to ${p.max} of each kind of ${p.name.toLowerCase()} per order. Mention more in your notes.`);
  }

  const date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '';
  const time = typeof d.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time) ? d.time : '';
  const method = d.method === 'Delivery' ? 'Delivery' : d.method === 'Pickup' ? 'Pickup' : '';
  const distance = method === 'Delivery' ? DISTANCES.find(x => x[0] === d.distance) : null;
  if (!date) return bad('Please pick the date you need your treats.');
  if (!method || (method === 'Delivery' && !distance)) return bad('Please choose pickup or delivery.');
  const order = {
    lines, date, time, method, distance: distance ? distance[0] : 'near', distanceLabel: distance ? distance[1] : '',
    occasion: OCCASIONS.includes(d.occasion) ? d.occasion : '',
    notes: text(d.notes, 1000), lettering: text(d.lettering, 120),
  };
  const T = quote(lines, order, charlotteToday());
  if (T.days == null || Number.isNaN(T.days) || T.days < 1) return bad('Please pick a date from tomorrow on. For same-day treats, message B. on Instagram.');
  if (T.days > MAX_DAYS_AHEAD) return bad('Please pick a date within the next year.');
  if (isRush(T.days)) return { error: fail(409, 'rush', 'Rush orders (within 48 hours) can’t be paid online. Please message B. on Instagram.') };
  if (agree !== true) return bad('Please tick the deposit box to continue.');
  // The customer must be charged exactly what the page showed them (an old cached page could differ).
  if (expected !== T.dep) return { error: fail(409, 'changed', 'Prices on this page are out of date. Please refresh the page and try again.') };
  return { order: { ...order, T } };
}

function orderNote(no, o) {
  const T = o.T, where = o.method === 'Pickup' ? 'pickup' : 'delivery';
  return [
    `Order ${no} · 50% deposit paid online`,
    `Needed: ${niceDate(o.date)}${o.time ? ' at ' + niceTime(o.time) : ''} · ${o.method}${o.distanceLabel ? ` (${o.distanceLabel.toLowerCase()})` : ''}`,
    ...o.lines.map(lineText),
    o.occasion && `Occasion: ${o.occasion}`,
    o.notes && `Colours, theme & notes: ${o.notes}`,
    o.lettering && `Lettering: ${o.lettering}`,
    `Subtotal ${money(T.sub)}${T.delLabel ? ` · Delivery ${T.delLabel}` : ''} · Order total ${money(T.total)}`,
    `Deposit paid ${money(T.dep)} · Due at ${where} ${money(T.bal)}`,
    T.delExtra === 'quoted' && 'Delivery fee: quoted by B., added at delivery.',
    T.delExtra === 'more' && 'Delivery is $15 and up: anything over $15 is added at delivery.',
  ].filter(Boolean).join('\n');
}

// One call to Square, retried once (with the same idempotency key, so it can't charge twice) if
// the network drops or Square has a server error.
async function squareFetch(url, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
      if (res.status < 500 || attempt) return res;
    } catch (e) {
      if (attempt) throw e;
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const mode = env('SQUARE_ENV'), token = env('SQUARE_ACCESS_TOKEN'), location = env('SQUARE_LOCATION_ID');
  if (!SQUARE_API[mode] || !token || !location) return fail(503, 'unavailable', 'Online payment isn’t switched on yet.');

  // Only B.'s own pages may ask for a payment link (localhost too, while testing in sandbox).
  const origin = req.headers.get('origin') || '';
  if (!SITES.some(r => r.test(origin)) && !(mode === 'sandbox' && LOCAL.test(origin))) return fail(403, 'origin', 'Not allowed.');
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return fail(415, 'type', 'Send JSON.');

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, 'size', 'That order is too long. Please message B. on Instagram.');
  let body;
  try { body = JSON.parse(raw); } catch (_) { body = null; }
  const { order, error } = readOrder(body);
  if (error) return error;

  const no = orderNumber(), T = order.T;
  const res = await squareFetch(`${SQUARE_API[mode]}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: location,
        reference_id: no,
        line_items: [{
          name: `50% deposit · Luxury Bites order ${no}`,
          quantity: '1',
          base_price_money: { amount: Math.round(T.dep * 100), currency: 'USD' },
          note: orderNote(no, order).slice(0, 2000),
        }],
      },
      checkout_options: {
        redirect_url: `${origin}/?order=${no}`,
        ask_for_shipping_address: order.method === 'Delivery',
        // Square only asks for a name with a shipping address, so pickup orders ask for one here.
        ...(order.method === 'Pickup' && { custom_fields: [{ title: 'Name for the order' }] }),
        allow_tipping: false,
        merchant_support_email: SUPPORT_EMAIL,
      },
      payment_note: `Order ${no} · deposit for ${niceDate(order.date)} ${order.method.toLowerCase()} · balance ${money(T.bal)}`.slice(0, 500),
    }),
  }).catch(e => { console.error('Square request failed:', e.name); return null; });

  if (!res || !res.ok) {
    if (res) console.error('Square error', res.status, JSON.stringify((await res.json().catch(() => ({}))).errors || []));
    return fail(502, 'square', 'We couldn’t reach Square just now. Please try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  let url = null;
  try { url = new URL(data.payment_link?.url); } catch (_) { /* checked below */ }
  if (!url || url.protocol !== 'https:' || !SQUARE_PAGE.test(url.hostname)) {
    console.error('Unexpected payment link from Square');
    return fail(502, 'square', 'We couldn’t reach Square just now. Please try again in a minute.');
  }
  return reply(200, { url: url.href, order: no, deposit: T.dep, balance: T.bal });
}
