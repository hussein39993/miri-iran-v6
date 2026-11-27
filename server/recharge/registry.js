'use strict';
const IranSupplierAdapter = require('./adapters/IranSupplierAdapter');
const IraqSupplierAdapter = require('./adapters/IraqSupplierAdapter');
// Maps operator id -> adapter. To use another supplier for an operator, pass your own adapters array.
function createRegistry(adapters) {
  const list = adapters || [new IranSupplierAdapter(), new IraqSupplierAdapter()];
  const byOp = new Map();
  for (const a of list) for (const op of a.operators) byOp.set(op, a);
  return { forOperator: op => byOp.get(op) || null, operators: () => Array.from(byOp.keys()) };
}
module.exports = { createRegistry };
