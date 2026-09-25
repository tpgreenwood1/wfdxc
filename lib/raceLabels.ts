export const YEAR_GROUP_ORDER = ["reception", "y1", "y2", "y3", "y4", "y5", "y6"];

/** Reception → Y6, boys before girls within a year group — the order every
 * race list (hub, links grid, school home page) shows. Sorts in place. */
export function sortRaces<T extends { yearGroup: string; gender: string }>(list: T[]): T[] {
  return list.sort((a, b) => {
    const yearDiff =
      YEAR_GROUP_ORDER.indexOf(a.yearGroup) - YEAR_GROUP_ORDER.indexOf(b.yearGroup);
    if (yearDiff !== 0) return yearDiff;
    return a.gender.localeCompare(b.gender);
  });
}

export function raceLabel(race: { yearGroup: string; gender: string }): string {
  const year = race.yearGroup === "reception" ? "Reception" : race.yearGroup.toUpperCase();
  return `${year} ${race.gender === "boys" ? "Boys" : "Girls"}`;
}
