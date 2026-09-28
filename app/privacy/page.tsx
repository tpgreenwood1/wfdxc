export const metadata = { title: "Privacy · XC League" };

/** A paragraph, or a bulleted list (an array of items). */
type Block = string | string[];

const SECTIONS: { title: string; blocks: Block[] }[] = [
  {
    title: "Who we are",
    blocks: [
      "This site records and displays results for the Wharfedale Schools Cross Country League. It was built and is run by a parent volunteer, with the agreement and authority of the event organisers, who are responsible for the information it holds (the data controller).",
    ],
  },
  {
    title: "What we hold",
    blocks: [
      "For each child who runs, we hold only:",
      [
        "their name;",
        "their school;",
        "their year group and race (boys or girls); and",
        "their finishing position.",
      ],
      "This comes from the teachers at each child's school, who enter it after each event. We don't collect children's addresses, contact details, dates of birth, medical information, photographs, location data or any other sensitive information.",
    ],
  },
  {
    title: "What is public",
    blocks: [
      'Results and league standings on this site show each runner by first name and surname initial only (for example "Sam T."), with their school and position. The event organisers already publish the event results.',
      "Full names are only visible to the league organisers and to teachers, who can see the full names of their own school's runners. So that a child who moves school can still be recorded correctly, teachers can also look up a runner from another school by name.",
      "The site asks search engines not to index its pages.",
    ],
  },
  {
    title: "Why we use it",
    blocks: [
      "Only to score races, publish results and work out the season standings for the league. There is no profiling, tracking, advertising or marketing, and the information is never used to contact children.",
    ],
  },
  {
    title: "Who can see it",
    blocks: [
      "The league organisers, and teachers for their own school's runners, as described above. The parent volunteer who runs the site has access only to maintain and administer it, and won't use the information for anything else.",
      "We don't share or sell the information to anyone else. Data is stored securely.",
    ],
  },
  {
    title: "How long we keep it",
    blocks: [
      "Results are kept indefinitely as the league's historical record, unless you ask us to remove them (see below).",
    ],
  },
  {
    title: "Your choices",
    blocks: [
      "You can ask what information we hold about your child, ask for it to be corrected or removed, or ask for your child's results not to be shown publicly. Please contact Ilkley Harriers and we'll deal with it promptly.",
      "If you're unhappy with how your child's information has been handled, you can also complain to the Information Commissioner's Office (ico.org.uk).",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-12">
      <h1 className="text-2xl font-bold">Privacy notice</h1>
      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.blocks.map((block, i) =>
            typeof block === "string" ? (
              <p key={i}>{block}</p>
            ) : (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {block.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </main>
  );
}
