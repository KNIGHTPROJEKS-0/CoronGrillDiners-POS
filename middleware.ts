import { withAuth } from "next-auth/middleware"
import { NextResponse, type NextRequest } from "next/server"

const authMiddleware = withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const { pathname } = req.nextUrl

    // Redirect admin away from the cashier POS root to the admin dashboard
    if (pathname === "/" && token?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.url))
    }

    // Block cashiers from accessing the admin dashboard
    if (pathname.startsWith("/admin") && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url))
    }

    // Block cashiers from the admin-only POS management page
    if (pathname === "/pos" && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url))
    }

    return NextResponse.next()
  },
  {
    pages: {
      signIn: "/login",
    },
  }
)

export default function middleware(req: NextRequest) {
  try {
    return authMiddleware(req as any, {} as any)
  } catch {
    const loginUrl = new URL("/login", req.url)
    const res = NextResponse.redirect(loginUrl)
    res.cookies.delete("next-auth.session-token")
    res.cookies.delete("__Secure-next-auth.session-token")
    return res
  }
}

export const config = {
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|sw\\.js|manifest\\.json|offline\\.html).*)",
  ],
}
