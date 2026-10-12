import type { Metadata } from "next";
import { SettingsForm } from "@/features/settings/components/SettingsForm";
import { headers } from "next/headers";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import { firstDayOfWeek, localeFromAcceptLanguage } from "@/lib/time/week";
import Link from "next/link";
import { listBookingPages } from "@/server/booking";
import { getMember, listMembers } from "@/server/members";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage() {
  const session = await getSession();
  // Only the fields the form needs, to keep the client payload small.
  const members = listMembers().map(({ id, name, timezone }) => ({ id, name, timezone }));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <section aria-labelledby="pages-title" className="mb-8 flex flex-col gap-2">
        <h2 id="pages-title" className="text-lg font-medium">
          Booking pages
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {listBookingPages().map((page) => (
            <li key={page.slug} className="flex flex-wrap gap-3">
              <span className="font-medium">{page.title}</span>
              <span className="text-zinc-500">by {getMember(page.ownerId)?.name}</span>
              <Link href={`/settings/booking/${page.slug}`} className="underline">
                Edit questionnaire
              </Link>
              <Link href={`/book/${page.slug}`} className="underline">
                Public page
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <SettingsForm
        members={members}
        timeZones={TIME_ZONE_OPTIONS}
        defaultValues={{
          userId: session.user.id,
          timeZone: session.timeZoneOverride ?? "",
          weekStart: session.weekStartOverride === undefined ? "" : String(session.weekStartOverride),
        }}
        localeWeekStartLabel={WEEKDAY_NAMES[firstDayOfWeek(localeFromAcceptLanguage((await headers()).get("accept-language")))] ?? "Monday"}
      />
    </main>
  );
}
