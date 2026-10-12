"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Last-resort boundary for unexpected errors. Expected ones (validation,
 * conflicts, taken slots, missing events…) are handled where they happen,
 * so reaching this page means a bug or an outage.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        The page couldn&apos;t be shown. Try again; if it keeps happening, reload the page.
        {error.digest && <span className="mt-1 block text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Try again
        </button>
        <Link href="/calendar" className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
          Go to calendar
        </Link>
      </div>
    </main>
  );
}
