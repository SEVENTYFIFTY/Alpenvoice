import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atelier · Spotlight",
  description: "Every project in the studio, one at a time: progress, phases and what needs attention.",
};

// Same theme choice as the main Atelier dashboard (same origin, same stored preference),
// applied before paint so there's no light/dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem("studio.theme");
var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
