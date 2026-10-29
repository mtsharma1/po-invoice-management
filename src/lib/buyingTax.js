export const usesBuyingTax = header => Number(header?.TaxDetailsVersion || 0) >= 2;

export function buyingTaxRates(line) {
  const values = ['BuyingTaxCGST', 'BuyingTaxIGST', 'BuyingTaxSGST'].map(field => Number(line[field] || 0));
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new Error('Buying Tax rates must be numbers between 0 and 100.');
  }
  const [cgstRate, igstRate, sgstRate] = values;
  if (!((igstRate > 0 && cgstRate === 0 && sgstRate === 0)
    || (igstRate === 0 && cgstRate > 0 && sgstRate > 0))) {
    throw new Error('Enter either Buying Tax IGST only, or both Buying Tax CGST and Buying Tax SGST. All-zero rates and mixed IGST with CGST/SGST are not allowed.');
  }
  return { taxRate: cgstRate + igstRate + sgstRate, cgstRate, igstRate, sgstRate };
}
