const THRESHOLDS = [
  { label: "Sensitivity", value: "≥ 75%" },
  { label: "Specificity", value: "≥ 80%" },
  { label: "Cohort", value: "500+ children, 20+ sessions each" },
  { label: "Ground truth", value: "School-psychologist assessment" },
]

const LAYERS = [
  {
    name: "The person",
    body: "One individual's own normal. Never pooled, never averaged.",
    rebuilt: false,
  },
  {
    name: "Domain layer",
    body: "The activity, the clinical instrument, the escalation protocol.",
    rebuilt: true,
  },
  {
    name: "The engine",
    body: "Behavioural features, personal baseline, deviation scoring, thresholds.",
    rebuilt: false,
  },
  {
    name: "Foundation",
    body: "Data architecture, consent, audit trail, on-device processing.",
    rebuilt: false,
  },
]

export function Science() {
  return (
    <section id="science" className="border-t border-border/60 bg-card/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          The science
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Built to be checked, not taken on faith.
        </h2>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Children are using Petrus today, in a pre-pilot running at agreed
          sites in Switzerland and Portugal. The validation method and its
          thresholds were registered before a single session ran.
        </p>

        <div className="mt-16 grid gap-16 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold">Thresholds, registered in advance</h3>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {THRESHOLDS.map((t) => (
                <div key={t.label} className="rounded-lg border border-border bg-background/60 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.label}
                  </dt>
                  <dd className="mt-1 text-xl font-bold">{t.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Owned by our Lead Clinical Psychologist, with a data-protection
              impact assessment before any child is enrolled.{" "}
              <span className="font-semibold text-foreground">
                If the read-out is negative, we publish it.
              </span>
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold">The Petrus Brain</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Four layers. The bottom two are identical in every product we
              build. The top two are rebuilt for each one.
            </p>
            <ul className="mt-6 space-y-4">
              {LAYERS.map((l) => (
                <li key={l.name} className="flex items-start gap-4 rounded-lg border border-border bg-background/60 p-4">
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      l.rebuilt ? "bg-amber" : "bg-cyan"
                    }`}
                  />
                  <div>
                    <p className="font-semibold">
                      {l.name}{" "}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {l.rebuilt ? "· rebuilt for each product" : "· shared by every product"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{l.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 rounded-xl border border-border bg-background/60 p-6 sm:p-8">
          <p className="text-sm leading-relaxed sm:text-base text-muted-foreground">
            <span className="font-semibold text-foreground">Petrus does not diagnose.</span>{" "}
            Article 5(1)(f) of the EU AI Act bans inferring emotions in
            schools and workplaces — no emotion is inferred from any input we
            capture, in any product we build. That is the line we hold that
            tools reading faces and voices cannot.
          </p>
        </div>
      </div>
    </section>
  )
}
