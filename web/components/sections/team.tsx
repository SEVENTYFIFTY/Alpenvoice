const TEAM = [
  {
    name: "Alexandre Matos",
    role: "Co-Founder & CEO",
    bio: "25+ years of international business across Switzerland, Portugal, Spain and Angola. Cambridge Judge Business Analytics.",
  },
  {
    name: "Mikkel Solnado",
    role: "Co-Founder & CTO",
    bio: "Founder of Nodel.app. Prior CEO roles in digital and AI ventures. Eight years in children's integration and mental health in Denmark.",
  },
  {
    name: "Dr. Pedro Bem-Haja",
    role: "Lead Clinical Psychologist",
    bio: "PhD in psychophysiology, University of Aveiro / CINTESIS@RISE. 45+ indexed papers. Owns the validation protocol and pre-registered thresholds.",
  },
  {
    name: "Five psychologists",
    role: "Clinical team",
    bio: "Three in Switzerland, two in Portugal. They design the activities, review what a flag means, and hold the line between detection and diagnosis.",
  },
  {
    name: "Marcel Greutmann",
    role: "Advisory Board",
    bio: "Former Vice President, IBM.",
  },
]

export function Team() {
  return (
    <section id="team" className="border-t border-border/60 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Who is building it
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          A deliberate separation of powers.
        </h2>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {TEAM.map((m) => (
            <div key={m.name} className="border-t-2 border-primary/60 pt-4">
              <p className="font-bold">{m.name}</p>
              <p className="mt-0.5 text-sm font-semibold text-primary">{m.role}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.bio}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-border bg-card/60 p-6 sm:p-8">
          <p className="text-balance text-lg leading-relaxed">
            The scientist who owns the thresholds does not build the
            detector, the clinical team holds the line between detection and
            diagnosis, and our sites said yes{" "}
            <span className="font-semibold text-primary">
              before there was a product to sell them
            </span>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
