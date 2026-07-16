export default function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="action-row">{children}</div> : null}
    </header>
  );
}
