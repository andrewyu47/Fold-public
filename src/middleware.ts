import { NextRequest, NextResponse } from "next/server";

const PUBLIC = new Set(["/login", "/signup"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.has(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const session = req.cookies.get("fold_session")?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
