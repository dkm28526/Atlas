import type { Metadata } from "next";
import { Special_Elite } from "next/font/google";
import "./globals.css";

// Self-hosted at build time (no runtime CDN call) — used only by the
// adventure-map view's labels, exposed as a CSS variable so it never
// overrides the app's default UI font.
const vintage = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vintage",
});

export const metadata: Metadata = {
  title: "Atlas — multi-city trip planner",
  description:
    "Plan a dense multi-city trip: the route, the nights, the days, and where to sleep.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={vintage.variable}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
