"use client";

import { useCallback, useEffect, useRef } from "react";

const MESSAGE = "You have unsaved changes. Discard them?";

/**
 * Guards unsaved form changes against leaving:
 * - closing/reloading the tab: `beforeunload` (the browser shows its own prompt);
 * - the browser Back button: while dirty, a duplicate history entry for the
 *   same URL is pushed. Back pops that entry first, so we get a `popstate`
 *   and can ask; "keep editing" pushes the entry again;
 * - in-app close buttons, Escape, backdrop: call `confirmLeave()` first.
 *
 * `leave(navigateBack)` closes for real: it skips the extra history entry, so
 * one "back" doesn't just land on the same page again.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  // Whether our extra history entry is currently on top of the stack.
  const hasExtraEntry = useRef(false);
  const isLeaving = useRef(false);

  useEffect(() => {
    if (isDirty && !hasExtraEntry.current) {
      window.history.pushState(window.history.state, "", window.location.href);
      hasExtraEntry.current = true;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onPopState = () => {
      if (isLeaving.current || !hasExtraEntry.current) return;
      // Back popped our extra entry; the page itself hasn't changed yet.
      hasExtraEntry.current = false;
      // Changes undone meanwhile: just complete the Back the user asked for.
      if (!isDirty || window.confirm(MESSAGE)) {
        isLeaving.current = true;
        window.history.back();
      } else {
        window.history.pushState(window.history.state, "", window.location.href);
        hasExtraEntry.current = true;
      }
    };

    if (isDirty) window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [isDirty]);

  const confirmLeave = useCallback(() => !isDirty || window.confirm(MESSAGE), [isDirty]);

  /** Navigate away for real: back past our extra entry, or run `navigate` (e.g. push). */
  const leave = useCallback((navigate: "back" | (() => void)) => {
    isLeaving.current = true;
    if (navigate === "back") {
      window.history.go(hasExtraEntry.current ? -2 : -1);
    } else {
      navigate();
    }
    hasExtraEntry.current = false;
  }, []);

  return { confirmLeave, leave };
}
