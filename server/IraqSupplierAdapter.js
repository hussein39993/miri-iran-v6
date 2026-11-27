'use strict';
const { BaseSupplierAdapter, RechargeError } = require('./BaseAdapter');

// Iraqi (Asiacell, Zain Iraq, Korek) supplier adapter — SKELETON. No supplier is wired in: official provider documentation is required.
// Credentials are read ONLY from server environment variables (see .env.example). Never expose them to the browser.
class IraqSupplierAdapter extends BaseSupplierAdapter {
  get id() { return 'IraqSupplierAdapter'; }
  get country() { return 'IQ'; }
  get operators() { return ['asiacell', 'zain', 'korek']; }
  // INTEGRATION POINT 0 (needs provider docs): operator id -> supplier operator code. Left empty on purpose; do not guess.
  static get OPERATOR_CODES() { return {}; }
  isConfigured() { return Boolean(process.env.IQ_SUPPLIER_BASE_URL && process.env.IQ_SUPPLIER_API_KEY); }

  async getCatalog({ operator }) {
    if (!this.operators.includes(operator)) throw new RechargeError('NOT_INTEGRATED', 'operator not supported');
    if (!this.isConfigured()) throw new RechargeError('NOT_INTEGRATED', 'supplier not configured');
    // INTEGRATION POINT 1 (needs provider docs): authentication scheme (header/signature/token refresh).
    // INTEGRATION POINT 2 (needs provider docs): official endpoint(s) for operator availability + denominations/packages + prices.
    // INTEGRATION POINT 3: HTTP call with a timeout (e.g. AbortController, <= 15 s) using process.env.IQ_SUPPLIER_BASE_URL / _API_KEY.
    // INTEGRATION POINT 4: map the provider's response to the normalized shape documented in BaseAdapter.getCatalog().
    //   Only values the provider actually returned. No defaults, no estimated prices.
    // INTEGRATION POINT 5: map provider failures: unreachable/5xx -> SUPPLIER_UNAVAILABLE, other -> SUPPLIER_ERROR (never forward raw upstream text).
    throw new RechargeError('NOT_INTEGRATED', 'provider API not integrated yet');
  }
}
module.exports = IraqSupplierAdapter;
