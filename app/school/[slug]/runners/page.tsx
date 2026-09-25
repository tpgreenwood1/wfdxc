import { loadSchoolForPage } from "@/lib/schoolAccess";
import { getSchoolRoster } from "@/lib/results";
import CodeGate from "../CodeGate";
import RosterManager from "../RosterManager";

export const dynamic = "force-dynamic";

export default async function SchoolRunnersPage({ params }: { params: { slug: string } }) {
  const { school, hasAccess } = await loadSchoolForPage(params.slug);
  if (!hasAccess) return <CodeGate slug={school.slug} />;

  const roster = await getSchoolRoster(school.id, { includeRetired: true });
  return <RosterManager slug={school.slug} initialRoster={roster} />;
}
