"use client";

export default function ConfirmDialog({ title, children, confirmLabel = "Confirm", onCancel, onConfirm, busy = false }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <p className="eyebrow">A MOMENT, PLEASE</p>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-copy">{children}</div>
        <div className="dialog-actions">
          <button className="button button-outline" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="button button-primary" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Please wait…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
