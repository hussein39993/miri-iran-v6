'use strict';
// Supplier adapter interface for Miri Iran V6 mobile recharge. READ-ONLY stage: catalog retrieval only.
// There is deliberately NO method for recharge, payment, wallet deduction or transaction confirmation.
class RechargeError extends Error {
  // code: NOT_INTEGRATED | SUPPLIER_UNAVAILABLE | SUPPLIER_ERROR | BAD_SUPPLIER_DATA
  constructor(code, message) { super(message || code); this.code = code; }
}
class BaseSupplierAdapter {
  constructor() { if (new.target === BaseSupplierAdapter) throw new Error('BaseSupplierAdapter is abstract'); }
  get id() { throw new Error('adapter must define id'); }
  get country() { throw new Error('adapter must define country (IR | IQ)'); }
  get operators() { throw new Error('adapter must define operators[]'); }
  isConfigured() { return false; }
  // Must resolve to: { operatorAvailable: boolean,
  //   denominations: [{ amount:int>0, price?:number>=0 }], custom?: { min:int, max:int, step?:int } | null,
  //   packages?: [{ id:string, title:string, price?:number, validity?:string }], fees?: { amount:number } | null }
  // Amounts/prices are in the country's currency (IR = toman 'IRT', IQ = dinar 'IQD'). Never invent values.
  async getCatalog(/* { operator } */) { throw new RechargeError('NOT_INTEGRATED', 'getCatalog not implemented'); }
}
const CURRENCY = { IR: 'IRT', IQ: 'IQD' };
const isInt = v => Number.isSafeInteger(v) && v > 0;
const isPrice = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
// Defensive validation of whatever an adapter returns, before it is sent to the browser.
function validateCatalog(c) {
  const bad = () => { throw new RechargeError('BAD_SUPPLIER_DATA'); };
  if (!c || typeof c !== 'object' || typeof c.operatorAvailable !== 'boolean') bad();
  const out = { operatorAvailable: c.operatorAvailable, denominations: [], custom: null, packages: [], fees: null };
  if (!c.operatorAvailable) return out;
  if (!Array.isArray(c.denominations)) bad();
  for (const d of c.denominations) {
    if (!d || !isInt(d.amount) || (d.price != null && !isPrice(d.price))) bad();
    out.denominations.push({ amount: d.amount, price: d.price == null ? null : d.price });
  }
  if (c.custom != null) {
    const u = c.custom;
    if (!isInt(u.min) || !isInt(u.max) || u.min > u.max || (u.step != null && !isInt(u.step))) bad();
    out.custom = { min: u.min, max: u.max, step: u.step == null ? null : u.step };
  }
  if (c.packages != null) {
    if (!Array.isArray(c.packages)) bad();
    for (const p of c.packages) {
      if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || !p.title || p.title.length > 100 || (p.price != null && !isPrice(p.price)) || (p.validity != null && (typeof p.validity !== 'string' || p.validity.length > 40))) bad();
      out.packages.push({ id: p.id, title: p.title, price: p.price == null ? null : p.price, validity: p.validity || null });
    }
  }
  if (c.fees != null) { if (!isPrice(c.fees.amount)) bad(); out.fees = { amount: c.fees.amount }; }
  return out;
}
module.exports = { BaseSupplierAdapter, RechargeError, validateCatalog, CURRENCY };
