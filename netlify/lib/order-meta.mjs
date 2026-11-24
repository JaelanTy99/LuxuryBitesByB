/* Packs a website order into Square order metadata at checkout, and unpacks it when the deposit is
   paid, so the invoice can list every treat. Square allows 10 metadata entries per order, keys up to
   60 characters and values up to 255, so lines are written compactly and split across entries.

     v  format version ("1")
     d  date|time|P or D|distance|occasion number
     t  order total in cents     b  balance in cents
     n  number of lines          l0, l1, …  the lines, "~"-separated

   A line is pid.size.choc.flavor.topping.color.glitter.qty.touches, where empty means "none" and
   touches are digits (positions in TOUCHES). Reading runs every line back through cleanLine, so the
   prices always come from the menu and anything odd is rejected. */

import '../../public/menu.js';

const { cleanLine, PRODUCTS, TOUCHES, OCCASIONS, DISTANCES } = globalThis.LuxuryMenu;
const MAX_VALUE = 255, MAX_LINE_ENTRIES = 5; // 5 fixed entries + up to 5 line entries = Square's limit of 10
const num = v => (v == null ? '' : String(v));
const int = s => (s === '' ? null : /^\d{1,3}$/.test(s) ? Number(s) : NaN);

export function writeMeta(order, T) {
  const lines = order.lines.map(l => [
    l.pid, l.size, num(l.choc), num(l.flavor), num(l.topping), num(l.color), l.glitter || 0, l.qty,
    (l.touches || []).map(id => TOUCHES.findIndex(t => t.id === id)).join(''),
  ].join('.'));
  const meta = {
    v: '1',
    d: [order.date, order.time, order.method === 'Delivery' ? 'D' : 'P', order.distance || 'near',
      order.occasion ? OCCASIONS.indexOf(order.occasion) : ''].join('|'),
    t: String(Math.round(T.total * 100)),
    b: String(Math.round(T.bal * 100)),
    n: String(lines.length),
  };
  // Split the lines over as few entries as possible. If they don't fit, leave them out: the
  // invoice then shows a single "remaining balance" line instead of each treat.
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? current + '~' + line : line;
    if (next.length <= MAX_VALUE) { current = next; continue; }
    chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  if (chunks.length <= MAX_LINE_ENTRIES && lines.every(l => l.length <= MAX_VALUE)) chunks.forEach((c, i) => { meta['l' + i] = c; });
  return meta;
}

// Returns { date, time, method, distance, occasion, total, balance, lines } or null. `lines` is null
// when they're missing or don't check out (the caller then invoices the balance as one line).
export function readMeta(meta) {
  if (!meta || meta.v !== '1' || typeof meta.d !== 'string') return null;
  const [date, time, m, distance, occ] = meta.d.split('|');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const total = /^\d{1,7}$/.test(meta.t || '') ? Number(meta.t) : null;
  const balance = /^\d{1,7}$/.test(meta.b || '') ? Number(meta.b) : null;
  if (total == null || balance == null || balance > total) return null;
  const out = {
    date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time : '',
    method: m === 'D' ? 'Delivery' : 'Pickup',
    distance: DISTANCES.some(d => d[0] === distance) ? distance : 'near',
    occasion: /^\d{1,2}$/.test(occ || '') ? OCCASIONS[Number(occ)] || '' : '',
    total, balance, lines: null,
  };

  const text = Object.keys(meta).filter(k => /^l\d$/.test(k)).sort().map(k => meta[k]).join('~');
  const count = /^\d{1,2}$/.test(meta.n || '') ? Number(meta.n) : -1;
  if (!text || count < 1) return out;
  const lines = text.split('~').map(raw => {
    const [pid, size, choc, flavor, topping, color, glitter, qty, touches = ''] = raw.split('.');
    if (!PRODUCTS.some(p => p.id === pid) || !/^\d*$/.test(touches)) return null;
    return cleanLine({
      pid, size: int(size), choc: int(choc), flavor: int(flavor), topping: int(topping), color: int(color),
      glitter: int(glitter), qty: int(qty),
      touches: [...touches].map(i => TOUCHES[Number(i)]?.id).filter(Boolean),
    });
  });
  if (lines.length === count && !lines.includes(null)) out.lines = lines;
  return out;
}
