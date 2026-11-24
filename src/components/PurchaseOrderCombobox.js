'use client';

import SearchableCombobox from './SearchableCombobox';

export default function PurchaseOrderCombobox({ purchaseOrders, emptyLabel = 'All purchase orders', ...props }) {
  return (
    <SearchableCombobox
      {...props}
      choices={purchaseOrders.map(po => ({ value: po.POBarcode, label: String(po.POBarcode ?? '') }))}
      placeholder={emptyLabel}
      emptyOption={emptyLabel}
      searchPlaceholder="Type to search purchase orders…"
      listLabel="Purchase orders"
      noMatches="No matching purchase orders"
    />
  );
}
