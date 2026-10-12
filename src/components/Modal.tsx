"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Lets the content decide how the modal closes. The event form uses it to
 * ask "discard changes?" and to leave history in the right state; without a
 * handler, closing just navigates back.
 */
const ModalCloseContext = createContext<((handler: (() => void) | null) => void) | null>(null);

/** Registers what Escape, the backdrop and the × button do while mounted. */
export function useModalCloseHandler(handler: () => void) {
  const register = useContext(ModalCloseContext);
  useEffect(() => {
    if (!register) return;
    register(handler);
    return () => register(null);
  }, [register, handler]);
}

/**
 * Route modal for intercepted routes, built on native <dialog>: showModal()
 * provides the focus trap, Escape handling and inert background for free.
 */
export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [closeHandler, setCloseHandler] = useState<(() => void) | null>(null);
  // Stable setter for the context; wraps the handler so React doesn't call it as an updater.
  const register = useCallback((handler: (() => void) | null) => setCloseHandler(() => handler), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const requestClose = () => (closeHandler ? closeHandler() : router.back());

  return (
    <ModalCloseContext.Provider value={register}>
      <dialog
        ref={dialogRef}
        aria-labelledby="modal-title"
        // Escape: keep the dialog open and let the content decide.
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        // Browsers may still close it (e.g. a second Escape); reopen and ask.
        onClose={() => {
          dialogRef.current?.showModal();
          requestClose();
        }}
        // The content wrapper fills the dialog, so a click whose target is the
        // <dialog> itself can only be on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
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
              onClick={requestClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-md text-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </ModalCloseContext.Provider>
  );
}
