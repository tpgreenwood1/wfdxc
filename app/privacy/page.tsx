export const metadata = { title: "Privacy · XC League" };

const CONTACT_NAME = "Thomas Greenwood";
const CONTACT_EMAIL = "xcwharfedale@gmail.com";

const email = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
    {CONTACT_EMAIL}
  </a>
);

/** A paragraph (text or rich content), or a bulleted list (an array of items). */
type Block = string | string[] | React.JSX.Element;

const SECTIONS: { title: string; blocks: Block[] }[] = [
  {
    title: "Who we are",
    blocks: [
      "This site records and displays results for the Wharfedale Schools Cross Country League.",
      <>
        The league and results are organised by volunteers, with teachers responsible for entering
        race day results. Data is managed by volunteers, the primary contact for which is{" "}
        {CONTACT_NAME}, {email}.
      </>,
      "If you have any questions about the information we hold, need a result corrected, or have a privacy request, please contact us using the email address above.",
    ],
  },
  {
    title: "What information we hold",
    blocks: [
      "For each child who takes part in the league, we hold only the information needed to administer the competition:",
      [
        "their name;",
        "their school;",
        "their year group and race category (boys or girls); and",
        "their finishing positions and league results.",
      ],
      "This information normally comes from teachers at the child's school, who enter or confirm it following an event.",
      "We don't collect children's addresses, contact details, dates of birth, medical information, photographs or precise location information through the results system.",
    ],
  },
  {
    title: "Why we use this information",
    blocks: [
      "We use the information only to administer the Wharfedale Schools Cross Country League. This includes identifying runners, recording and checking race results, calculating team scores and league standings, and publishing results for runners, parents and schools.",
      "Our lawful basis for doing this is legitimate interests. Our legitimate interest is running and administering the school cross-country competition accurately and making its results available to participating schools, runners and their families.",
      "Because the information relates to children, we limit both the information we collect and the information we make public.",
      "There is no advertising or marketing based on children's information, and we do not use it to profile or contact children.",
    ],
  },
  {
    title: "What is public",
    blocks: [
      "Race results and league standings are available on this website.",
      'Public results show only a runner\'s first name and surname initial (for example, "Sam T."), together with their school and race or league result.',
      "We deliberately do not publish children's full surnames on the public results website. This reduces the amount of identifying information made public while still allowing runners and their families to recognise their results.",
      "The site is also configured to ask search engines and other web crawlers not to index its pages.",
      "Full names are available only within the administration system. League organisers can access them where necessary to administer the competition. Teachers can see the full names of runners from their own school.",
      "To help correctly identify a child who has previously competed for another school, authorised teachers can also search for an existing runner by name.",
    ],
  },
  {
    title: "Who we share information with",
    blocks: [
      "Authorised league organisers and participating schools have access to information where necessary to administer and check the competition.",
      "We also use technology providers to host and operate the website and database. These providers process information on our behalf in order to provide those services.",
      "Public visitors can see only the abbreviated results described above.",
      "We do not sell children's information or share it for advertising or marketing.",
    ],
  },
  {
    title: "How long we keep information",
    blocks: [
      "A child's reusable runner record is removed if they have not competed in the league during the previous league season.",
      "Race and league results are normally retained for three years so that recent league history remains available and result queries can be resolved.",
      "After three years, identifiable results are deleted or anonymised.",
    ],
  },
  {
    title: "Your rights",
    blocks: [
      "Children have rights over their personal information under data-protection law. Depending on the circumstances, these include rights to:",
      [
        "ask what information we hold about them;",
        "obtain a copy of their information;",
        "have inaccurate information corrected;",
        "ask for information to be deleted or its use restricted; and",
        "object to how their information is being used.",
      ],
      "A parent or carer can contact us on a child's behalf where appropriate.",
    ],
  },
  {
    title: "Objecting to public results",
    blocks: [
      <>
        If you do not want your child&apos;s abbreviated name and results to appear on the public
        results website, please contact {email}.
      </>,
      "We will consider objections promptly in accordance with data-protection law.",
      "Removing a result from the public website does not necessarily mean that we must remove the underlying race result where it is still necessary to administer the competition.",
      "If information about your child is incorrect, please contact us and we will correct it.",
    ],
  },
  {
    title: "Complaints",
    blocks: [
      "If you have concerns about how we use your child's information, please contact us first so that we can investigate:",
      <>
        {CONTACT_NAME}
        <br />
        {email}
      </>,
      <>
        You also have the right to raise a concern with the{" "}
        <a href="https://ico.org.uk/make-a-complaint/" className="underline">
          Information Commissioner&apos;s Office (ICO)
        </a>
        .
      </>,
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
            Array.isArray(block) ? (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {block.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{block}</p>
            ),
          )}
        </section>
      ))}
    </main>
  );
}
