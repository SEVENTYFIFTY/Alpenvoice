import { Badge } from "@/components/ui/badge"

const FACTS = [
  {
    title: "It is a toy, not a test",
    body: "A small desk robot. Three minutes with it. He is playing, not being assessed.",
  },
  {
    title: "Petrus runs everywhere",
    body: "Tablet, smartphone, laptop, desktop PC — the engine is software and goes wherever there is a screen. PIP is the version for the youngest, where a screen is a test and a robot is a routine.",
  },
]

const STATUS = [
  { label: "Being built now", tone: "mint" as const, body: "On a supplied robot platform." },
  { label: "Next", tone: "amber" as const, body: "Petrus inside the device, then the on-device chip, so raw data never leaves the room." },
  { label: "Not yet", tone: "outline" as const, body: "CE, EN 71, radio and battery certification. No child has used the integrated device outside a consented pilot." },
]

export function Device() {
  return (
    <section id="device" className="border-t border-border/60 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              PIP — the device
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              A six-year-old will not fill in a form.
            </h2>
            <p className="mt-6 text-balance text-lg text-muted-foreground">
              Every other tool asks the child how they feel. Six-year-olds do
              not have the words, and teenagers learn fast which answer ends
              the conversation.{" "}
              <span className="font-semibold text-foreground">
                PIP gets the data without asking the question.
              </span>
            </p>

            <dl className="mt-10 grid gap-8 sm:grid-cols-2">
              {FACTS.map((f) => (
                <div key={f.title}>
                  <dt className="text-sm font-semibold">{f.title}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-10 space-y-4">
              {STATUS.map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <Badge variant={s.tone === "outline" ? "outline" : s.tone}>
                    {s.label}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-background">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, hsl(var(--primary) / 0.28), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--amber) / 0.22), transparent 55%)",
              }}
            />
            <div className="relative flex h-full flex-col items-center justify-center gap-6 p-10 text-center">
              <div className="flex size-40 items-center justify-center rounded-3xl border border-primary/40 bg-card/80 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.6)]">
                <div className="flex size-20 items-center justify-center rounded-2xl border border-cyan/50">
                  <div className="size-8 animate-pulse rounded-full bg-cyan" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Renders of the Petrus-branded unit. The working unit is in
                construction on a supplied robot platform.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
