import { SiteNav } from "@/components/site/nav"
import { SiteFooter } from "@/components/site/footer"
import { SiteHero } from "@/components/sections/site-hero"
import { Problem } from "@/components/sections/problem"
import { HowItWorks } from "@/components/sections/how-it-works"
import { Device } from "@/components/sections/device"
import { WhoItsFor } from "@/components/sections/who-its-for"
import { Roadmap } from "@/components/sections/roadmap"
import { Science } from "@/components/sections/science"
import { Team } from "@/components/sections/team"
import { Partners } from "@/components/sections/partners"
import { Cta } from "@/components/sections/cta"

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <SiteHero />
        <Problem />
        <HowItWorks />
        <Device />
        <WhoItsFor />
        <Roadmap />
        <Science />
        <Team />
        <Partners />
        <Cta />
      </main>
      <SiteFooter />
    </>
  )
}
