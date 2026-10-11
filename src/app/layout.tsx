import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "APM Servicetools",
  description:
    "Techniker Finder, Technikerauswertung, Disposition, SLA Auswertung, Meetings, Wissensassistent und Verwaltung.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${manrope.variable} ${syne.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
