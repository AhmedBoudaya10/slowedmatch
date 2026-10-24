import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlowedMatch — slowed + reverb versions of your Spotify playlist",
  description:
    "Paste a public Spotify playlist and find a slowed + reverb version of every track on YouTube. Free, no login.",
  applicationName: "SlowedMatch",
  openGraph: {
    title: "SlowedMatch",
    description:
      "Your Spotify playlist, slowed and reverbed. Free, no login, no downloads.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
