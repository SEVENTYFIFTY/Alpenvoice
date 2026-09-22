import { Button } from "@/components/ui/button"

export function Cta() {
  return (
    <section id="contact" className="border-t border-border/60 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Every child, <span className="text-primary">understood</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-muted-foreground">
          If you run a school, a clinic, or an academy and want to see Petrus
          in a real classroom, we&apos;d like to talk.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg">
            <a href="mailto:hello@petrus-labs.com">Talk to us</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#how-it-works">See how it works</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
