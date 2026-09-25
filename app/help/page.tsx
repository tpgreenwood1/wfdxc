import Link from "next/link";
import { HELP_GUIDES, HELP_ORDER } from "@/lib/help";
import HelpGuideView from "@/app/components/HelpGuideView";

export const metadata = { title: "Help · XC League" };

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4 pb-12">
      <h1 className="text-2xl font-bold">Help</h1>
      <nav aria-label="Guides" className="rounded-lg border p-3">
        <ul className="space-y-1">
          {HELP_ORDER.map((topic) => (
            <li key={topic}>
              <Link className="inline-flex min-h-[36px] items-center text-blue-600 underline" href={`#${topic}`}>
                {HELP_GUIDES[topic].title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {HELP_ORDER.map((topic) => (
        <HelpGuideView key={topic} id={topic} guide={HELP_GUIDES[topic]} />
      ))}
    </main>
  );
}
