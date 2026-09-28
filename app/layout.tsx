import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
