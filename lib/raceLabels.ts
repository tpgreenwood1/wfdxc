export const YEAR_GROUP_ORDER = ["reception", "y1", "y2", "y3", "y4", "y5", "y6"];

/** Girls run before boys on race day, so every race list shows girls first. */
export const GENDER_ORDER = ["girls", "boys"];

/** Reception → Y6, girls before boys within a year group — the order every
 * race list (school page, admin board, Prev / Next race) shows. Sorts in place. */
export function sortRaces<T extends { yearGroup: string; gender: string }>(list: T[]): T[] {
  return list.sort((a, b) => {
    const yearDiff =
      YEAR_GROUP_ORDER.indexOf(a.yearGroup) - YEAR_GROUP_ORDER.indexOf(b.yearGroup);
    if (yearDiff !== 0) return yearDiff;
    return GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender);
  });
}

export function raceLabel(race: { yearGroup: string; gender: string }): string {
  const year = race.yearGroup === "reception" ? "Reception" : race.yearGroup.toUpperCase();
  return `${year} ${race.gender === "boys" ? "Boys" : "Girls"}`;
}
