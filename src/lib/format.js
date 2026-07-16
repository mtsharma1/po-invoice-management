export function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value, digits = 2) {
  return asNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function qty(value) {
  return asNumber(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function dateText(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-GB').replaceAll('/', '-');
}

export function dateTimeText(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${dateText(value)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function lines(value) {
  return text(value).split(/\r?\n/).filter(Boolean);
}
