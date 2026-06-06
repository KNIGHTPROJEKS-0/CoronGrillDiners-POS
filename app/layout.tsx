import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"
import { CartProvider } from "./context/cart-context"
import { ProductProvider } from "./context/product-context"
import { Providers } from "./providers"
import SwRegister from "./components/sw-register"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const metadata: Metadata = {
  title: "CDG POS",
  description: "Point of Sale System for Coron Grill Diners",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CDG POS",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="en">
      <head>
        {/* iOS home screen icons — must be explicit <link> tags; Next metadata alone is not enough */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167x167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CDG POS" />
      </head>
      <body className="bg-gray-100" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        <Providers session={session}>
          <ProductProvider>
            <CartProvider>
              <SwRegister />
              {children}
            </CartProvider>
          </ProductProvider>
        </Providers>
      </body>
    </html>
  )
}
