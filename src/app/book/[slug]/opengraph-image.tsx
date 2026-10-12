import { ImageResponse } from "next/og";
import { getPublicBookingPage } from "@/server/booking";

export const alt = "Booking page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Open Graph card with the page title and its owner. */
export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicBookingPage(slug);
  const page = data?.page;
  const ownerName = data?.ownerName;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #18181b 0%, #1e3a8a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7 }}>Team Scheduler</div>
        <div style={{ fontSize: 80, fontWeight: 700, marginTop: 24 }}>{page?.title ?? "Booking page"}</div>
        {/* One text node per element: the OG renderer needs display:flex for more. */}
        {ownerName && <div style={{ fontSize: 44, marginTop: 16, opacity: 0.9 }}>{`with ${ownerName}`}</div>}
        {page && (
          <div style={{ fontSize: 32, marginTop: 48, opacity: 0.7 }}>
            {`${page.durationOptions.join(" or ")} minutes`}
          </div>
        )}
      </div>
    ),
    size,
  );
}
