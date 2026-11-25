'use strict';
class AppError extends Error {
  constructor(status, code, message, fields, providerCode) { super(message); this.status = status; this.code = code; this.fields = fields; if (providerCode !== undefined) this.providerCode = providerCode; }
}
// providerCode is the provider's documented "Msg" code (e.g. "-203"). It is a short code only, never the provider's payload.
const toBody = e => ({ error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), ...(e.providerCode !== undefined ? { providerCode: e.providerCode } : {}) } });
module.exports = { AppError, toBody };
