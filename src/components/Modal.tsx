"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Route modal for intercepted routes, built on native <dialog>: showModal()
 * provides the focus trap, Escape handling and inert background for free.
 * Closing (Escape, backdrop click, close button) navigates back, which
 * restores the URL underneath.
 */
export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      onClose={() => router.back()}
      // The content wrapper fills the dialog, so a click whose target is the
      // <dialog> itself can only be on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[90dvh] rounded-xl bg-white p-0 text-inherit shadow-2xl backdrop:bg-black/40 dark:bg-zinc-900"
    >
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-md text-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
