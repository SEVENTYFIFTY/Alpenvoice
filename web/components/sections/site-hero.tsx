"use client"

import { useLayoutEffect, useRef } from "react"
import MusicHero, { type Track } from "@/components/ui/scroll-locked-video-hero"
import { ChevronDown } from "lucide-react"

// The verticals Petrus is built to grow into — one detection brain,
// pointed at a new population each time. Repurposes the hero's track
// scroller (built for a song list) to showcase the product roadmap.
const VERTICALS: Track[] = [
  { id: "kids", title: "Petrus Kids", artist: "Children & adolescents — live now", colorA: "#EC6041", colorB: "#7A2A18" },
  { id: "care", title: "Petrus Care", artist: "Elderly & residential care", colorA: "#EC6041", colorB: "#7A2A18" },
  { id: "able", title: "Petrus Able", artist: "Disability & supported living", colorA: "#F3B344", colorB: "#7A5410" },
  { id: "clinic", title: "Petrus Clinic", artist: "Psychiatry & psychology", colorA: "#EC6041", colorB: "#7A2A18" },
  { id: "sport", title: "Petrus Sport", artist: "Athletes & academies", colorA: "#F3B344", colorB: "#7A5410" },
  { id: "campus", title: "Petrus Campus", artist: "Universities & colleges", colorA: "#F3B344", colorB: "#7A5410" },
  { id: "hr", title: "Petrus HR", artist: "Workforce support", colorA: "#56B8E6", colorB: "#0E3A56" },
  { id: "desk", title: "Petrus Desk", artist: "Service & back office", colorA: "#56B8E6", colorB: "#0E3A56" },
  { id: "finance", title: "Petrus Finance", artist: "Financial guidance", colorA: "#56B8E6", colorB: "#0E3A56" },
  { id: "stay", title: "Petrus Stay", artist: "Hotels & guest service", colorA: "#50CEAC", colorB: "#0E4A3C" },
  { id: "health", title: "Petrus Health", artist: "Patient support", colorA: "#50CEAC", colorB: "#0E4A3C" },
  { id: "civic", title: "Petrus Civic", artist: "Public services", colorA: "#50CEAC", colorB: "#0E4A3C" },
]

export function SiteHero() {
  const rootRef = useRef<HTMLDivElement>(null)
  const didToggle = useRef(false)

  // The component's "wide view" mode renders its card as
  // `position: fixed`, permanently pinned over the viewport — by
  // design for a standalone player, but it would block scrolling to
  // every section below on a marketing page. There's no prop to
  // choose the starting mode, so we flip its own "Exit wide view"
  // toggle once, right after mount, before the browser paints. That
  // switches it to its other, equally-designed compact mode: a
  // tilting card centered in a normal-height section, with the rest
  // of the page flowing beneath it as usual. Guarded by a ref because
  // React's dev-mode Strict Mode double-invokes this effect, and two
  // clicks on a `f => !f` toggle cancel each other out.
  useLayoutEffect(() => {
    if (didToggle.current) return
    const btn = rootRef.current?.querySelector<HTMLButtonElement>(
      'button[aria-label="Exit wide view"]'
    )
    if (btn) {
      btn.click()
      didToggle.current = true
    }
  }, [])

  return (
    <section id="top" ref={rootRef} className="relative">
      <MusicHero
        title="EVERY CHILD, UNDERSTOOD."
        videoSrc="/hero-loop.mp4"
        backgroundSrc="/hero-bg.jpg"
        tracks={VERTICALS}
        signature={{ name: "www.petrus-labs.com", url: "https://www.petrus-labs.com" }}
        sound
      />

      {/* The hero above captures wheel/touch input for its own track
          scroller, so it intentionally doesn't hand scroll to the page
          underneath — this button is the explicit way down. */}
      <a
        href="#problem"
        aria-label="Scroll to the next section"
        className="group absolute inset-x-0 bottom-5 z-30 mx-auto flex w-fit flex-col items-center gap-1 text-xs font-medium text-white/70 transition-colors hover:text-white"
      >
        <span className="tracking-wide">Scroll to explore</span>
        <ChevronDown className="size-4 animate-bounce" />
      </a>
    </section>
  )
}
