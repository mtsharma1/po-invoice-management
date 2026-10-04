// Only new invoices explicitly marked on creation use the new rules.
// Never infer this from the editable invoice date.
export function usesItemTaxDetails(header) {
  return Number(header?.TaxDetailsVersion || 0) >= 1;
}

// Preserve the application's existing switch: selected means CGST + SGST.
export function lineTaxRates(header, line) {
  const split = Number(header?.InterStateTax || 0) !== 0;
  const positive = (value, fallback) => Number(value) > 0 ? Number(value) : fallback;
  let cgstRate = split ? positive(header?.CGST, 9) : 0;
  let sgstRate = split ? positive(header?.SGST, 9) : 0;
  let igstRate = split ? 0 : positive(header?.IGSTRate, 18);
  if (usesItemTaxDetails(header) && String(line.VendorArticleName || '').trim().toUpperCase().startsWith('T_SH')) {
    // Use the full taxable line amount (quantity × rate), not the unit rate.
    const amount = roundTaxMoney(line.Amount ?? (Number(line.Qty || 0) * Number(line.Rate || 0)));
    const rate = amount <= 2500 ? 5 : 18;
    cgstRate = split ? rate / 2 : 0;
    sgstRate = split ? rate / 2 : 0;
    igstRate = split ? 0 : rate;
  }
  return { taxRate: igstRate + cgstRate + sgstRate, igstRate, cgstRate, sgstRate };
}

export function roundTaxMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function invoiceTaxSummary(header, lines) {
  const groups = new Map();
  for (const line of lines) {
    const rates = lineTaxRates(header, line);
    const key = `${rates.igstRate}/${rates.cgstRate}/${rates.sgstRate}`;
    const group = groups.get(key) || { ...rates, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0 };
    const amount = roundTaxMoney(line.Amount);
    group.taxableAmount = roundTaxMoney(group.taxableAmount + amount);
    for (const tax of ['igst', 'cgst', 'sgst']) {
      group[`${tax}Amount`] = roundTaxMoney(group[`${tax}Amount`] + roundTaxMoney(amount * rates[`${tax}Rate`] / 100));
    }
    group.totalTax = roundTaxMoney(group.igstAmount + group.cgstAmount + group.sgstAmount);
    group.totalAmount = roundTaxMoney(group.taxableAmount + group.totalTax);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.taxRate - b.taxRate);
}
