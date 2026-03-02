import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TimezoneProvider } from "@/lib/timezone-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SecOps Center",
  description: "Security Operations Center Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TimezoneProvider>{children}</TimezoneProvider>
      </body>
    </html>
  );
}
