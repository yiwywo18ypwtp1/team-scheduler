import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/features/booking/components/BookingFlow";
import { getBookingPage, listBookingPages } from "@/server/booking";
import { getMember } from "@/server/members";

/**
 * Public booking page, pre-rendered at build time for every known slug.
 * Only the page settings are baked in; slots depend on the current time and
 * are loaded on the client. Refreshing the HTML when the owner edits the page
 * (revalidateTag) comes with the Advanced level.
 */
export function generateStaticParams() {
  return listBookingPages().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = getBookingPage(slug);
  if (!page) return { title: "Booking page not found" };
  const owner = getMember(page.ownerId);
  const title = owner ? `${page.title} with ${owner.name}` : page.title;
  const description = `Book ${page.durationOptions.join(" or ")} minutes${owner ? ` with ${owner.name}` : ""}.`;
  // The image itself comes from ./opengraph-image.tsx.
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function BookPage({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  const page = getBookingPage(slug);
  if (!page) notFound();
  const owner = getMember(page.ownerId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm text-zinc-500">{owner?.name}</p>
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {page.durationOptions.join(" or ")} minutes · times are shown in your timezone
        </p>
      </header>
      <BookingFlow slug={page.slug} durationOptions={page.durationOptions} />
    </main>
  );
}
