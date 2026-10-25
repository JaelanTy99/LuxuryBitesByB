/* Luxury Bites by B. — the menu, prices and price rules, shared by the page (script.js) and the
   checkout function (netlify/functions/checkout.mjs), so the deposit charged on Square is always
   worked out from these exact numbers, never from prices sent by the browser.
   The menu comes from B.'s Google order form: each form value must match the form's wording exactly.
   It's a plain script (no import/export) so the page still works opened straight from a file;
   everything is published on globalThis.LuxuryMenu. */

globalThis.LuxuryMenu = (() => {
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
    { id: 'pretzels', cat: 'dipped', group: 'treats', rn: 'vi.', tone: 'pretz', photo: 'rods', name: 'Chocolate-Covered Pretzels',
      blurb: 'Salty-sweet pretzel rods or twists, dipped in chocolate and drizzled.', note: 'Rods or twists, by the dozen',
      sizes: [['Pretzel rods (dozen)', 25, 'a dozen pretzel rods', 750810788], ['Pretzel twists (dozen)', 25, 'a dozen pretzel twists', 1763409808]],
      choc: CHOC, color: true, touches: true },
    { id: 'apple', cat: 'apples', group: 'apples', rn: 'vii.', tone: 'apple', name: 'Candy Apples', each: true, max: 6,
      blurb: 'Crisp apples in a glassy candy shell, in ten flavours. Go classic, super sour, or Candy Land, rolled in candy.', note: 'Classic, super sour or Candy Land',
      sizes: [['Classic', 6, 'a classic candy apple', 564027356, 1205309175], ['Super sour', 7, 'a super sour candy apple', 78937848, 695681141],
        ['Candy Land', 8, 'a Candy Land candy apple', 344789356, 765128514]],
      flavors: APPLE_FLAVORS, toppingSize: 2 },
  ];

  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const round2 = n => Math.round(n * 100) / 100;
  const cap = s => s[0].toUpperCase() + s.slice(1);

  /* ---------- prices ---------- */
  function unitOf(p, b) {
    let n = p.sizes[b.size][1];
    if (p.choc) n += p.choc[b.choc][2] || 0;
    if (p.touches) n += TOUCHES.filter(t => b.touches.includes(t.id)).reduce((s, t) => s + t.price, 0);
    if (p.glitter) n += b.glitter * GLITTER.price;
    return n;
  }

  // An order line from outside (the browser's saved sheet, or a checkout request) is untrusted:
  // only known menu choices survive, numbers are forced to whole numbers in range, and the price
  // is recalculated from the menu. Returns null if the line can't be read.
  function cleanLine(l) {
    const p = l && byId[l.pid];
    if (!p) return null;
    const idx = (v, list) => Number.isInteger(v) && v >= 0 && v < list.length ? v : null;
    const size = idx(l.size, p.sizes); if (size == null) return null;
    const line = {
      key: Number.isInteger(l.key) ? l.key : 0, pid: p.id, size,
      choc: p.choc ? idx(l.choc, p.choc) : null,
      flavor: p.flavors ? idx(l.flavor, p.flavors) : null,
      topping: p.toppingSize != null && size === p.toppingSize ? idx(l.topping, TOPPINGS) : null,
      color: p.color ? idx(l.color, COLORS) : null,
      glitter: p.glitter ? Math.min(12, Math.max(0, parseInt(l.glitter, 10) || 0)) : 0,
      touches: p.touches && Array.isArray(l.touches) ? l.touches.filter(id => TOUCHES.some(t => t.id === id)).sort() : [],
      qty: Math.min(p.max || 20, Math.max(1, parseInt(l.qty, 10) || 1)),
    };
    if ((p.choc && line.choc == null) || (p.flavors && line.flavor == null)) return null;
    line.touchKey = line.touches.join(',');
    line.unit = unitOf(p, { size, choc: line.choc ?? 0, touches: line.touches, glitter: line.glitter });
    return line;
  }

  // Whole days from `today` (a Date at local midnight) to a YYYY-MM-DD date.
  function daysUntil(d, today) {
    if (!d) return null;
    const [y, m, day] = d.split('-').map(Number);
    return Math.round((new Date(y, m - 1, day) - today) / 864e5);
  }
  const isRush = days => days != null && days >= 1 && days <= 2;

  // Totals for an order. Rush orders (within 48 hours) can't be paid online, so the checkout
  // function refuses them; the rush fee is only shown on the page.
  // delExtra: 'quoted' = B. quotes the fee, added at delivery; 'more' = $15 now, any extra added at delivery.
  function quote(lines, { date, method, distance }, today) {
    const sub = lines.reduce((t, l) => t + l.unit * l.qty, 0);
    const days = daysUntil(date, today);
    const rush = sub && isRush(days) ? RUSH_FEE : 0;
    let del = 0, delLabel = '', delExtra = '';
    if (sub && method === 'Delivery') {
      if (distance === 'near') { if (sub >= FREE_DELIVERY_MIN) delLabel = 'Free'; else { delLabel = 'Quoted at delivery'; delExtra = 'quoted'; } }
      else if (distance === 'mid') del = 10;
      else if (distance === 'far') { del = 15; delLabel = '$15+'; delExtra = 'more'; }
      else del = 50;
      delLabel = delLabel || money(del);
    }
    const total = sub + rush + del, dep = round2(total / 2);
    return { sub, rush, del, delLabel, delExtra, total, dep, bal: round2(total - dep), days };
  }

  /* ---------- describing an order ---------- */
  function niceDate(d) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function niceTime(t) {
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
  function lineText(l) { return `${l.qty} × ${byId[l.pid].name} (${desc(l)}): ${money(l.unit * l.qty)}`; }

  return {
    RUSH_FEE, FREE_DELIVERY_MIN, GLITTER, CHOC, BERRY_CHOC, APPLE_FLAVORS, TOPPINGS, COLORS, TOUCHES, OCCASIONS, DISTANCES, PRODUCTS,
    byId, money, round2, cap, unitOf, cleanLine, daysUntil, isRush, quote, niceDate, niceTime, desc, lineText,
  };
})();
