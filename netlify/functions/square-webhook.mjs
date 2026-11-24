/* Luxury Bites by B. — sends the customer an invoice for the balance as soon as a website deposit is
   paid, so B. doesn't have to write one by hand, and the invoice (with who paid) shows up in Square.

   Square calls this address (a "webhook") whenever a payment is created or updated. For each call it:
     1. checks Square's signature (unsigned or wrongly signed calls are refused), then re-reads the
        payment and its order from Square, so nothing in the notification itself is trusted;
     2. ignores anything that isn't a fresh, completed deposit from this website's checkout
        (B.'s in-person sales, other locations, refunded or old payments);
     3. finds who paid (their Square customer profile, or the email and name typed on Square's page)
        and makes sure they're in B.'s Square customers with their name;
     4. creates an order with every treat, takes off the deposit already paid, and sends a Square
        invoice for the balance, due on the pickup or delivery date.
   Every Square call that creates something uses an idempotency key made from the payment ID, so when
   Square repeats a notification (it does) the same customer, order and invoice come back, never new ones.
   Nothing personal is written to the logs.

   Environment variables (Netlify → Project configuration → Environment variables, never in the repo):
     SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENV  the same ones the checkout uses
     SQUARE_WEBHOOK_SIGNATURE_KEY  "Signature key" of the webhook subscription (Square Developer Dashboard)
     SQUARE_WEBHOOK_URL            the exact notification URL entered in that subscription */

import '../../public/menu.js';
import { readMeta } from '../lib/order-meta.mjs';

const { byId, desc, money, niceDate, niceTime, quote, DISTANCES } = globalThis.LuxuryMenu;

const SQUARE_VERSION = '2026-09-16';
const SQUARE_API = { sandbox: 'https://connect.squareupsandbox.com', production: 'https://connect.squareup.com' };
const ORDER_NO = /^LB-[A-Z2-9]{6}$/;
const NAME_FIELD = 'Name for the order'; // the pickup question asked on Square's page (checkout.mjs)
const MAX_BODY = 200000, MAX_AGE_DAYS = 3;

export const config = { path: '/api/square-webhook' };

