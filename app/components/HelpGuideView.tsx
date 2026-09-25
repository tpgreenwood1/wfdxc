import type { HelpGuide } from "@/lib/help";

/** One guide's content. Used inside the Help panel and on /help, so no hooks here. */
export default function HelpGuideView({ guide, id }: { guide: HelpGuide; id?: string }) {
  return (
    <section id={id} className="space-y-2">
      <h2 className="text-lg font-semibold">{guide.title}</h2>
      <p className="text-gray-700">{guide.summary}</p>
      <ol className="list-decimal space-y-1 pl-6">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {guide.tips && guide.tips.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">Good to know</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {guide.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
