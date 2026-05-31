import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  isPublicBookingsPaused,
  isBookingFlowPausedPath,
} from "@/lib/public-bookings-paused";

export async function middleware(request: NextRequest) {
  if (isPublicBookingsPaused() && isBookingFlowPausedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/reservar/pausado";
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
