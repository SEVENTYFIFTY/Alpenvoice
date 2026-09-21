import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
})

export const metadata: Metadata = {
  title: "Petrus AI — Every child, understood.",
  description:
    "Petrus AI finds out a child is struggling months before anyone asks. A three-minute game learns what normal looks like for one child, and tells a named professional when it changes.",
  metadataBase: new URL("https://www.petrus-labs.com"),
  openGraph: {
    title: "Petrus AI — Every child, understood.",
    description:
      "A three-minute game learns what normal looks like for one child, and tells a named professional when it changes.",
    url: "https://www.petrus-labs.com",
    siteName: "Petrus AI",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
