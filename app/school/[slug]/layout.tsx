import { loadSchoolForPage } from "@/lib/schoolAccess";
import SchoolTabs from "./SchoolTabs";

export const dynamic = "force-dynamic";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { school, hasAccess } = await loadSchoolForPage(params.slug);

  return (
    <div className="mx-auto max-w-md px-4 pb-12">
      <header className="pb-3 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          School home
        </p>
        <h1 className="text-2xl font-bold leading-tight">{school.name}</h1>
      </header>
      {hasAccess && <SchoolTabs slug={school.slug} />}
      <main className="pt-4">{children}</main>
    </div>
  );
}
