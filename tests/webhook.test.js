/* Tests for the deposit → invoice webhook. No real Square calls: fetch is replaced with a small fake
   Square that answers by URL and records every request. */
import handler, { config, invoiceDeposit, invoiceLines, fromNote } from '../netlify/functions/square-webhook.mjs';
import { writeMeta, readMeta } from '../netlify/lib/order-meta.mjs';

const M = globalThis.LuxuryMenu;
const HOOK_URL = 'https://luxurybitesbyb.co/api/square-webhook';
const KEY = 'test-signature-key';
const ENV_OK = { SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'test-token', SQUARE_LOCATION_ID: 'LOC123', SQUARE_WEBHOOK_SIGNATURE_KEY: KEY, SQUARE_WEBHOOK_URL: HOOK_URL };
let ENV = { ...ENV_OK };
globalThis.Netlify = { env: { get: k => ENV[k] } };

// ---------- a fake Square ----------
let calls = [], square = {};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
  calls.push({ host: u.host, path: u.pathname, method, body, headers: init.headers });
  const route = Object.keys(square).find(k => { const [m, p] = k.split(' '); return m === method && new RegExp('^' + p + '$').test(u.pathname); });
  if (!route) return json({ errors: [{ code: 'NOT_FOUND' }] }, 404);
  const r = square[route];
  return typeof r === 'function' ? r(body, u) : r;
};
const posts = path => calls.filter(c => c.method === 'POST' && c.path.startsWith(path));

// Charlotte's date n days from today.
function day(n) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  const t = new Date(y, m - 1, d + n), p = x => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// A website order, as the checkout would have seen it: 2 dozen blush strawberries with sprinkles + red velvet cake pops.
const LINES = [
  M.cleanLine({ pid: 'straw', size: 2, choc: 0, color: 1, touches: ['sprinkles'], qty: 2 }),
  M.cleanLine({ pid: 'pops', size: 0, flavor: 3, color: 0, qty: 1 }),
];
function checkoutOrder(over = {}) {
  const o = { lines: LINES, date: day(10), time: '14:00', method: 'Pickup', distance: 'near', occasion: 'Birthday', ...over };
  const T = M.quote(o.lines, o, new Date(1970, 0, 1));
  return { o, T, meta: writeMeta(o, T) };
}

const NO = 'LB-ABC234', PAY = 'PAYMENT0001';
function setScene({ over = {}, payment = {}, order = {}, customer = null, searchHit = null } = {}) {
  const { o, T, meta } = checkoutOrder(over);
  calls = [];
  const theOrder = {
    id: 'DEPOSITORDER1', reference_id: NO, metadata: meta,
    line_items: [{ name: `50% deposit · Luxury Bites order ${NO}`, note: `Order ${NO} · 50% deposit paid online\nOccasion: Birthday\nColours, theme & notes: Blush and gold\nLettering: Happy 30th` }],
    ...order,
  };
  const thePayment = {
    id: PAY, status: 'COMPLETED', location_id: 'LOC123', order_id: 'DEPOSITORDER1', created_at: new Date().toISOString(),
    amount_money: { amount: Math.round(T.dep * 100), currency: 'USD' }, buyer_email_address: 'Jasmine@Example.com',
    note: `Order ${NO} · deposit for ${M.niceDate(o.date)} ${o.method.toLowerCase()} (${o.date}) · balance ${M.money(T.bal)}`,
    ...payment,
  };
  square = {
    'GET /v2/payments/PAYMENT0001': json({ payment: thePayment }),
    'GET /v2/orders/DEPOSITORDER1': json({ order: theOrder }),
    'GET /v2/customers/[A-Z0-9]+': customer ? json({ customer }) : json({ errors: [{ code: 'NOT_FOUND' }] }, 404),
    'PUT /v2/customers/[A-Z0-9]+': b => json({ customer: { ...customer, ...b, version: 2 } }),
    'POST /v2/customers/search': json(searchHit ? { customers: [searchHit] } : {}),
    'POST /v2/customers': b => json({ customer: { id: 'NEWCUSTOMER1', ...b } }),
    'POST /v2/orders': b => json({ order: { id: 'BALANCEORDER1', ...b.order } }),
    'POST /v2/invoices': b => json({ invoice: { id: 'INVOICE1', version: 0, status: 'DRAFT', ...b.invoice } }),
    'POST /v2/invoices/INVOICE1/publish': json({ invoice: { id: 'INVOICE1', version: 1, status: 'UNPAID' } }),
    'GET /v2/invoices/INVOICE1': json({ invoice: { id: 'INVOICE1', version: 1, status: 'UNPAID' } }),
  };
  return { o, T };
}

