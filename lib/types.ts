export type YearGroup = "reception" | "y1" | "y2" | "y3" | "y4" | "y5" | "y6";
export type Gender = "boys" | "girls";
export type RaceStatus = "open" | "closed" | "cancelled";

export type ResultRow = {
  runnerId: string;
  runnerName: string;
  schoolId: string;
  schoolName: string;
  position: number;
};

export type IndividualResult = ResultRow;

export type TeamResult = {
  schoolId: string;
  schoolName: string;
  scoringCount: number;
  scoreSum: number;
  rank: number;
};

export type StandingsRow = {
  runnerId: string;
  runnerName: string;
  racesCompleted: number;
  total: number;
};
