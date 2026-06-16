import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: {
    default:  "clipto — Internet shortcut for sharing anything",
    template: "%s · clipto",
  },
  description:
    "Share text snippets, files up to 100 MB, and short links instantly — no sign-up required.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type:      "website",
    siteName:  "clipto",
    title:     "clipto — Internet shortcut for sharing anything",
    description: "Share text, files & links instantly. No accounts, no friction.",
    url:       APP_URL,
  },
  twitter: {
    card:        "summary",
    title:       "clipto",
    description: "Share text, files & links instantly. No accounts, no friction.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
