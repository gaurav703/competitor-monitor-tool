import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Competitor monitor",
  description: "Watch rival product updates that actually matter to you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f7f5f2] text-stone-900 antialiased">{children}</body>
    </html>
  );
}
