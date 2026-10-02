import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
