var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function billedOrder() {
  var items = [
    { id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 600, qty: 1 },
    { id: 2, name: 'Ghee', sku: 'GHEE-1', hsn: '0405', price: 100, qty: 1 }
  ];
  var totals = pricing.computeTotals(items, 'WELCOME');

  return {
    id: 42,
    date: '2026-11-21',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: 'WELCOME',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: checkout pricing bills an HSN-based, pre-tax coupon total', function () {
  var order = billedOrder();

  assert.deepEqual(
    { subtotal: order.subtotal, discount: order.discount, tax: order.tax, total: order.total },
    { subtotal: 700, discount: 35, tax: 39.9, total: 704.9 }
  );
});

test('invoice uses the same GST and coupon calculation as checkout', function () {
  var order = billedOrder();
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: figures.subtotal,
      discount: figures.discount,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    { subtotal: 700, discount: 35, tax: 39.9, cgst: 19.95, sgst: 19.95, total: 704.9 }
  );
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.total, order.total);
});

test('rendered invoice shows checkout figures without a billed-total warning', function () {
  var order = billedOrder();
  var html = invoice.render(order);

  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹39\.90/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹704\.90/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('GST reconciliation matches invoices to the checkout ledger', function () {
  var order = billedOrder();
  var reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.deepEqual(reconciliation, {
    totalChecked: 1,
    mismatchCount: 0,
    totalDelta: 0,
    rows: [{
      orderId: 42,
      date: '2026-11-21',
      customer: 'In-memory customer',
      coupon: 'WELCOME',
      ledgerSubtotal: 700,
      ledgerDiscount: 35,
      ledgerTax: 39.9,
      ledgerTotal: 704.9,
      invoiceDiscount: 35,
      invoiceTax: 39.9,
      invoiceTotal: 704.9,
      delta: 0,
      matched: true
    }]
  });
});

test('invoice line taxes use checkout HSN rates after coupon apportionment', function () {
  var order = billedOrder();
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: figures.subtotal,
      discount: figures.discount,
      tax: figures.tax,
      cgst: figures.cgst,
      sgst: figures.sgst,
      total: figures.total
    },
    { subtotal: 700, discount: 35, tax: 39.9, cgst: 19.95, sgst: 19.95, total: 704.9 }
  );
  assert.deepEqual(figures.rows, [
    { name: 'Rice', sku: 'RICE-1', hsn: '1006', qty: 1, price: 600, gstPercent: 5, line: 600, lineTax: 28.5 },
    { name: 'Ghee', sku: 'GHEE-1', hsn: '0405', qty: 1, price: 100, gstPercent: 12, line: 100, lineTax: 11.4 }
  ]);
});

