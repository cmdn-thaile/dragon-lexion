import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

/* Next.js middleware: mounts /auth/login, /auth/logout, /auth/callback
   and keeps the Auth0 session cookie fresh. */
export async function middleware(request: NextRequest) {
  if (!auth0) return NextResponse.next();
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sprites|bg|data|robots.txt).*)"],
};