const env = name => globalThis.Netlify?.env.get(name) || '';
const plain = (status, text) => new Response(text, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const cents = amount => ({ amount, currency: 'USD' });

// Today's date in Charlotte as YYYY-MM-DD.
function charlotteISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Square signs base64(HMAC-SHA256(signature key, notification URL + raw body)).
async function signatureOk(key, payload, header) {
  if (!header) return false;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// Small Square client: one retry (same request, same idempotency key) on a network drop or 5xx.
// Errors carry only the HTTP status and Square's error codes, never request contents.
function squareClient(mode, token) {
  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      let res = null;
      try {
        res = await fetch(SQUARE_API[mode] + path, {
          method, signal: AbortSignal.timeout(6000),
          headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' },
          ...(body && { body: JSON.stringify(body) }),
        });
      } catch (_) {
        if (attempt) throw new Error(`Square ${method} ${path.split('/')[2]}: unreachable`);
      }
      if (res && (res.status < 500 || attempt)) {
        const data = await res.json().catch(() => ({}));
        if (res.ok) return data;
        throw new Error(`Square ${method} ${path.split('/')[2]}: ${res.status} ${(data.errors || []).map(e => e.code).join(',')}`);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return { get: p => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b) };
}

export default async function handler(req) {
  if (req.method !== 'POST') return plain(405, 'Use POST.');
  const mode = env('SQUARE_ENV'), token = env('SQUARE_ACCESS_TOKEN'), location = env('SQUARE_LOCATION_ID');
  const key = env('SQUARE_WEBHOOK_SIGNATURE_KEY'), hookUrl = env('SQUARE_WEBHOOK_URL');
  if (!SQUARE_API[mode] || !token || !location || !key || !hookUrl) return plain(503, 'Not set up.');

  const raw = await req.text();
  if (raw.length > MAX_BODY) return plain(413, 'Too large.');
  if (!(await signatureOk(key, hookUrl + raw, req.headers.get('x-square-hmacsha256-signature') || ''))) return plain(401, 'Bad signature.');

  let event = null;
  try { event = JSON.parse(raw); } catch (_) { /* ignored below */ }
  if (!event || !['payment.created', 'payment.updated'].includes(event.type)) return plain(200, 'Ignored.');
  const id = event.data?.id ?? event.data?.object?.payment?.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(id)) return plain(200, 'Ignored.');
  // Most notifications are for payments that aren't finished yet; skip those without calling Square.
  const status = event.data?.object?.payment?.status;
  if (status && status !== 'COMPLETED') return plain(200, 'Ignored.');

  try {
    console.log(await invoiceDeposit(id, { sq: squareClient(mode, token), location }));
    return plain(200, 'OK');
  } catch (e) {
    console.error('Invoice step failed:', e.message);
    return plain(500, 'Try again later.'); // Square retries; the idempotency keys stop duplicates
  }
}

export async function invoiceDeposit(paymentId, { sq, location, now = new Date() }) {
  const { payment } = await sq.get(`/v2/payments/${paymentId}`);
  if (!payment || payment.status !== 'COMPLETED') return 'skipped: payment not completed';
  if (payment.location_id !== location) return 'skipped: other location';
  if (payment.refunded_money?.amount > 0) return 'skipped: refunded';
  // Square can send "updated" notices weeks later (for example after a refund): only fresh payments.
  if (now - new Date(payment.created_at) > MAX_AGE_DAYS * 864e5) return 'skipped: old payment';
  if (!payment.order_id) return 'skipped: no order';

  const { order } = await sq.get(`/v2/orders/${encodeURIComponent(payment.order_id)}`);
  const no = order?.reference_id || '';
  const depositLine = (order?.line_items || []).find(li => (li.name || '').startsWith('50% deposit · Luxury Bites order'));
  if (!ORDER_NO.test(no) || !depositLine) return 'skipped: not a website deposit';

  const info = readMeta(order.metadata) || fromNote(payment.note, no);
  if (!info) return `needs B.: ${no} paid but its details couldn't be read`;
  const paid = payment.amount_money?.amount || 0;

  const who = await whoPaid(payment, order, sq, paymentId);
  if (!who.id) return `needs B.: ${no} paid but Square has no email or name for the customer`;

  const { order: balance } = await sq.post('/v2/orders', {
    idempotency_key: `lb-order-${paymentId}`,
    order: { location_id: location, reference_id: no, customer_id: who.id, ...invoiceLines(info, paid, no) },
  });

  const today = charlotteISO(now), where = info.method === 'Pickup' ? 'pickup' : 'delivery';
  const fromCustomer = (depositLine.note || '').split('\n')
    .filter(l => /^(Occasion|Colours, theme & notes|Lettering|Delivery fee|Delivery is \$15):?/.test(l));
  const { invoice } = await sq.post('/v2/invoices', {
    idempotency_key: `lb-invoice-${paymentId}`,
    invoice: {
      location_id: location,
      order_id: balance.id,
      primary_recipient: { customer_id: who.id },
      payment_requests: [{ request_type: 'BALANCE', due_date: info.date < today ? today : info.date, tipping_enabled: false }],
      delivery_method: who.email ? 'EMAIL' : 'SHARE_MANUALLY',
      invoice_number: no,
      title: `Luxury Bites order ${no}`,
      description: [
        `Thank you for your order! Your 50% deposit of ${money(paid / 100)} was paid online.`,
        `The balance is due at ${where} on ${niceDate(info.date)}${info.time ? ' at ' + niceTime(info.time) : ''}.`,
        ...fromCustomer,
      ].join('\n').slice(0, 4000),
      sale_or_service_date: info.date,
      accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false, cash_app_pay: false },
    },
  });

  if (invoice.status === 'DRAFT') {
    try {
      await sq.post(`/v2/invoices/${invoice.id}/publish`, { version: invoice.version, idempotency_key: `lb-publish-${paymentId}` });
    } catch (e) {
      // A repeated notification may have published it a moment ago: that's fine.
      const again = await sq.get(`/v2/invoices/${invoice.id}`).catch(() => ({}));
      if (!again.invoice || again.invoice.status === 'DRAFT') throw e;
    }
  }
  return `invoiced ${no}`;
}

