import type { Metadata, Viewport } from "next";
import "@fontsource-variable/lexend";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barrett",
  description: "Household tasks, points and proof for Jack and Alyssa.",
  appleWebApp: { capable: true, title: "Barrett", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121f28" },
  ],
};

// Applies a saved light/dark choice before first paint so the page does not flash.
const themeScript = `try{var t=localStorage.getItem("barrett-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