async function sign(payload, key = KEY) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)))));
}
function event(type = 'payment.updated', status = 'COMPLETED', id = PAY) {
  return JSON.stringify({ merchant_id: 'M1', type, event_id: 'E1', data: { type: 'payment', id, object: { payment: { id, status } } } });
}
async function notify(body = event(), { signature, url = HOOK_URL, key = KEY, method = 'POST' } = {}) {
  const sig = signature ?? await sign(url + body, key);
  return handler(new Request(HOOK_URL, { method, headers: { 'x-square-hmacsha256-signature': sig, 'Content-Type': 'application/json' }, ...(method === 'POST' && { body }) }));
}

// Capture logs to prove nothing personal is written.
const logs = [];
for (const k of ['log', 'error']) { const orig = console[k]; console[k] = (...a) => { logs.push(a.join(' ')); orig(...a); }; }

const results = [];
async function test(name, fn) {
  ENV = { ...ENV_OK };
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

// ---------- order metadata ----------
await test('order metadata round-trips and fits Square limits (10 entries, 255 characters)', () => {
  const { o, T, meta } = checkoutOrder();
  ok(Object.keys(meta).length <= 10 && Object.values(meta).every(v => typeof v === 'string' && v.length <= 255), 'metadata within limits');
  const back = readMeta(meta);
  eq(back.lines.map(M.lineText), o.lines.map(M.lineText), 'lines');
  eq([back.date, back.time, back.method, back.occasion, back.total, back.balance], [o.date, '14:00', 'Pickup', 'Birthday', Math.round(T.total * 100), Math.round(T.bal * 100)], 'details');
});

await test('a 30-line order with every finishing touch still fits', () => {
  const big = Array.from({ length: 30 }, (_, i) => M.cleanLine({ pid: 'straw', size: 3, choc: 3, color: 7, glitter: 12, qty: 10, touches: M.TOUCHES.map(t => t.id), key: i }));
  const o = { lines: big, date: day(10), time: '', method: 'Delivery', distance: 'long', occasion: 'Gift / thank-you' };
  const meta = writeMeta(o, M.quote(big, o, new Date(1970, 0, 1)));
  ok(Object.keys(meta).length <= 10 && Object.values(meta).every(v => v.length <= 255), 'within limits');
  eq(readMeta(meta).lines.length, 30, 'all 30 lines read back');
});

await test('tampered or unknown metadata lines are rejected (balance-only invoice instead)', () => {
  const { meta } = checkoutOrder();
  eq(readMeta({ ...meta, l0: 'nope.0.0....1.1.' }).lines, null, 'unknown treat');
  eq(readMeta({ ...meta, l0: meta.l0.replace(/^straw\.2/, 'straw.9') }).lines, null, 'size out of range');
  eq(readMeta({ ...meta, n: '5' }).lines, null, 'line count mismatch');
  eq(readMeta({ ...meta, b: '99999999' }), null, 'balance larger than total');
  eq(readMeta({ v: '2' }), null, 'unknown version');
});

// ---------- signature and set-up ----------
await test('unsigned, forged or wrong-URL notifications are refused before Square is called', async () => {
  setScene();
  eq((await notify(event(), { signature: '' })).status, 401, 'no signature');
  eq((await notify(event(), { signature: 'AAAA' })).status, 401, 'garbage signature');
  eq((await notify(event(), { key: 'someone-elses-key' })).status, 401, 'wrong key');
  eq((await notify(event(), { url: 'https://evil.example/api/square-webhook' })).status, 401, 'signed for another URL');
  const body = event(), sig = await sign(HOOK_URL + body);
  eq((await notify(body.replace('PAYMENT0001', 'PAYMENT0002'), { signature: sig })).status, 401, 'body changed after signing');
  eq(calls.length, 0, 'no Square calls');
});

await test('missing settings switch the webhook off; only POST is accepted', async () => {
  for (const k of Object.keys(ENV_OK)) { ENV = { ...ENV_OK, [k]: '' }; eq((await notify()).status, 503, `missing ${k}`); }
  ENV = { ...ENV_OK, SQUARE_ENV: 'live' }; eq((await notify()).status, 503, 'unknown SQUARE_ENV');
  ENV = { ...ENV_OK }; eq((await notify(event(), { method: 'GET' })).status, 405, 'GET');
});

await test('other event types and unfinished payments are ignored without calling Square', async () => {
  setScene();
  eq(await (await notify(event('refund.created'))).text(), 'Ignored.', 'refund event');
  eq(await (await notify(event('payment.created', 'APPROVED'))).text(), 'Ignored.', 'approved, not completed');
  eq(await (await notify(JSON.stringify({ type: 'payment.updated', data: { id: '../../v2/customers' } }))).text(), 'Ignored.', 'odd payment id');
  eq(calls.length, 0, 'no Square calls');
});

// ---------- the invoice ----------
await test('paid pickup deposit: customer created with their name, every treat invoiced, deposit taken off, balance due on the day', async () => {
  const { o, T } = setScene({ order: { custom_fields: [{ uid: 'cf1', title: 'Name for the order', value: 'Jasmine Doe' }] } });
  const res = await notify();
  eq(res.status, 200, 'status');
  const cust = posts('/v2/customers').find(c => c.path === '/v2/customers').body;
  eq([cust.given_name, cust.family_name, cust.email_address, cust.idempotency_key], ['Jasmine', 'Doe', 'jasmine@example.com', 'lb-customer-PAYMENT0001'], 'customer');
  const ord = posts('/v2/orders')[0].body;
  eq(ord.idempotency_key, 'lb-order-PAYMENT0001', 'order key');
  eq(ord.order.customer_id, 'NEWCUSTOMER1', 'order customer');
  eq(ord.order.line_items.map(l => [l.name, l.quantity, l.base_price_money.amount]), [['Chocolate-Covered Strawberries', '2', 4200], ['Cake Pops', '1', 4500]], 'line items at menu prices');
  ok(/Blush pink & gold/.test(ord.order.line_items[0].variation_name), 'choices shown on the line');
  eq(ord.order.discounts[0].amount_money.amount, Math.round(T.dep * 100), 'deposit taken off');
  const sum = ord.order.line_items.reduce((t, l) => t + l.base_price_money.amount * Number(l.quantity), 0) - ord.order.discounts[0].amount_money.amount;
  eq(sum, Math.round(T.bal * 100), 'invoice total = balance the checkout quoted');
  const inv = posts('/v2/invoices').find(c => c.path === '/v2/invoices').body;
  eq([inv.idempotency_key, inv.invoice.invoice_number, inv.invoice.delivery_method, inv.invoice.primary_recipient.customer_id], ['lb-invoice-PAYMENT0001', NO, 'EMAIL', 'NEWCUSTOMER1'], 'invoice basics');
  eq(inv.invoice.payment_requests, [{ request_type: 'BALANCE', due_date: o.date, tipping_enabled: false }], 'balance due on the pickup date');
  ok(inv.invoice.description.includes(`deposit of ${M.money(T.dep)} was paid online`) && /Lettering: Happy 30th/.test(inv.invoice.description), "description");
  eq(posts('/v2/invoices/INVOICE1/publish')[0].body, { version: 0, idempotency_key: 'lb-publish-PAYMENT0001' }, 'published (Square emails it)');
  ok(calls.every(c => c.host === 'connect.squareupsandbox.com'), 'sandbox API');
});

await test('delivery: name from the shipping address, delivery fee on the invoice', async () => {
  const { T } = setScene({ over: { method: 'Delivery', distance: 'mid' }, payment: { shipping_address: { first_name: 'Kim', last_name: 'Lee', address_line_1: '1 Main St' } } });
  eq((await notify()).status, 200, 'status');
  const cust = posts('/v2/customers').find(c => c.path === '/v2/customers').body;
  eq([cust.given_name, cust.family_name], ['Kim', 'Lee'], 'name');
  const items = posts('/v2/orders')[0].body.order.line_items;
  eq(items.at(-1).name, 'Delivery (10–15 miles)', 'delivery line');
  eq(items.at(-1).base_price_money.amount, 1000, 'delivery fee');
  eq(T.del, 10, 'quote has the fee');
});

await test('existing Square customer is reused, and their missing name is filled in', async () => {
  setScene({ payment: { customer_id: 'CUST7', shipping_address: { first_name: 'Ana', last_name: 'Ruiz' } }, customer: { id: 'CUST7', version: 1, email_address: 'jasmine@example.com' } });
  eq((await notify()).status, 200, 'status');
  eq(posts('/v2/customers').filter(c => c.path === '/v2/customers').length, 0, 'no new customer');
  const put = calls.find(c => c.method === 'PUT');
  eq([put.path, put.body.given_name, put.body.family_name, put.body.version], ['/v2/customers/CUST7', 'Ana', 'Ruiz', 1], 'name filled in');
  eq(posts('/v2/invoices').find(c => c.path === '/v2/invoices').body.invoice.primary_recipient.customer_id, 'CUST7', 'invoice to that customer');
});

await test('customer found by email is reused instead of making a duplicate', async () => {
  setScene({ searchHit: { id: 'CUST9', given_name: 'Jasmine', family_name: 'Doe', email_address: 'jasmine@example.com' } });
  eq((await notify()).status, 200, 'status');
  eq(posts('/v2/customers/search')[0].body.query.filter.email_address.exact, 'jasmine@example.com', 'searched by email');
  eq(posts('/v2/customers').filter(c => c.path === '/v2/customers').length, 0, 'no new customer');
});

await test('B.\'s in-person sales, other locations, refunds and old payments are left alone', async () => {
  const none = () => posts('/v2/orders').length + posts('/v2/invoices').length + posts('/v2/customers').length;
  setScene({ order: { reference_id: 'TABLE 4', line_items: [{ name: 'Strawberries' }] } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: not a website deposit', 'in-person sale'); eq(none(), 0, 'nothing created');
  setScene({ order: { line_items: [{ name: 'Strawberries' }] } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: not a website deposit', 'LB- number but not a deposit line');
  setScene({ payment: { location_id: 'OTHER' } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: other location', 'other location');
  setScene({ payment: { refunded_money: { amount: 500, currency: 'USD' } } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: refunded', 'refunded');
  setScene({ payment: { created_at: new Date(Date.now() - 10 * 864e5).toISOString() } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: old payment', 'old payment');
  setScene({ payment: { status: 'FAILED' } });
  eq(await invoiceDeposit(PAY, sqFor()), 'skipped: payment not completed', 'failed payment');
  eq(none(), 0, 'nothing created');
});

await test('Square repeating the notification gives the same idempotency keys (no second invoice)', async () => {
  setScene();
  await notify(event('payment.created')); await notify(event('payment.updated'));
  const keys = c => posts(c).map(x => x.body.idempotency_key);
  eq(new Set(keys('/v2/orders')).size, 1, 'one order key');
  eq(new Set(keys('/v2/invoices').filter(k => k.startsWith('lb-invoice'))).size, 1, 'one invoice key');
  eq(new Set(posts('/v2/customers').filter(c => c.path === '/v2/customers').map(c => c.body.idempotency_key)).size, 1, 'one customer key');
});

await test('already published by an earlier notice: publish error is fine', async () => {
  setScene();
  square['POST /v2/invoices/INVOICE1/publish'] = json({ errors: [{ code: 'VERSION_MISMATCH' }] }, 400);
  eq((await notify()).status, 200, 'status');
});

await test('Square failing gives 500 so Square retries later', async () => {
  setScene();
  square['POST /v2/invoices'] = json({ errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }, 500);
  eq((await notify()).status, 500, 'status');
  eq(posts('/v2/invoices').length, 2, 'retried once with the same key');
  eq(posts('/v2/invoices')[0].body.idempotency_key, posts('/v2/invoices')[1].body.idempotency_key, 'same key on retry');
});

await test('metadata missing: date and balance come from the payment note, one balance line', async () => {
  const { o, T } = setScene({ order: { metadata: undefined } });
  eq((await notify()).status, 200, 'status');
  const ord = posts('/v2/orders')[0].body.order;
  eq(ord.line_items.map(l => [l.name, l.base_price_money.amount]), [[`Remaining balance · Luxury Bites order ${NO}`, Math.round(T.bal * 100)]], 'balance line');
  eq(ord.discounts, undefined, 'no discount line');
  eq(posts('/v2/invoices').find(c => c.path === '/v2/invoices').body.invoice.payment_requests[0].due_date, o.date, 'due date from note');
});

await test('menu prices changed since checkout: the customer is still billed the quoted balance', () => {
  const { meta } = checkoutOrder();
  const info = readMeta({ ...meta, t: String(Number(meta.t) + 500) }); // pretend the total was $5 more at checkout
  const lines = invoiceLines(info, Number(meta.t) - Number(meta.b), NO).line_items;
  eq(lines.length, 1, 'one line'); eq(lines[0].base_price_money.amount, info.balance, 'quoted balance');
});

await test('payment note backup is strict', () => {
  eq(fromNote(`Order ${NO} · deposit for Saturday, December 5 delivery (2026-12-05) · balance $63.50`, NO).method, 'Delivery', 'delivery');
  eq(fromNote(`Order ${NO} · deposit for Saturday, December 5 pickup (2026-12-05) · balance $63`, NO).balance, 6300, 'whole dollars');
  eq(fromNote('Lunch for 2', NO), null, 'not ours');
  eq(fromNote(`Order LB-ZZZ999 · deposit (2026-12-05) · balance $1`, NO), null, 'another order number');
});

await test('no email and no name: nothing is invoiced, B. is flagged in the log', async () => {
  setScene({ payment: { buyer_email_address: undefined } });
  ok(/^needs B\./.test(await invoiceDeposit(PAY, sqFor())), 'flagged');
  eq(posts('/v2/invoices').length, 0, 'no invoice');
});

await test('logs never contain the customer\'s name, email, notes or the token', () => {
  const text = logs.join('\n');
  for (const secret of ['jasmine', 'Jasmine', 'Doe', 'Happy 30th', 'Blush and gold', 'test-token', 'Kim', 'Ruiz']) ok(!text.includes(secret), `log leaked "${secret}"`);
});

await test('served at /api/square-webhook with no rate limit (Square must always get through)', () => {
  eq(config, { path: '/api/square-webhook' }, 'config');
});

function sqFor() {
  const call = async (method, path, body) => {
    const res = await fetch('https://connect.squareupsandbox.com' + path, { method, ...(body && { body: JSON.stringify(body) }) });
    const data = await res.json();
    if (!res.ok) throw new Error(`Square ${res.status}`);
    return data;
  };
  return { sq: { get: p => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b) }, location: 'LOC123' };
}

const failed = results.filter(r => r[0] !== 'ok');
document.getElementById('out').textContent = results.map(r => r.join('  ')).join('\n') + `\n\n${results.length - failed.length}/${results.length} passed`;
