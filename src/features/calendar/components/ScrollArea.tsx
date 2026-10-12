"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
  /** Where to scroll on first render, e.g. the start of the working day. */
  initialScrollTop: number;
  className?: string;
  children: ReactNode;
};

/**
 * Scroll container that starts at a given offset. The only client part of the
 * grid body: `children` stay server-rendered and are just passed through.
 * Navigating to another week keeps this component mounted, so the user's
 * scroll position is preserved.
 */
export function ScrollArea({ initialScrollTop, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
