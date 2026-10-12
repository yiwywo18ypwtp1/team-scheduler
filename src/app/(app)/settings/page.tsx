import type { Metadata } from "next";
import { SettingsForm } from "@/features/settings/components/SettingsForm";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import { listMembers } from "@/server/members";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  // Only the fields the form needs, to keep the client payload small.
  const members = listMembers().map(({ id, name, timezone }) => ({ id, name, timezone }));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <SettingsForm
        members={members}
        timeZones={TIME_ZONE_OPTIONS}
        defaultValues={{ userId: session.user.id, timeZone: session.timeZoneOverride ?? "" }}
      />
    </main>
  );
}
