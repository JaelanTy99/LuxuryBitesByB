/* Tests for the checkout function. No real Square calls: fetch is replaced with a stub that
   records each request and plays back canned replies. */
import handler, { config } from '../netlify/functions/checkout.mjs';

const M = globalThis.LuxuryMenu;
let ENV = {};
globalThis.Netlify = { env: { get: k => ENV[k] } };
let calls = [], replies = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  const r = replies.length ? replies.shift() : squareOk();
  if (r instanceof Error) throw r;
  return r;
};

const SANDBOX = { SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'test-token', SQUARE_LOCATION_ID: 'LOC123' };
const ORIGIN = 'https://luxurybitesbyb.co';
const squareOk = (url = 'https://sandbox.square.link/u/abc123') =>
  new Response(JSON.stringify({ payment_link: { id: 'PL1', url, order_id: 'O1' } }), { status: 200 });
const squareErr = status => new Response(JSON.stringify({ errors: [{ code: 'TEST', detail: 'nope' }] }), { status });

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
function order(over = {}, details = {}) {
  const d = { date: day(7), time: '14:00', method: 'Pickup', distance: 'near', occasion: 'Birthday', notes: 'Pink & gold', lettering: 'Happy 30th', ...details };
  const lines = over.lines || LINES;
  const T = M.quote(lines.map(M.cleanLine), d, today());
  return { lines, details: d, agree: true, expected: T.dep, ...over };
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

const results = [];
async function test(name, fn) {
  ENV = { ...SANDBOX }; calls = []; replies = [];
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, what) { if (!v) throw new Error(what); }

await test('menu maths: 2 × $41 strawberries + $45 cake pops = $127, deposit $63.50', () => {
  const T = M.quote(LINES.map(M.cleanLine), { date: day(7), method: 'Pickup' }, today());
  eq([T.sub, T.total, T.dep, T.bal], [127, 127, 63.5, 63.5], 'totals');
});

await test('valid pickup order creates one sandbox payment link for the deposit', async () => {
  const { status, data } = await call(order());
  eq(status, 200, 'status');
  eq(calls.length, 1, 'Square calls');
  const c = calls[0], b = c.body;
  eq(c.url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links', 'endpoint');
  eq(c.init.headers.Authorization, 'Bearer test-token', 'auth header');
  ok(c.init.headers['Square-Version'], 'Square-Version header');
  ok(/^[0-9a-f-]{36}$/.test(b.idempotency_key), 'idempotency key is a UUID');
  eq(b.order.location_id, 'LOC123', 'location');
  eq(b.order.line_items[0].base_price_money, { amount: 6350, currency: 'USD' }, 'deposit amount');
  ok(/^LB-[A-Z2-9]{6}$/.test(data.order), 'order number format');
  eq(b.order.reference_id, data.order, 'reference id = order number');
  eq(b.checkout_options.redirect_url, `${ORIGIN}/?order=${data.order}`, 'redirect url');
  eq(b.checkout_options.ask_for_shipping_address, false, 'no address for pickup');
  eq(b.checkout_options.custom_fields, [{ title: 'Name for the order' }], 'pickup asks for a name on Square');
  eq(b.checkout_options.allow_tipping, false, 'no tipping');
  eq([data.url, data.deposit, data.balance], ['https://sandbox.square.link/u/abc123', 63.5, 63.5], 'reply');
  const note = b.order.line_items[0].note;
  ok(note.includes('2 × Chocolate-Covered Strawberries') && note.includes('Lettering: Happy 30th') && note.includes('Deposit paid $63.50'), 'order details in the note');
  ok(b.payment_note.length <= 500 && note.length <= 2000, 'note lengths within Square limits');
});

await test('prices sent by the browser are ignored', async () => {
  const lines = [{ ...LINES[0], unit: 0.01, price: 0.01 }, LINES[1]];
  const { status } = await call({ ...order({ lines }), total: 1 });
  eq(status, 200, 'status');
  eq(calls[0].body.order.line_items[0].base_price_money.amount, 6350, 'amount from the menu');
});

await test('a deposit that differs from the menu is refused (old cached page)', async () => {
  const { status, data } = await call(order({ expected: 10 }));
  eq([status, data.code, calls.length], [409, 'changed', 0], 'refused');
});

await test('unknown treat or bad choice is refused', async () => {
  for (const lines of [[{ pid: 'caviar', size: 0, qty: 1 }], [{ pid: 'straw', size: 9, choc: 0, qty: 1 }], [{ pid: 'straw', size: 0, choc: 99, qty: 1 }]]) {
    const { status } = await call({ ...order(), lines, expected: 0 });
    eq(status, 400, 'status for ' + JSON.stringify(lines));
  }
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

await test('rush dates (within 48 hours) cannot be paid online', async () => {
  for (const n of [1, 2]) {
    const { status, data } = await call(order({}, { date: day(n) }));
    eq([status, data.code], [409, 'rush'], `day +${n}`);
  }
  eq((await call(order({}, { date: day(3) }))).status, 200, 'day +3 is fine');
});

await test('today, past, nonsense and far-future dates are refused', async () => {
  for (const date of [day(0), day(-3), '2026-02-31x', '', day(400)]) eq((await call(order({}, { date }))).status, 400, 'date ' + date);
  eq(calls.length, 0, 'Square calls');
});

await test('deposit terms must be agreed', async () => {
  eq((await call(order({ agree: false }))).status, 400, 'agree false');
  eq((await call(order({ agree: 'yes' }))).status, 400, 'agree "yes"');
});

await test('delivery: quoted fee within 10 miles under $100, $10 for 10–15 miles, address asked on Square', async () => {
  const small = [LINES[1]];
  let r = await call(order({ lines: small }, { method: 'Delivery', distance: 'near' }));
  eq([r.status, r.data.deposit], [200, 22.5], 'near under $100: no fee now');
  eq(calls[0].body.checkout_options.ask_for_shipping_address, true, 'asks for address');
  eq(calls[0].body.checkout_options.custom_fields, undefined, 'name comes with the address');
  ok(calls[0].body.order.line_items[0].note.includes('quoted by B.'), 'quoted fee noted for B.');
  r = await call(order({ lines: small }, { method: 'Delivery', distance: 'mid' }));
  eq(r.data.deposit, 27.5, '10–15 miles adds $10');
  eq((await call(order({}, { method: 'Delivery', distance: 'moon' }))).status, 400, 'unknown distance');
});

await test('only B.\'s sites may ask for a link', async () => {
  for (const origin of ['https://evil.example', '', 'http://luxurybitesbyb.co', 'https://luxurybitesbyb.co.evil.example'])
    eq((await call(order(), { origin })).status, 403, 'origin ' + origin);
  for (const origin of ['https://www.luxurybitesbyb.co', 'https://deploy-preview-3--luxurybitesbyb.netlify.app', 'http://127.0.0.1:8765'])
    eq((await call(order(), { origin })).status, 200, 'origin ' + origin);
});

await test('production: real Square API, and localhost is not allowed', async () => {
  ENV.SQUARE_ENV = 'production';
  eq((await call(order(), { origin: 'http://127.0.0.1:8765' })).status, 403, 'localhost in production');
  replies = [squareOk('https://square.link/u/xyz')];
  eq((await call(order())).status, 200, 'production call');
  eq(calls[0].url, 'https://connect.squareup.com/v2/online-checkout/payment-links', 'production endpoint');
});

await test('missing or unknown settings switch online payment off', async () => {
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
  replies = [squareErr(500), squareOk()];
  eq((await call(order())).status, 200, 'status');
  eq(calls.length, 2, 'two calls');
  eq(calls[0].body.idempotency_key, calls[1].body.idempotency_key, 'same key');
});

await test('Square refusing (4xx) or failing twice gives a friendly 502, token never leaked', async () => {
  replies = [squareErr(401)];
  let r = await call(order());
  eq([r.status, r.data.code, calls.length], [502, 'square', 1], '401 not retried');
  ok(!JSON.stringify(r.data).includes('test-token'), 'no token in reply');
  calls = []; replies = [new TypeError('network'), new TypeError('network')];
  r = await call(order());
  eq([r.status, calls.length], [502, 2], 'network twice');
});

await test('a payment link that is not on Square is never passed on', async () => {
  for (const url of ['https://evil.example/pay', 'http://square.link/u/x', 'javascript:alert(1)', 'https://square.link.evil.example/u/x']) {
    replies = [squareOk(url)];
    eq((await call(order())).status, 502, url);
  }
});

await test('customer notes: control characters removed, length capped', async () => {
  await call(order({}, { notes: 'hi\u0000\u0007 there\nline two' + 'x'.repeat(2000), lettering: 'y'.repeat(500) }));
  const note = calls[0].body.order.line_items[0].note;
  ok(!/[\u0000-\u0008]/.test(note), 'no control characters');
  ok(note.includes('hi there\nline two'), 'newlines kept');
  ok(!note.includes('y'.repeat(121)), 'lettering capped at 120');
});

await test('order numbers are random', async () => {
  const a = await call(order()), b = await call(order());
  ok(a.data.order !== b.data.order, 'two orders, two numbers');
});

await test('function is served at /api/checkout with a rate limit', () => {
  eq(config.path, '/api/checkout', 'path');
  ok(config.rateLimit && config.rateLimit.windowLimit > 0, 'rate limit set');
});

const failed = results.filter(r => r[0] !== 'ok');
document.getElementById('out').textContent = results.map(r => r.join('  ')).join('\n') + `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAIL' : 'PASS';
