const STATS = [
  {
    value: "Two a week",
    label: "Young people in Switzerland who take their own life",
    detail: "Ages 15–25. The leading cause of death at that age.",
    color: "text-primary",
  },
  {
    value: "1 in 5",
    label: "Children in Europe who experience sexual violence",
    detail: "Sixteen in a room of eighty.",
    color: "text-amber",
  },
  {
    value: "1 in 7",
    label: "Children living with a mental health condition",
    detail: "WHO Europe, November 2025. Up a third in fifteen years.",
    color: "text-cyan",
  },
  {
    value: "55 million",
    label: "Children a year who experience violence in Europe",
    detail: "Widely under-reported, by WHO's own account.",
    color: "text-mint",
  },
]

const WATCHERS = [
  { role: "Parent", hours: "40 h", note: "evenings, weekends, holidays" },
  { role: "Teacher", hours: "30 h", note: "six hours a day, 25 at once" },
  { role: "Coach", hours: "3 h", note: "twice a week, in season" },
  { role: "Counsellor", hours: "0 h", note: "until somebody refers" },
  { role: "Psychiatrist", hours: "0 h", note: "one per 76,000 children" },
]

export function Problem() {
  return (
    <section id="problem" className="border-t border-border/60 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          The problem
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Nobody is watching the whole child.
        </h2>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Each adult in a child&apos;s life sees a slice. A child does not fall
          apart in a day — it takes months of small days, and no single adult
          holds them all.
        </p>

        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-5">
          {WATCHERS.map((w) => (
            <div key={w.role} className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-primary/40 text-sm font-bold text-primary">
                {w.hours}
              </div>
              <p className="mt-3 text-sm font-semibold">{w.role}</p>
              <p className="mt-1 text-xs text-muted-foreground">{w.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className={`text-4xl font-extrabold tracking-tight ${s.color}`}>{s.value}</p>
              <p className="mt-2 text-sm font-semibold">{s.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
          <p className="text-base sm:text-lg">
            <span className="font-semibold">
              From 1 July 2026, Swiss law changed.
            </span>{" "}
            <span className="text-muted-foreground">
              The Civil Code now requires a non-violent upbringing and obliges
              cantons to make counselling and support reachable for parents
              and children who need it.
            </span>{" "}
            <span className="font-semibold">
              The duty is new. The instrument to act on it is what Petrus
              builds.
            </span>
          </p>
        </div>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-muted-foreground/70">
          Sources: RADIX and the Swiss Federal Statistical Office · Council of
          Europe ONE in FIVE · WHO Regional Office for Europe, 13 November
          2025 · Swiss Civil Code amendment passed 26 September 2025, in force
          1 July 2026.
        </p>
      </div>
    </section>
  )
}
