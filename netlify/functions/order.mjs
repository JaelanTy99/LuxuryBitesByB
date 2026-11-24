/* Luxury Bites by B. — takes an order from the order sheet and has Square email the customer an
   invoice straight away, the way B. already works: order → invoice → 50% deposit holds the date.
   The invoice has two parts: the 50% deposit, due within 48 hours, and the balance, due on the
   pickup or delivery date. B. sees every invoice (and who it's for) in the Square app.

   The browser sends the menu choices, the date and the customer's contact details. Prices are worked
   out again here from the shared menu (public/menu.js), never taken from the browser. Contact details
   are checked and passed straight to Square (a customer profile + the invoice): the site stores
   nothing, and nothing personal is written to the logs. Card details are only ever entered on
   Square's invoice page.

   Environment variables (Netlify → Project configuration → Environment variables, never in the repo):
     SQUARE_ACCESS_TOKEN  Square access token (sandbox or production, matching SQUARE_ENV)
     SQUARE_LOCATION_ID   Square location the invoices belong to
     SQUARE_ENV           "sandbox" or "production"; anything else switches online ordering off */

import '../../public/menu.js';

const { cleanLine, quote, isRush, money, niceDate, niceTime, byId, desc, DISTANCES, OCCASIONS } = globalThis.LuxuryMenu;

const SQUARE_VERSION = '2026-09-16';
const SQUARE_API = { sandbox: 'https://connect.squareupsandbox.com', production: 'https://connect.squareup.com' };
// Square's invoice pages (sandbox and production), where the customer pays.
const INVOICE_PAGE = /^([a-z0-9-]+\.)*squareup(sandbox)?\.com$/;
const SITES = [/^https:\/\/(www\.)?luxurybitesbyb\.co$/, /^https:\/\/([a-z0-9-]+--)?luxurybitesbyb\.netlify\.app$/];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_BODY = 20000, MAX_LINES = 30, MAX_DAYS_AHEAD = 366;
// Common slips when typing ".com" (none of these are real endings).
const TYPO_TLD = /\.(con|coom|comm|cmo|ocm|vom|xom|cpm|comn|cim|clm)$/;
const DEPOSIT_DAYS = 2;     // B.'s rule: deposit within 24–48 hours of the invoice
const TIME_BUDGET = 7000;   // ms; Netlify stops a function after 10 s, so no retries past this

export const config = {
  path: '/api/order',
  // Each order emails an invoice from B.'s Square account, so keep it to a few per minute per visitor.
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const fail = (status, code, error, field) => reply(status, { code, error, ...(field && { field }) });
const env = name => globalThis.Netlify?.env.get(name) || '';
// Free text from customers: drop control characters (newlines and tabs are kept), trim, cap the length.
const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const oneLine = (v, max) => text(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
const cents = dollars => ({ amount: Math.round(dollars * 100), currency: 'USD' });
const nicePhone = p => `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}`;

// Today's date in Charlotte, as a Date at local midnight (the shape menu.js's date maths expects).
function charlotteToday(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number);
  return new Date(y, m - 1, d);
}
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function orderNumber() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'LB-' + [...bytes].map(b => abc[b % abc.length]).join('');
}

// Reads and checks the request. Returns { order, contact } or { error: Response }.
function readOrder(body) {
  const bad = (msg, field) => ({ error: fail(400, 'invalid', msg, field) });
  if (!body || typeof body !== 'object') return bad('We couldn’t read your order. Please refresh and try again.');
  const { lines: raw, details: d = {}, contact: c, agree, expected } = body;
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
  if (!date) return bad('Please pick the date you need your treats.', 'date');
  if (!method || (method === 'Delivery' && !distance)) return bad('Please choose pickup or delivery.');
  const order = {
    lines, date, time, method, distance: distance ? distance[0] : 'near', distanceLabel: distance ? distance[1] : '',
    occasion: OCCASIONS.includes(d.occasion) ? d.occasion : '',
    notes: text(d.notes, 1000), lettering: text(d.lettering, 120),
  };
  const T = quote(lines, order, charlotteToday());
  if (T.days == null || Number.isNaN(T.days) || T.days < 1) return bad('Please pick a date from tomorrow on. For same-day treats, message B. on Instagram.', 'date');
  if (T.days > MAX_DAYS_AHEAD) return bad('Please pick a date within the next year.', 'date');
  if (isRush(T.days)) return { error: fail(409, 'rush', 'Rush orders (within 48 hours) can’t be ordered online. Please message B. on Instagram.') };

  const { contact, error } = readContact(c, method);
  if (error) return { error };
  if (agree !== true) return bad('Please tick the deposit box to continue.');
  // The invoice must match what the page showed the customer (an old cached page could differ).
  if (expected !== T.dep) return { error: fail(409, 'changed', 'Prices on this page are out of date. Please refresh the page and try again.') };
  return { order: { ...order, T }, contact };
}

