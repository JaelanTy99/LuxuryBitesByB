/* Tests for the order function (order → Square invoice). No real Square calls: fetch is replaced with
   a small fake Square that answers by URL and records every request. */
import handler, { config } from '../netlify/functions/order.mjs';

const M = globalThis.LuxuryMenu;
let ENV = {};
globalThis.Netlify = { env: { get: k => ENV[k] } };
const SANDBOX = { SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'test-token', SQUARE_LOCATION_ID: 'LOC123' };
const ORIGIN = 'https://luxurybitesbyb.co';

// ---------- a fake Square ----------
let calls = [], square = {}, fails = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const INVOICE_URL = 'https://squareupsandbox.com/pay-invoice/inv:0-ChAbc123';
function freshSquare({ existing = null, publicUrl = INVOICE_URL } = {}) {
  square = {
    'POST /v2/customers/search': json(existing ? { customers: [existing] } : {}),
    'POST /v2/customers': b => json({ customer: { id: 'NEWCUST1', ...b } }),
    'POST /v2/orders': b => json({ order: { id: 'ORDER1', ...b.order } }),
    // Like real Square: tipping_enabled is allowed only on the last payment request.
    'POST /v2/invoices': b => (b.invoice.payment_requests || []).slice(0, -1).some(p => 'tipping_enabled' in p)
      ? json({ errors: [{ code: 'INVALID_VALUE', field: 'invoice.payment_requests[0].tipping_enabled' }] }, 400)
      : json({ invoice: { id: 'INV1', version: 0, status: 'DRAFT', ...b.invoice } }),
    'POST /v2/invoices/INV1/publish': json({ invoice: { id: 'INV1', version: 1, status: 'UNPAID', public_url: publicUrl } }),
  };
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, host: u.host, path: u.pathname, method, body, headers: init.headers });
  if (fails.length) { const f = fails.shift(); if (f instanceof Error) throw f; if (f) return f; }
  const r = square[`${method} ${u.pathname}`];
  if (!r) return json({ errors: [{ code: 'NOT_FOUND' }] }, 404);
  return typeof r === 'function' ? r(body) : r.clone();
};
const post = path => calls.find(c => c.path === path)?.body;

// Charlotte's date n days from today, as YYYY-MM-DD.
function day(n) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  const t = new Date(y, m - 1, d + n), p = x => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
function today() { const [y, m, d] = day(0).split('-').map(Number); return new Date(y, m - 1, d); }

// A dozen milk-chocolate strawberries with a topper ($41) × 2, plus a dozen vanilla cake pops ($45).
const LINES = [
  { pid: 'straw', size: 2, choc: 0, color: 1, touches: ['topper'], glitter: 0, qty: 2 },
  { pid: 'pops', size: 0, flavor: 0, color: 0, touches: [], qty: 1 },
];
const CONTACT = { name: 'Jasmine Doe', email: 'Jasmine@Example.com', phone: '(980) 555-1234' };
const ADDRESS = { line1: '123 Sugar Ln', line2: 'Apt 4', city: 'Charlotte', state: 'nc', zip: '28262' };
function order(over = {}, details = {}, contact = {}) {
  const d = { date: day(7), time: '14:00', method: 'Pickup', distance: 'near', occasion: 'Birthday', notes: 'Pink & gold', lettering: 'Happy 30th', ...details };
  const lines = over.lines || LINES;
  const T = M.quote(lines.map(M.cleanLine), d, today());
  return { lines, details: d, contact: { ...CONTACT, ...(d.method === 'Delivery' && { address: ADDRESS }), ...contact }, agree: true, expected: T.dep, ...over };
}
// The browser's Request drops the Origin header, so the tests hand the function a look-alike.
function req(body, { origin = ORIGIN, method = 'POST', type = 'application/json' } = {}) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (type) headers.set('content-type', type);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { method, headers, text: async () => text };
}
async function call(body, opts) {
  const res = await handler(req(body, opts));
  return { status: res.status, data: await res.json() };
}

const logs = [];
for (const k of ['log', 'error']) { const orig = console[k]; console[k] = (...a) => { logs.push(a.join(' ')); orig(...a); }; }

