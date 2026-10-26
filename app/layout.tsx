import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AltMatch — slowed, instrumental & sped-up versions of your playlist",
  description:
    "Paste a public Spotify playlist and get slowed + reverb, instrumental and sped-up versions of every track on YouTube. Scored, comparable, free, no login.",
  applicationName: "AltMatch",
  openGraph: {
    title: "AltMatch",
    description:
      "Your playlist, every version: slowed + reverb, instrumental and sped up. Free, no login, no downloads.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
