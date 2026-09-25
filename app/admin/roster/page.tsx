import { redirect } from "next/navigation";

/** The roster / merge tool now lives on the Runners pages; keep old links working. */
export default function RosterRedirect({
  searchParams,
}: {
  searchParams: { schoolId?: string };
}) {
  redirect(
    searchParams.schoolId
      ? `/admin/runners?school=${encodeURIComponent(searchParams.schoolId)}`
      : "/admin/runners"
  );
}
