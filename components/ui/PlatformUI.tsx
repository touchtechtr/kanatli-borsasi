import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "neutral" | "violet" | "emerald" | "amber" | "red" | "blue";

const toneClasses: Record<Tone, string> = {
  neutral: "ui-tone-neutral",
  violet: "ui-tone-violet",
  emerald: "ui-tone-emerald",
  amber: "ui-tone-amber",
  red: "ui-tone-red",
  blue: "ui-tone-blue",
};

export function PageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ui-page-shell ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  tone = "violet",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  tone?: Tone;
}) {
  return (
    <header className={`ui-page-header ${toneClasses[tone]}`}>
      <div className="ui-page-header__glow" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
          <div className="mt-2 flex items-center gap-3">
            {Icon && <span className="ui-page-header__icon"><Icon className="h-6 w-6" /></span>}
            <h1 className="ui-page-title">{title}</h1>
          </div>
          {description && <p className="ui-page-description">{description}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SurfaceCard({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section className={`ui-surface-card ${interactive ? "ui-surface-card--interactive" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-section-title">{title}</h2>
        {description && <p className="ui-section-description">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className={`ui-metric-card ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ui-metric-label">{label}</p>
          <div className="ui-metric-value">{value}</div>
          {helper && <p className="ui-metric-helper">{helper}</p>}
        </div>
        {Icon && <span className="ui-metric-icon"><Icon className="h-5 w-5" /></span>}
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`ui-status-badge ${toneClasses[tone]}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty-state">
      {Icon && <span className="ui-empty-state__icon"><Icon className="h-6 w-6" /></span>}
      <h3 className="ui-section-title">{title}</h3>
      {description && <p className="ui-section-description mx-auto max-w-xl">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
