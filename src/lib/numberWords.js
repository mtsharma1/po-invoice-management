const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(value) {
  if (value < 20) return ONES[value];
  return [TENS[Math.floor(value / 10)], ONES[value % 10]].filter(Boolean).join(' ');
}

function belowThousand(value) {
  const hundred = Math.floor(value / 100);
  const remainder = value % 100;
  return [
    hundred ? `${ONES[hundred]} hundred` : '',
    remainder ? belowHundred(remainder) : '',
  ].filter(Boolean).join(' ');
}

export function numberInIndianWords(value) {
  let amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount === 0) return 'zero';

  const parts = [];
  const groups = [
    ['crore', 10000000],
    ['lakh', 100000],
    ['thousand', 1000],
  ];

  for (const [label, divisor] of groups) {
    const groupValue = Math.floor(amount / divisor);
    if (groupValue) {
      parts.push(`${belowThousand(groupValue)} ${label}`);
      amount %= divisor;
    }
  }

  if (amount) parts.push(belowThousand(amount));
  return parts.join(' ');
}

export function amountInWords(value) {
  return `RUPEES ${numberInIndianWords(value).toUpperCase()} ONLY`;
}
