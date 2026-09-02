export function EmptyState(props: { title: string; detail: string; action?: React.ReactNode }): React.ReactNode {
  return (
    <section className="empty-state">
      <div className="empty-glyph">⌁</div>
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
      {props.action}
    </section>
  );
}
