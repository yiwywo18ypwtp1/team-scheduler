import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/features/booking/components/BookingFlow";
import { getPublicBookingPage, listBookingPages } from "@/server/booking";

/**
 * Public booking page, pre-rendered at build time for every known slug (ISR).
 * Only the page settings are baked in, read through a cache tagged
 * `booking-page:<slug>`: PUT /api/booking-pages/:slug revalidates the tag and
 * the HTML is rebuilt. Slots depend on the current time and are loaded on the client.
 */
export function generateStaticParams() {
  return listBookingPages().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicBookingPage(slug);
  if (!data) return { title: "Booking page not found" };
  const { page, ownerName } = data;
  const title = ownerName ? `${page.title} with ${ownerName}` : page.title;
  const description = `Book ${page.durationOptions.join(" or ")} minutes${ownerName ? ` with ${ownerName}` : ""}.`;
  // The image itself comes from ./opengraph-image.tsx.
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function BookPage({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  const data = await getPublicBookingPage(slug);
  if (!data) notFound();
  const { page, ownerName } = data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm text-zinc-500">{ownerName}</p>
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {page.durationOptions.join(" or ")} minutes · times are shown in your timezone
        </p>
      </header>
      <BookingFlow slug={page.slug} durationOptions={page.durationOptions} />
    </main>
  );
}
