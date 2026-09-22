import { Badge } from "@/components/ui/badge"

type Status = "Signed" | "Agreed" | "In development" | "Early"

const statusVariant: Record<Status, "mint" | "cyan" | "amber" | "outline"> = {
  Signed: "mint",
  Agreed: "mint",
  "In development": "cyan",
  Early: "amber",
}

const GROUPS: { heading: string; items: { name: string; status: Status; note: string }[] }[] = [
  {
    heading: "Research and clinical",
    items: [
      { name: "FH Graubünden", status: "Signed", note: "400+ hours, two student teams, two reports." },
      { name: "Univ. Aveiro / CINTESIS@RISE", status: "Agreed", note: "Validation method and pre-registered thresholds." },
      { name: "PDGR child & adolescent psychiatry", status: "Agreed", note: "Co-development on clinical routing." },
    ],
  },
  {
    heading: "Sites",
    items: [
      { name: "AEA Alcochete", status: "Agreed", note: "Five-school cluster, 3,100 students aged 6–18." },
      { name: "CRI football academy", status: "Agreed", note: "170 athletes aged 5–21." },
      { name: "Two Graubünden cantonal schools", status: "Agreed", note: "The Swiss jurisdiction and the Schulgemeinde route." },
    ],
  },
  {
    heading: "State and technology",
    items: [
      { name: "UAARE", status: "Agreed", note: "Portuguese Ministry of Education athlete unit." },
      { name: "CSEM via Univ. St. Gallen", status: "In development", note: "On-device processing." },
      { name: "Portuguese Football Federation", status: "Early", note: "Early conversations." },
    ],
  },
]

export function Partners() {
  return (
    <section className="border-t border-border/60 bg-card/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Who is already with us
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Every site here agreed before there was a product to sell them.
        </h2>

        <div className="mt-16 grid gap-12 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {g.heading}
              </h3>
              <ul className="mt-4 divide-y divide-border/60">
                {g.items.map((item) => (
                  <li key={item.name} className="py-4">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{item.name}</p>
                      <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
