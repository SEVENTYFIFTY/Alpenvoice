import { Logo } from "@/components/site/logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left sm:px-6 lg:px-8">
        <div>
          <Logo className="text-base" />
          <p className="mt-1 text-sm text-muted-foreground">
            Every child, understood.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Petrus AI · Switzerland &amp; Portugal ·{" "}
          <a href="mailto:hello@petrus-labs.com" className="underline underline-offset-2 hover:text-foreground">
            hello@petrus-labs.com
          </a>
        </p>
      </div>
    </footer>
  )
}
