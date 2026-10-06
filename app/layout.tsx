import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/app-shell/sidebar";
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
  title: "Trading Journal",
  description: "Personal futures trading journal",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
