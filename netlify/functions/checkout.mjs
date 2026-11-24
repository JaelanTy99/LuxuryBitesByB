/* Luxury Bites by B. — the old pay-first checkout address (V5/V6, replaced by /api/order in V7).
   Order pages opened before V7 went live still call it; this tells them to refresh so they get the
   new order sheet, instead of a vague error. It never calls Square and reads nothing it's sent. */

export const config = { path: '/api/checkout' };

export default async function handler() {
  return new Response(JSON.stringify({
    code: 'changed',
    error: 'This page has been updated. Please refresh the page (reload or pull down), then send your order again.',
  }), { status: 409, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