// Every treat at its menu price, the delivery fee, and the deposit taken off. If the menu has changed
// since checkout, or the details are missing, it's one "remaining balance" line instead, so the
// customer is never asked for a different amount than the checkout told them.
export function invoiceLines(info, paid, no) {
  if (info.lines) {
    const T = quote(info.lines, info, new Date(1970, 0, 1)); // a far-off "today": never a rush fee
    const items = info.lines.map(l => ({
      name: byId[l.pid].name, variation_name: desc(l).slice(0, 255),
      quantity: String(l.qty), base_price_money: cents(Math.round(l.unit * 100)),
    }));
    if (T.del) {
      const where = (DISTANCES.find(d => d[0] === info.distance) || [, ''])[1].toLowerCase();
      items.push({ name: `Delivery${where ? ` (${where})` : ''}`, quantity: '1', base_price_money: cents(Math.round(T.del * 100)) });
    }
    const total = Math.round(T.total * 100);
    if (total === info.total && total - paid === info.balance && paid > 0) {
      return {
        line_items: items,
        discounts: [{ uid: 'deposit', name: '50% deposit paid online', type: 'FIXED_AMOUNT', amount_money: cents(paid), scope: 'ORDER' }],
      };
    }
  }
  return { line_items: [{ name: `Remaining balance · Luxury Bites order ${no}`, quantity: '1', base_price_money: cents(info.balance) }] };
}

// Backup when the order metadata is missing: the checkout writes the date and balance into the
// payment note ("Order LB-… · deposit for … (YYYY-MM-DD) · balance $…").
export function fromNote(note, no) {
  if (typeof note !== 'string' || !note.startsWith(`Order ${no} `)) return null;
  const date = (note.match(/\((\d{4}-\d{2}-\d{2})\)/) || [])[1];
  const bal = (note.match(/· balance \$(\d{1,6}(?:\.\d{2})?)$/) || [])[1];
  if (!date || !bal) return null;
  return {
    date, time: '', method: / delivery \(\d{4}/.test(note) ? 'Delivery' : 'Pickup', distance: 'near', occasion: '',
    total: null, balance: Math.round(Number(bal) * 100), lines: null,
  };
}

// The answer to the "Name for the order" question, wherever Square keeps it on the order.
function nameAnswer(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return '';
  const entries = Object.entries(node);
  if (entries.some(([, v]) => v === NAME_FIELD)) {
    const hit = entries.find(([k, v]) => typeof v === 'string' && v !== NAME_FIELD && !/(^|_)(uid|id|type)$/i.test(k) && v.trim());
    if (hit) return hit[1];
  }
  for (const [, v] of entries) { const found = nameAnswer(v, depth + 1); if (found) return found; }
  return '';
}

const fullName = c => [c?.given_name, c?.family_name].filter(Boolean).join(' ');
function splitName(n) {
  const parts = clean(n, 200).split(' ').filter(Boolean);
  return parts.length > 1 ? [parts.slice(0, -1).join(' '), parts.at(-1)] : [parts[0] || '', ''];
}

// Who paid: their Square customer profile if Square linked one, otherwise an existing customer with
// the same email, otherwise a new customer. Fills in their name if the profile doesn't have one.
export async function whoPaid(payment, order, sq, paymentId) {
  const email = clean(payment.buyer_email_address, 254).toLowerCase();
  const ship = payment.shipping_address || {};
  const recipient = (order.fulfillments || [])
    .map(f => (f.shipment_details || f.delivery_details || f.pickup_details || {}).recipient?.display_name).find(Boolean);
  let [given, family] = [clean(ship.first_name, 100), clean(ship.last_name, 100)];
  if (!given && !family) [given, family] = splitName(nameAnswer(order) || recipient || payment.card_details?.card?.cardholder_name || '');
  const typed = [given, family].filter(Boolean).join(' ');

  let customer = null;
  if (payment.customer_id) customer = (await sq.get(`/v2/customers/${encodeURIComponent(payment.customer_id)}`).catch(() => ({}))).customer || null;
  if (!customer && email) {
    const found = await sq.post('/v2/customers/search', { query: { filter: { email_address: { exact: email } } }, limit: 1 });
    customer = (found.customers || [])[0] || null;
  }
  if (customer) {
    if (!fullName(customer) && typed) {
      const updated = await sq.put(`/v2/customers/${encodeURIComponent(customer.id)}`, {
        given_name: given || undefined, family_name: family || undefined, version: customer.version,
      }).catch(() => null); // a name is nice to have; the invoice still goes out without it
      if (updated?.customer) customer = updated.customer;
    }
    return { id: customer.id, email: customer.email_address || email, name: fullName(customer) || typed };
  }
  if (!email && !typed) return { id: null };
  const created = await sq.post('/v2/customers', {
    idempotency_key: `lb-customer-${paymentId}`,
    given_name: given || undefined, family_name: family || undefined, email_address: email || undefined,
    note: 'Added by the website checkout.',
  });
  return { id: created.customer.id, email, name: typed };
}