const results = [];
async function test(name, fn) {
  ENV = { ...SANDBOX }; calls = []; fails = []; freshSquare();
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

await test('menu maths: 2 × $41 strawberries + $45 cake pops = $127, deposit $63.50', () => {
  const T = M.quote(LINES.map(M.cleanLine), { date: day(7), method: 'Pickup' }, today());
  eq([T.sub, T.total, T.dep, T.bal], [127, 127, 63.5, 63.5], 'totals');
});

await test('pickup order: new customer, every treat, invoice with 50% deposit (48 h) and balance (on the day), emailed', async () => {
  const sent = order();
  const { status, data } = await call(sent);
  eq(status, 200, 'status');
  eq(calls.map(c => c.path), ['/v2/customers/search', '/v2/customers', '/v2/orders', '/v2/invoices', '/v2/invoices/INV1/publish'], 'Square calls in order');
  ok(calls.every(c => c.host === 'connect.squareupsandbox.com' && c.headers.Authorization === 'Bearer test-token' && c.headers['Square-Version']), 'sandbox API, auth and version');

  eq(post('/v2/customers/search').query.filter.email_address.exact, 'jasmine@example.com', 'looked up by email');
  const cust = post('/v2/customers');
  eq([cust.given_name, cust.family_name, cust.email_address, cust.phone_number, cust.address], ['Jasmine', 'Doe', 'jasmine@example.com', '+19805551234', undefined], 'customer details');

  const ord = post('/v2/orders').order;
  ok(/^LB-[A-Z2-9]{6}$/.test(data.order), 'order number format');
  eq([ord.location_id, ord.reference_id, ord.customer_id], ['LOC123', data.order, 'NEWCUST1'], 'order basics');
  eq(ord.line_items.map(l => [l.name, l.quantity, l.base_price_money.amount]), [['Chocolate-Covered Strawberries', '2', 4100], ['Cake Pops', '1', 4500]], 'every treat at menu price');
  ok(/Blush pink & gold/.test(ord.line_items[0].variation_name) && /Birthday or holiday topper/.test(ord.line_items[0].variation_name), 'choices on each line');

  const inv = post('/v2/invoices').invoice;
  eq([inv.order_id, inv.primary_recipient.customer_id, inv.invoice_number, inv.delivery_method, inv.sale_or_service_date], ['ORDER1', 'NEWCUST1', data.order, 'EMAIL', sent.details.date], 'invoice basics');
  eq(inv.payment_requests, [
    { request_type: 'DEPOSIT', due_date: day(2), fixed_amount_requested_money: { amount: 6350, currency: 'USD' } },
    { request_type: 'BALANCE', due_date: sent.details.date, tipping_enabled: false },
  ], 'deposit due in 2 days, balance due on the day');
  eq(inv.accepted_payment_methods.card, true, 'card accepted');
  for (const bit of ['Pay the 50% deposit ($63.50) by', 'The balance ($63.50) is due at pickup', 'at 2:00 PM', 'Pickup in North Charlotte', 'Phone: (980) 555-1234', 'Occasion: Birthday', 'Colours, theme & notes: Pink & gold', 'Lettering: Happy 30th'])
    ok(inv.description.includes(bit), 'description has: ' + bit);

  eq(post('/v2/invoices/INV1/publish').version, 0, 'published (this is what emails it)');
  eq([data.invoiceUrl, data.deposit, data.balance, data.depositDue], [INVOICE_URL, 63.5, 63.5, day(2)], 'reply');
});

await test('one request uses one set of idempotency keys (a retry can never make two invoices)', async () => {
  await call(order());
  const keys = calls.filter(c => c.body.idempotency_key).map(c => c.body.idempotency_key);
  eq(keys.length, 4, 'customer, order, invoice, publish');
  const id = keys[0].slice(2);
  ok(/^[0-9a-f-]{36}$/.test(id) && keys.every((k, i) => k === ['c-', 'o-', 'i-', 'p-'][i] + id), 'same request id');
  calls = []; await call(order());
  ok(calls.find(c => c.body.idempotency_key).body.idempotency_key !== keys[0], 'a new order gets new keys');
});

await test('returning customer (same email) is reused and left unchanged', async () => {
  freshSquare({ existing: { id: 'CUST7', given_name: 'Jaz', email_address: 'jasmine@example.com' } });
  eq((await call(order({}, {}, { name: 'Someone Else' }))).status, 200, 'status');
  eq(calls.map(c => c.method + ' ' + c.path).filter(p => /customers/.test(p)), ['POST /v2/customers/search'], 'no new or changed customer');
  eq(post('/v2/invoices').invoice.primary_recipient.customer_id, 'CUST7', 'invoice to that customer');
});

await test('delivery: address on the customer and the invoice, delivery fee as its own line', async () => {
  const r = await call(order({}, { method: 'Delivery', distance: 'mid' }));
  eq([r.status, r.data.deposit], [200, 68.5], 'deposit includes half the $10 fee');
  eq(post('/v2/customers').address, { address_line_1: '123 Sugar Ln', address_line_2: 'Apt 4', locality: 'Charlotte', administrative_district_level_1: 'NC', postal_code: '28262', country: 'US' }, 'address');
  const items = post('/v2/orders').order.line_items;
  eq([items.at(-1).name, items.at(-1).base_price_money.amount], ['Delivery (10–15 miles)', 1000], 'delivery line');
  eq(items.reduce((t, l) => t + l.base_price_money.amount * Number(l.quantity), 0), 13700, 'lines add up to the order total');
  const d = post('/v2/invoices').invoice.description;
  ok(d.includes('Deliver to: 123 Sugar Ln, Apt 4, Charlotte, NC 28262') && d.includes('due at delivery'), 'address in the invoice');
});

await test('delivery within 10 miles under $100: no fee now, B. quotes it', async () => {
  const r = await call(order({ lines: [LINES[1]] }, { method: 'Delivery', distance: 'near' }));
  eq([r.status, r.data.deposit], [200, 22.5], 'no fee now');
  eq(post('/v2/orders').order.line_items.length, 1, 'no delivery line');
  ok(post('/v2/invoices').invoice.description.includes('quoted by B.'), 'quoted fee explained');
});

await test('contact details are checked before anything reaches Square', async () => {
  const cases = [
    [{ name: ' ' }, 'name'], [{ email: 'not-an-email' }, 'email'], [{ email: 'a@b' }, 'email'], [{ email: 'a b@c.com' }, 'email'],
    [{ email: 'jas@gmail.coom' }, 'email'], [{ email: 'jas@gmail.con' }, 'email'],
    [{ phone: '555-1234' }, 'phone'], [{ phone: '(123) 555-1234' }, 'phone'], [{ phone: '' }, 'phone'],
  ];
  for (const [bad, field] of cases) {
    const { status, data } = await call(order({}, {}, bad));
    eq([status, data.field], [400, field], JSON.stringify(bad));
  }
  for (const [bad, field] of [[{ line1: '' }, 'line1'], [{ city: '' }, 'city'], [{ state: 'North Carolina' }, 'state'], [{ zip: '2826' }, 'zip']]) {
    const { status, data } = await call(order({}, { method: 'Delivery', distance: 'mid' }, { address: { ...ADDRESS, ...bad } }));
    eq([status, data.field], [400, field], JSON.stringify(bad));
  }
  eq((await call(order({ contact: undefined }))).status, 400, 'no contact at all');
  eq(calls.length, 0, 'no Square calls');
  eq((await call(order({}, {}, { phone: '+1 980.555.1234' }))).status, 200, '+1 and dots are fine');
});

await test('pickup orders ignore any address sent', async () => {
  await call(order({}, {}, { address: ADDRESS }));
  eq(post('/v2/customers').address, undefined, 'no address stored for pickup');
});

await test('free text is cleaned: control characters removed, lengths capped', async () => {
  await call(order({}, { notes: 'hi\u0000\u0007 there\nline two' + 'x'.repeat(2000), lettering: 'y'.repeat(500) }, { name: 'Jas\u0000mine   Doe\n' + 'z'.repeat(300) }));
  const d = post('/v2/invoices').invoice.description, c = post('/v2/customers');
  ok(!/[\u0000-\u0008]/.test(d) && d.includes('hi there\nline two'), 'notes cleaned, newlines kept');
  ok(!d.includes('y'.repeat(121)), 'lettering capped at 120');
  ok(c.given_name === 'Jasmine Doe' && /^z+$/.test(c.family_name), 'name cleaned');
  ok((c.given_name + ' ' + (c.family_name || '')).length <= 101, 'name capped');
});

await test('prices sent by the browser are ignored', async () => {
  const lines = [{ ...LINES[0], unit: 0.01, price: 0.01 }, LINES[1]];
  eq((await call({ ...order({ lines }), total: 1 })).status, 200, 'status');
  eq(post('/v2/orders').order.line_items[0].base_price_money.amount, 4100, 'price from the menu');
});

await test('a deposit that differs from the menu is refused (old cached page)', async () => {
  const { status, data } = await call(order({ expected: 10 }));
  eq([status, data.code, calls.length], [409, 'changed', 0], 'refused');
});

await test('unknown treat or bad choice is refused', async () => {
  for (const lines of [[{ pid: 'caviar', size: 0, qty: 1 }], [{ pid: 'straw', size: 9, choc: 0, qty: 1 }], [{ pid: 'straw', size: 0, choc: 99, qty: 1 }]])
    eq((await call({ ...order(), lines, expected: 0 })).status, 400, 'status for ' + JSON.stringify(lines));
  eq(calls.length, 0, 'Square calls');
});

await test('empty or oversized sheets are refused', async () => {
  eq((await call(order({ lines: [] }))).status, 400, 'empty');
  eq((await call(order({ lines: Array(31).fill(LINES[1]) }))).status, 400, '31 lines');
  eq((await call('x'.repeat(20001))).status, 413, 'huge body');
  eq(calls.length, 0, 'Square calls');
});

await test('more than 6 of one kind of candy apple is refused', async () => {
  const apple = { pid: 'apple', size: 0, flavor: 0, qty: 4 };
  eq((await call(order({ lines: [apple, { ...apple, flavor: 1 }] }))).status, 400, '8 classic apples');
  eq((await call(order({ lines: [apple, { ...apple, size: 1, flavor: 1 }] }))).status, 200, '4 classic + 4 sour');
});

await test('rush dates (within 48 hours) cannot be ordered online', async () => {
  for (const n of [1, 2]) {
    const { status, data } = await call(order({}, { date: day(n) }));
    eq([status, data.code], [409, 'rush'], `day +${n}`);
  }
  eq((await call(order({}, { date: day(3) }))).status, 200, 'day +3 is fine');
  eq(post('/v2/invoices').invoice.payment_requests.map(p => p.due_date), [day(2), day(3)], 'deposit still due before the day');
});

await test('today, past, nonsense and far-future dates are refused', async () => {
  for (const date of [day(0), day(-3), '2026-02-31x', '', day(400)]) eq((await call(order({}, { date }))).status, 400, 'date ' + date);
  eq(calls.length, 0, 'Square calls');
});

await test('deposit terms must be agreed', async () => {
  eq((await call(order({ agree: false }))).status, 400, 'agree false');
  eq((await call(order({ agree: 'yes' }))).status, 400, 'agree "yes"');
  eq(calls.length, 0, 'Square calls');
});

await test('only B.\'s sites may send orders', async () => {
  for (const origin of ['https://evil.example', '', 'http://luxurybitesbyb.co', 'https://luxurybitesbyb.co.evil.example'])
    eq((await call(order(), { origin })).status, 403, 'origin ' + origin);
  for (const origin of ['https://www.luxurybitesbyb.co', 'https://deploy-preview-3--luxurybitesbyb.netlify.app', 'http://127.0.0.1:8765'])
    eq((await call(order(), { origin })).status, 200, 'origin ' + origin);
});

await test('production: real Square API, and localhost is not allowed', async () => {
  ENV.SQUARE_ENV = 'production';
  eq((await call(order(), { origin: 'http://127.0.0.1:8765' })).status, 403, 'localhost in production');
  freshSquare({ publicUrl: 'https://squareup.com/pay-invoice/inv:0-xyz' });
  const r = await call(order());
  eq([r.status, r.data.invoiceUrl], [200, 'https://squareup.com/pay-invoice/inv:0-xyz'], 'production call');
  ok(calls.every(c => c.host === 'connect.squareup.com'), 'production API');
});

await test('missing or unknown settings switch online ordering off', async () => {
  for (const change of [{ SQUARE_ENV: '' }, { SQUARE_ENV: 'live' }, { SQUARE_ACCESS_TOKEN: '' }, { SQUARE_LOCATION_ID: '' }]) {
    ENV = { ...SANDBOX, ...change };
    const { status, data } = await call(order());
    eq([status, data.code], [503, 'unavailable'], JSON.stringify(change));
  }
  eq(calls.length, 0, 'Square calls');
});

await test('wrong method, content type or JSON is refused', async () => {
  eq((await call(order(), { method: 'GET' })).status, 405, 'GET');
  eq((await call(order(), { type: 'text/plain' })).status, 415, 'text/plain');
  eq((await call('{not json')).status, 400, 'bad JSON');
});

await test('Square server error is retried once with the same idempotency key', async () => {
  fails = [null, null, null, json({ errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }, 500)]; // the invoice call fails once
  eq((await call(order())).status, 200, 'status');
  const inv = calls.filter(c => c.path === '/v2/invoices');
  eq(inv.length, 2, 'invoice call made twice');
  eq(inv[0].body.idempotency_key, inv[1].body.idempotency_key, 'same key');
});

await test('Square refusing or failing gives a friendly 502 (and B.\'s order form as a fallback), token never leaked', async () => {
  fails = [json({ errors: [{ code: 'UNAUTHORIZED', detail: 'nope' }] }, 401)];
  let r = await call(order());
  eq([r.status, r.data.code, calls.length], [502, 'square', 1], '401 not retried');
  ok(!JSON.stringify(r.data).includes('test-token'), 'no token in reply');
  calls = []; fails = [null, null, new TypeError('network'), new TypeError('network')];
  r = await call(order());
  eq([r.status, calls.length], [502, 4], 'network twice on the order call');
  eq(calls.filter(c => c.path === '/v2/invoices').length, 0, 'no invoice made');
});

await test('an invoice link that is not on Square is never passed on (the email still has one)', async () => {
  for (const url of ['https://evil.example/pay', 'http://squareup.com/pay-invoice/x', 'javascript:alert(1)', 'https://squareup.com.evil.example/x', null]) {
    freshSquare({ publicUrl: url });
    const r = await call(order());
    eq([r.status, r.data.invoiceUrl], [200, null], String(url));
  }
});

await test('order numbers are random', async () => {
  const a = await call(order()), b = await call(order());
  ok(a.data.order !== b.data.order, 'two orders, two numbers');
});

await test('logs never contain the customer\'s name, email, phone, address, notes or the token', () => {
  const text = logs.join('\n').toLowerCase();
  for (const s of ['jasmine', 'doe', 'example.com', '555-1234', '5551234', 'sugar ln', 'happy 30th', 'pink & gold', 'test-token']) ok(!text.includes(s), `log leaked "${s}"`);
});

await test('function is served at /api/order with a tight rate limit', () => {
  eq(config.path, '/api/order', 'path');
  ok(config.rateLimit && config.rateLimit.windowLimit > 0 && config.rateLimit.windowLimit <= 5, 'rate limit set');
});

await test('old /api/checkout (pages opened before V7) says to refresh, and never calls Square', async () => {
  const old = await import('../netlify/functions/checkout.mjs');
  eq(old.config.path, '/api/checkout', 'path');
  const res = await old.default(req(order()));
  const data = await res.json();
  eq([res.status, data.code], [409, 'changed'], 'status');
  ok(/refresh the page/.test(data.error), 'tells them to refresh');
  eq(calls.length, 0, 'no Square calls');
});

await test('Square\'s rules for invoices are followed (tipping only on the last part; deposit + balance)', async () => {
  await call(order());
  const [dep, bal] = post('/v2/invoices').invoice.payment_requests;
  ok(!('tipping_enabled' in dep) && !('percentage_requested' in dep), 'deposit: fixed amount only, no tipping setting');
  ok(!('fixed_amount_requested_money' in bal) && bal.tipping_enabled === false, 'balance: no amount, tipping off');
});

await test('Square refusing the email or phone tells the customer which one to check', async () => {
  square['POST /v2/customers'] = json({ errors: [{ code: 'INVALID_EMAIL_ADDRESS', category: 'INVALID_REQUEST_ERROR' }] }, 400);
  let r = await call(order());
  eq([r.status, r.data.field], [400, 'email'], 'email');
  square['POST /v2/customers'] = json({ errors: [{ code: 'INVALID_PHONE_NUMBER', category: 'INVALID_REQUEST_ERROR' }] }, 400);
  r = await call(order());
  eq([r.status, r.data.field], [400, 'phone'], 'phone');
});

const failed = results.filter(r => r[0] !== 'ok');
document.getElementById('out').textContent = results.map(r => r.join('  ')).join('\n') + `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAIL' : 'PASS';
