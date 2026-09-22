import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-extrabold tracking-tight", className)}>
      <span className="text-foreground">Petrus</span>{" "}
      <span className="text-primary">AI</span>
    </span>
  )
}
