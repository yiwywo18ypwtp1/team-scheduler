import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This page doesn&apos;t exist. If you followed a booking link, check that it is complete.
      </p>
      <Link href="/calendar" className="self-start text-sm font-medium underline">
        Go to calendar
      </Link>
    </main>
  );
}
