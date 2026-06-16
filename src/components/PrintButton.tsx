"use client";
// Triggers the browser print dialog (used on the audit print page). Hidden in print output via .no-print.

export default function PrintButton() {
  return (
    <button
      type="button"
      className="btn-primary no-print"
      onClick={() => window.print()}
    >
      طباعة / حفظ PDF
    </button>
  );
}
