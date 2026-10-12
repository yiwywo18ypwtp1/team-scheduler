import type { NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { listMembers } from "@/server/members";
import { simulateNetwork } from "@/server/mock-network";

/** GET /api/members?search= — case-insensitive match on name or email. */
export async function GET(request: NextRequest) {
  try {
    await simulateNetwork();
    const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const members = listMembers().filter(
      (member) =>
        !search || member.name.toLowerCase().includes(search) || member.email.toLowerCase().includes(search),
    );
    return Response.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
