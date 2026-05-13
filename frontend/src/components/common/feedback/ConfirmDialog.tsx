import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center" onClick={onCancel} role="presentation">
      <div
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${danger ? "border-coral/40 bg-coral/10 text-coral" : "border-amber/40 bg-amber/10 text-amber"}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="muted">Confirmation</p>
            <h3 className="text-base font-semibold" id="confirm-dialog-title">
              {title}
            </h3>
          </div>
          <button aria-label="Fermer" className="btn-ghost shrink-0 px-2" onClick={onCancel} type="button">
            <X size={16} />
          </button>
        </div>

        <p className="p-4 text-sm leading-6 text-slate-300" id="confirm-dialog-description">
          {description}
        </p>

        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className={danger ? "btn-ghost text-coral" : "btn-primary"} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
