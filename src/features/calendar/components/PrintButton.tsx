"use client";

/** Prints the current view; print styles hide the app chrome and unroll the grid. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 print:hidden dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      Print
    </button>
  );
}
