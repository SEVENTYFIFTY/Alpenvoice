const STEPS = [
  {
    n: "01",
    title: "The child interacts",
    body: "Three minutes at a time, as often as the child chooses. A game, not a test. No score, and no question about how they feel.",
  },
  {
    n: "02",
    title: "We watch behaviour",
    body: "Response timing, retries, pauses, requests for help, abandoned choices. No camera, no message content, no device monitoring.",
  },
  {
    n: "03",
    title: "His baseline learns him",
    body: "His own recent sessions build his normal. He is compared to himself, never to a population average or the child beside him.",
  },
  {
    n: "04",
    title: "The engine flags drift",
    body: "A sustained run of sessions outside his own band. One flag, with the evidence behind it and a confidence attached.",
  },
  {
    n: "05",
    title: "A person decides",
    body: "One named professional, inside the institution that already owes him a duty of care. Petrus never contacts a child, a parent, or a service.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 bg-card/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          How it works
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          We compare a child to <span className="text-primary">himself</span>.
        </h2>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          He thinks he is playing a game. He is. Everything below happens
          around him, and none of it asks him a single question about how he
          feels.
        </p>

        <ol className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step) => (
            <li key={step.n} className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-muted-foreground/70">
                {step.n}
              </span>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-16 rounded-xl border border-cyan/30 bg-cyan/5 p-6 sm:p-8">
          <p className="text-sm leading-relaxed sm:text-base">
            <span className="font-semibold">What it runs on.</span>{" "}
            <span className="text-muted-foreground">
              The school&apos;s own tablets, phones, laptops and PCs — or
              PIP, for the youngest. Screens capture behavioural signal only.
            </span>{" "}
            <span className="font-semibold">
              No emotion is inferred from anything we capture
            </span>{" "}
            <span className="text-muted-foreground">
              — which is what keeps it lawful in a European classroom. Swiss
              nFADP and EU GDPR in parallel, with an audit trail behind every
              flag.
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
