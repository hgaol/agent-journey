import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";

export function EmptyState(props: { title: string; detail: string; action?: React.ReactNode }): React.ReactNode {
  return (
    <AstryxEmptyState
      className="empty-state"
      title={props.title}
      description={props.detail}
      headingLevel={2}
      icon={<span className="empty-glyph">⌁</span>}
      {...(props.action ? { actions: props.action } : {})}
    />
  );
}
