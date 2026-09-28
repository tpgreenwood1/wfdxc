import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import NavHeader from "./components/NavHeader";

export const metadata: Metadata = {
  title: "XC League",
  description: "Junior cross country league scoring",
  // Results list children by name and school — keep every page out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <NavHeader />
        {children}
        <footer className="border-t px-3 py-4 text-center text-sm print:hidden">
          <Link className="inline-flex min-h-[44px] items-center px-1 text-blue-600 underline" href="/privacy">
            Privacy
          </Link>
        </footer>
      </body>
    </html>
  );
}
