const DETECTION = [
  { name: "Petrus Kids", desc: "Children & adolescents", status: "Live now" },
  { name: "Petrus Care", desc: "Elderly & residential care" },
  { name: "Petrus Able", desc: "Disability & supported living" },
  { name: "Petrus Clinic", desc: "Psychiatry & psychology" },
  { name: "Petrus Sport", desc: "Athletes & academies" },
  { name: "Petrus Campus", desc: "Universities & colleges" },
]

const ASSISTANCE = [
  { name: "Petrus HR", desc: "Workforce support" },
  { name: "Petrus Desk", desc: "Service & back office" },
  { name: "Petrus Finance", desc: "Financial guidance" },
  { name: "Petrus Stay", desc: "Hotels & guest service" },
  { name: "Petrus Health", desc: "Patient support" },
  { name: "Petrus Civic", desc: "Public services" },
]

function VerticalCard({ name, desc, status }: { name: string; desc: string; status?: string }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        status
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card/60"
      }`}
    >
      <p className={`font-semibold ${status ? "text-primary" : "text-foreground"}`}>{name}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      {status && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
          {status}
        </p>
      )}
    </div>
  )
}

export function Roadmap() {
  return (
    <section className="border-t border-border/60 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Where Petrus is going
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          One brain. Twelve products.
        </h2>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Petrus Kids is the product today. Everything else is what the same
          detection engine can become once it is pointed at a new
          population — the shared foundation stays identical; only the
          activity and the professional on the other end change.
        </p>

        <div className="mt-16 grid gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-4 h-px w-full bg-gradient-to-r from-primary to-transparent" />
            <h3 className="text-lg font-bold">Early detection</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sells into a duty of care that already exists in law or
              contract.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {DETECTION.map((v) => (
                <VerticalCard key={v.name} {...v} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 h-px w-full bg-gradient-to-r from-cyan to-transparent" />
            <h3 className="text-lg font-bold">Assistance</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sells into a service budget — a different product on the same
              brain.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {ASSISTANCE.map((v) => (
                <VerticalCard key={v.name} {...v} />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted-foreground/70">
          Names are working titles. Detection and assistance are not one
          market — one sells to an organisation legally responsible for
          noticing; the other to one that wants its people helped.
        </p>
      </div>
    </section>
  )
}
