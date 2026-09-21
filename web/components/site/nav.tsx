"use client"

import { useEffect, useState } from "react"
import { Logo } from "@/components/site/logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "#problem", label: "The problem" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#device", label: "PIP" },
  { href: "#who-its-for", label: "Who it's for" },
  { href: "#science", label: "Science" },
  { href: "#team", label: "Team" },
]

export function SiteNav() {
  // The hero below is a fixed, full-bleed 100dvh experience with its own
  // title fixed near the top of the viewport — a nav bar drawn over it
  // the whole time would overlap that title. So the nav stays hidden
  // until the visitor has scrolled roughly past the hero, then fades in.
  const [pastHero, setPastHero] = useState(false)

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.85)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-all duration-300",
        pastHero
          ? "border-border/60 bg-background/80 opacity-100 backdrop-blur-md"
          : "pointer-events-none border-transparent bg-transparent opacity-0"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-2">
          <Logo className="text-lg" />
        </a>

        <ul className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href="#contact">Talk to us</a>
          </Button>
        </div>
      </nav>
    </header>
  )
}
