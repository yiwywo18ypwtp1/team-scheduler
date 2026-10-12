import Link from "next/link";
import { getSession } from "@/server/session";

// Layout for the internal app pages. The public booking pages live outside
// this route group, so reading cookies here doesn't make them dynamic.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/calendar" className="font-semibold">
            Team Scheduler
          </Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/find-time">Find time</Link>
          <Link href="/settings" className="ml-auto text-zinc-600 dark:text-zinc-400">
            {session.user.name} · {session.timeZone}
          </Link>
        </nav>
      </header>
      {children}
    </>
  );
}
