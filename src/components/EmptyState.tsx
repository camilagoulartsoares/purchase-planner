import { Shirt } from "lucide-react";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="card-soft grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-cream text-rose">
        <Shirt size={24} />
      </div>
      <h3 className="font-display text-2xl font-semibold text-brown-deep">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="btn-primary mt-5" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
