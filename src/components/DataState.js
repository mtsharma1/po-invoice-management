export function DataError({ error }) {
  if (!error) return null;
  return (
    <div className="data-error">
      <strong>Database is not connected yet.</strong>
      <span>{error.message || String(error)}</span>
    </div>
  );
}

export function EmptyState({ title = 'No records found', body = 'There is no data to show yet.' }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