// Name, email and phone for everyone; the address for deliveries. Returns { contact } or { error }.
function readContact(c, method) {
  const bad = (field, msg) => ({ error: fail(400, 'invalid', msg, field) });
  c = c && typeof c === 'object' ? c : {};
  const name = oneLine(c.name, 100), email = oneLine(c.email, 254).toLowerCase();
  let phone = (typeof c.phone === 'string' ? c.phone.slice(0, 40) : '').replace(/\D/g, '');
  if (phone.length === 11 && phone[0] === '1') phone = phone.slice(1);
  if (name.length < 2) return bad('name', 'Please add your name.');
  if (!/^[^\s@<>()[\]",;:\\]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) return bad('email', 'Please check your email address. Your invoice is sent there.');
  if (TYPO_TLD.test(email)) return bad('email', 'Please check the end of your email address. Did you mean .com?');
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return bad('phone', 'Please add a 10-digit phone number.');
  const contact = { name, email, phone: '+1' + phone, address: null };
  if (method === 'Delivery') {
    const a = c.address && typeof c.address === 'object' ? c.address : {};
    const line1 = oneLine(a.line1, 100), line2 = oneLine(a.line2, 100), city = oneLine(a.city, 60);
    const state = oneLine(a.state || 'NC', 20).toUpperCase(), zip = oneLine(a.zip, 20);
    if (line1.length < 3) return bad('line1', 'Please add the delivery address.');
    if (city.length < 2) return bad('city', 'Please add the city.');
    if (!/^[A-Z]{2}$/.test(state)) return bad('state', 'Please use the 2-letter state, like NC.');
    if (!/^\d{5}(-\d{4})?$/.test(zip)) return bad('zip', 'Please check the ZIP code.');
    contact.address = { line1, line2, city, state, zip };
  }
  return { contact };
}

// Small Square client: one retry (same request, same idempotency key, so nothing is made twice) on a
// network drop or Square server error. Errors carry only the status and Square's error codes, never
// request contents, so nothing personal reaches the logs.
function squareClient(mode, token, started = Date.now()) {
  async function call(method, path, body) {
    const what = `Square ${method} ${path.split('/')[2]}`;
    for (let attempt = 0; ; attempt++) {
      const last = attempt > 0 || Date.now() - started > TIME_BUDGET;
      let res = null;
      try {
        res = await fetch(SQUARE_API[mode] + path, {
          method, signal: AbortSignal.timeout(5000),
          headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' },
          ...(body && { body: JSON.stringify(body) }),
        });
      } catch (_) {
        if (last) throw new Error(`${what}: unreachable`);
      }
      if (res && (res.status < 500 || last)) {
        const data = await res.json().catch(() => ({}));
        if (res.ok) return data;
        const codes = (data.errors || []).map(e => e.code);
        throw Object.assign(new Error(`${what}: ${res.status} ${codes.join(',')}`), { codes });
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return { post: (p, b) => call('POST', p, b) };
}

function splitName(n) {
  const parts = n.split(' ').filter(Boolean);
  return parts.length > 1 ? [parts.slice(0, -1).join(' '), parts.at(-1)] : [parts[0], ''];
}

// The customer's Square profile: an existing one with the same email (left as it is), or a new one.
async function customerFor(sq, c, key) {
  const found = await sq.post('/v2/customers/search', { query: { filter: { email_address: { exact: c.email } } }, limit: 1 });
  if (found.customers?.[0]?.id) return found.customers[0].id;
  const [given, family] = splitName(c.name), a = c.address;
  const { customer } = await sq.post('/v2/customers', {
    idempotency_key: `c-${key}`,
    given_name: given, ...(family && { family_name: family }),
    email_address: c.email, phone_number: c.phone,
    ...(a && { address: { address_line_1: a.line1, ...(a.line2 && { address_line_2: a.line2 }), locality: a.city, administrative_district_level_1: a.state, postal_code: a.zip, country: 'US' } }),
    note: 'Added by the website order sheet.',
  });
  return customer.id;
}

// Every treat at its menu price, plus the delivery fee: adds up to the order total the page showed.
function lineItems(o) {
  const items = o.lines.map(l => ({
    name: byId[l.pid].name, variation_name: desc(l).slice(0, 255), quantity: String(l.qty), base_price_money: cents(l.unit),
  }));
  if (o.T.del) items.push({ name: `Delivery (${o.distanceLabel.toLowerCase()})`, quantity: '1', base_price_money: cents(o.T.del) });
  return items;
}

function invoiceNote(o, c, depositDue) {
  const T = o.T, where = o.method === 'Pickup' ? 'pickup' : 'delivery', a = c.address;
  return [
    `Thank you for your order! Pay the 50% deposit (${money(T.dep)}) by ${niceDate(depositDue)} to hold your date. It's non-refundable if you cancel, and refunded in full if B. can't take your date.`,
    `The balance (${money(T.bal)}) is due at ${where} on ${niceDate(o.date)}${o.time ? ' at ' + niceTime(o.time) : ''}. Pay it here online, or at ${where}.`,
    o.method === 'Pickup' ? 'Pickup in North Charlotte (28262). B. sends the address when confirming your order.'
      : `Deliver to: ${[a.line1, a.line2].filter(Boolean).join(', ')}, ${a.city}, ${a.state} ${a.zip}`,
    `Phone: ${nicePhone(c.phone)}`,
    o.occasion && `Occasion: ${o.occasion}`,
    o.notes && `Colours, theme & notes: ${o.notes}`,
    o.lettering && `Lettering: ${o.lettering}`,
    T.delExtra === 'quoted' && 'Delivery fee: quoted by B. and added at delivery.',
    T.delExtra === 'more' && 'Delivery is $15 and up: anything over $15 is added at delivery.',
  ].filter(Boolean).join('\n').slice(0, 4000);
}

export default async function handler(req) {
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const mode = env('SQUARE_ENV'), token = env('SQUARE_ACCESS_TOKEN'), location = env('SQUARE_LOCATION_ID');
  if (!SQUARE_API[mode] || !token || !location) return fail(503, 'unavailable', 'Online ordering isn’t switched on yet.');

  // Only B.'s own pages may send orders (localhost too, while testing in sandbox).
  const origin = req.headers.get('origin') || '';
  if (!SITES.some(r => r.test(origin)) && !(mode === 'sandbox' && LOCAL.test(origin))) return fail(403, 'origin', 'Not allowed.');
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return fail(415, 'type', 'Send JSON.');

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, 'size', 'That order is too long. Please message B. on Instagram.');
  let body;
  try { body = JSON.parse(raw); } catch (_) { body = null; }
  const { order, contact, error } = readOrder(body);
  if (error) return error;

  const no = orderNumber(), T = order.T, key = crypto.randomUUID(), sq = squareClient(mode, token);
  // The date is at least 3 days away (rush orders are refused), so the deposit is always due first.
  const depositDue = isoDate(addDays(charlotteToday(), DEPOSIT_DAYS));
  try {
    const customerId = await customerFor(sq, contact, key);
    const { order: sqOrder } = await sq.post('/v2/orders', {
      idempotency_key: `o-${key}`,
      order: { location_id: location, reference_id: no, customer_id: customerId, line_items: lineItems(order) },
    });
    const { invoice: draft } = await sq.post('/v2/invoices', {
      idempotency_key: `i-${key}`,
      invoice: {
        location_id: location,
        order_id: sqOrder.id,
        primary_recipient: { customer_id: customerId },
        payment_requests: [
          // Square allows tipping_enabled only on the last request (the balance), so the deposit has none.
          { request_type: 'DEPOSIT', due_date: depositDue, fixed_amount_requested_money: cents(T.dep) },
          { request_type: 'BALANCE', due_date: order.date, tipping_enabled: false },
        ],
        delivery_method: 'EMAIL',
        invoice_number: no,
        title: `Luxury Bites order ${no}`,
        description: invoiceNote(order, contact, depositDue),
        sale_or_service_date: order.date,
        accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false, cash_app_pay: false },
      },
    });
    // Publishing is what makes Square email the invoice to the customer.
    const { invoice } = await sq.post(`/v2/invoices/${encodeURIComponent(draft.id)}/publish`, { version: draft.version, idempotency_key: `p-${key}` });

    let invoiceUrl = null;
    try {
      const u = new URL(invoice.public_url);
      if (u.protocol === 'https:' && INVOICE_PAGE.test(u.hostname)) invoiceUrl = u.href;
    } catch (_) { /* no pay button then; the email still has one */ }
    console.log(`Invoice sent for ${no}`);
    return reply(200, { order: no, invoiceUrl, deposit: T.dep, balance: T.bal, depositDue });
  } catch (e) {
    console.error(`Order ${no} not sent:`, e.message);
    const codes = e.codes || [];
    if (codes.includes('INVALID_EMAIL_ADDRESS')) return fail(400, 'invalid', 'Square couldn’t use that email address. Please check it and try again.', 'email');
    if (codes.includes('INVALID_PHONE_NUMBER')) return fail(400, 'invalid', 'Square couldn’t use that phone number. Please check it and try again.', 'phone');
    return fail(502, 'square', 'We couldn’t send your invoice just now. Please try again in a minute.');
  }
}
