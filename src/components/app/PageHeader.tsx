import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1 className="page-title">{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  );
}
