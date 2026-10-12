import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { settingsToBuilder } from "@/features/booking/builder";
import { QuestionnaireBuilder } from "@/features/booking/components/QuestionnaireBuilder";
import { getBookingPage } from "@/server/booking";
import { getMember } from "@/server/members";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Booking page settings" };

export default async function BookingPageSettings({ params }: PageProps<"/settings/booking/[slug]">) {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  const page = getBookingPage(slug);
  if (!page) notFound();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        <Link href={`/book/${page.slug}`} className="text-sm underline">
          Open public page
        </Link>
      </div>
      {page.ownerId === session.user.id ? (
        <QuestionnaireBuilder slug={page.slug} defaultValues={settingsToBuilder(page)} />
      ) : (
        // UI hint only: saving is checked on the server as well (403).
        <p className="text-sm">
          Only {getMember(page.ownerId)?.name ?? "the owner"} can edit this page. Switch the current user in{" "}
          <Link href="/settings" className="underline">
            settings
          </Link>
          .
        </p>
      )}
    </main>
  );
}
