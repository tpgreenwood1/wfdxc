import type { SchoolRaceState } from "@/lib/raceSchoolStatus";

/** Shared by the race correction page and the admin "enter for a school" page. */
export const STATE_LABEL: Record<SchoolRaceState, string> = {
  done: "Done",
  no_runners: "No runners",
  entering: "Entering",
  not_started: "Nothing yet",
};

export const STATE_STYLE: Record<SchoolRaceState, string> = {
  done: "bg-green-100 text-green-800",
  no_runners: "bg-gray-100 text-gray-600",
  entering: "bg-blue-100 text-blue-800",
  not_started: "bg-amber-100 text-amber-900",
};
