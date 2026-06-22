import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function Panel({
  title,
  eyebrow,
  icon,
  actions,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string;
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`panel ${className}`} {...props}>
      {(title || eyebrow || actions) && (
        <header className="panel__header">
          <div className="panel__heading">
            {icon && <span className="panel__icon">{icon}</span>}
            <div>
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              {title && <h2>{title}</h2>}
            </div>
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}

export function StatusDot({
  status,
  children,
}: {
  status: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  return (
    <span className={`status status--${status}`}>
      <i />
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="toggle-wrap">
      {label && <span>{label}</span>}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i className="toggle" />
    </label>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = "gold",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: ReactNode;
  tone?: "gold" | "green" | "orange" | "blue";
}) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}
