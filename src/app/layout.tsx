import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reels Generator — YouTube to vertical clips",
  description:
    "Turn a YouTube video into vertical short-form clips with captions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Leader-tape strip: a small, domain-honest brand detail. */}
        <div aria-hidden className="h-[3px] w-full bg-primary" />
        {children}
      </body>
    </html>
  );
}
