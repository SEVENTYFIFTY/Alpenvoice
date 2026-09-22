const BUYERS = [
  {
    name: "Schools",
    color: "coral" as const,
    stat: "1 in 7",
    statLabel: "children and adolescents in Europe live with a mental health condition",
    change: "Twenty short check-ins a year on every child, instead of a referral after somebody notices.",
  },
  {
    name: "Clinics",
    color: "amber" as const,
    stat: "17.8 wks",
    statLabel: "from first contact to the start of therapy in German child and adolescent practices",
    change: "A weekly signal between sessions, so a child on a long wait is not invisible for the whole of it.",
  },
  {
    name: "Academies",
    color: "cyan" as const,
    stat: "1 in 5",
    statLabel: "German junior elite athletes screen above the cut-off for depressive symptoms",
    change: "The same three-minute check-in inside training, where the coach sees the performance, not the child.",
  },
]

const colorClasses: Record<string, string> = {
  coral: "border-primary/40 bg-primary/5 text-primary",
  amber: "border-amber/40 bg-amber/5 text-amber",
  cyan: "border-cyan/40 bg-cyan/5 text-cyan",
}

export function WhoItsFor() {
  return (
    <section id="who-its-for" className="border-t border-border/60 bg-card/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Who it&apos;s for
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Three institutions that already owe the child a duty of care.
        </h2>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Each one already carries the concern. Petrus puts the right child
          in front of the right professional before anyone would otherwise
          have asked.
        </p>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {BUYERS.map((b) => (
            <div
              key={b.name}
              className={`flex flex-col gap-4 rounded-xl border p-6 ${colorClasses[b.color]}`}
            >
              <h3 className="text-lg font-bold text-foreground">{b.name}</h3>
              <div>
                <p className="text-3xl font-extrabold">{b.stat}</p>
                <p className="mt-1 text-sm text-muted-foreground">{b.statLabel}</p>
              </div>
              <p className="mt-auto border-t border-border/60 pt-4 text-sm text-foreground/90">
                <span className="font-semibold">What Petrus changes.</span>{" "}
                {b.change}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
