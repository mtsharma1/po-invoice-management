export function validateDispatchQuantity(value, available) {
  const quantity = Number(value || 0);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('Dispatch quantity must be a whole number of zero or more.');
  }
  if (quantity > Math.max(0, Number(available || 0))) {
    throw new Error(`Dispatch quantity cannot exceed available quantity (${Math.max(0, Number(available || 0))}).`);
  }
  return quantity;
}
