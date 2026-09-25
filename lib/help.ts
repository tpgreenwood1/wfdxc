/**
 * Short "how to" guides shown by the Help button on each page and listed on /help.
 * Pure data so the wording can be changed here without touching any page. Keep the
 * teacher guides about what to tap, not how scoring works — that lives in "scoring".
 */

export type HelpGuide = {
  title: string;
  /** One sentence on what the page is for. */
  summary: string;
  /** Numbered steps, one action each. */
  steps: string[];
  /** Extra "good to know" points, shown as a bullet list. */
  tips?: string[];
};

export const HELP_GUIDES = {
  home: {
    title: "Getting started",
    summary: "This site collects race results from schools and shows the league results.",
    steps: [
      "Teachers: tap your school's name in the list.",
      "Enter your school code — it's in the link the league organiser sent you. You only need to do this once on each phone.",
      "After that, tap Home then \"Continue to…\", or My school at the top, to go straight to your school.",
    ],
    tips: [
      "Results and Standings at the top are open to everyone — no code needed.",
      "Tap Help at the top of any page for all the guides.",
    ],
  },
  code: {
    title: "Your school code",
    summary: "Each school has a 6-letter code so only its teachers can enter results.",
    steps: [
      "Find the code in the link or message from the league organiser.",
      "Type it in the box and tap Open.",
      "This phone remembers it — you won't be asked again.",
    ],
    tips: [
      "If the link you were sent opens the page without asking, you're already in.",
      "If your code stops working, the organiser may have changed it — ask them for the new one.",
    ],
  },
  races: {
    title: "Your school's races",
    summary: "Every race at this event, with where you're up to on each one.",
    steps: [
      "Tap a race to enter your runners.",
      "If nobody from your school ran in a race, open it and tap No runners.",
      "When you've done every race, tap \"We're done\" at the bottom so the scorer knows.",
    ],
    tips: [
      "Blue \"Enter results\" means nothing's entered yet. Green means you've entered runners.",
      "Grey races are finished — tap one to see the results.",
      "Past events are listed under \"Other events this season\".",
    ],
  },
  entry: {
    title: "Entering results",
    summary: "Add each runner from your school and the place they finished.",
    steps: [
      "Nobody from your school ran? Tap No runners at the top — that's all.",
      "Under \"Add a runner\", type a runner's name and tap them in the list.",
      "Type their finishing place in the box next to their name.",
      "Repeat for each runner. Everything saves as you go — there's no Save button.",
      "When everyone's in, tap Race done at the top.",
    ],
    tips: [
      "Runner not on your list? Type their full name and tap \"+ Add new runner\".",
      "Runner moved from another school? Type their name and tap \"Search other schools\".",
      "Tap × to remove a runner you added by mistake.",
      "A green ✓ means that runner is saved. No signal? It's kept on this phone and retried.",
      "Use the \"Next\" button at the bottom to go straight to the next race.",
      "Once the scorer finalises a race it's locked — ask the scorer if something needs changing.",
    ],
  },
  runners: {
    title: "Your runners",
    summary: "Your school's list of runners, used when you enter results.",
    steps: [
      "To add a runner, type their full name and tap Add.",
      "To add lots at once, tap \"Add several\" and put one name on each line.",
      "To fix a spelling, tap Edit next to the name.",
      "If a child has left, tap Retire. Their past results are kept.",
    ],
    tips: [
      "You don't have to add everyone first — you can add new runners while entering results.",
      "Retired runners are listed under \"Retired\" at the bottom, where you can bring them back.",
    ],
  },
  schoolResults: {
    title: "Your results",
    summary: "How your school did in each finished race this season.",
    steps: [
      "Each race shows your team's place and where each of your runners finished.",
      "Tap a race to see the full results for every school.",
    ],
    tips: ["A race appears here once the scorer has finalised it."],
  },
  results: {
    title: "Race results",
    summary: "Finishing places and team scores for every finished race.",
    steps: [
      "Pick an event, then a race.",
      "You'll see every runner's place and each school's team result.",
    ],
    tips: ["How team places are worked out is explained under \"How scoring works\" in Help."],
  },
  standings: {
    title: "Season standings",
    summary: "Each runner's league position across the whole season.",
    steps: [
      "Choose the year group and boys or girls, then tap View.",
      "Runners with the lowest total are at the top.",
    ],
    tips: [
      "Runners who haven't run enough races yet are listed separately as \"Not yet qualified\".",
      "How totals are worked out is explained under \"How scoring works\" in Help.",
    ],
  },
  scoring: {
    title: "How scoring works",
    summary: "What the scorer does with the places you enter.",
    steps: [
      "Team score: each school's first 4 finishers in a race count. Their places are added up and the lowest total wins.",
      "A full team of 4 always beats a team of 3 (and 3 beats 2), whatever the totals.",
      "Season standings: for each year group, boys and girls separately, a runner's places from every race this season are added up. Lowest total wins.",
      "To qualify for the standings a runner has to run a minimum number of races, set by the league.",
    ],
    tips: [
      "If two runners are given the same place, they both keep it.",
      "Cancelled races don't count towards anyone's total.",
    ],
  },
} satisfies Record<string, HelpGuide>;

export type HelpTopic = keyof typeof HELP_GUIDES;

/** Order on the /help page: teachers' tasks first, then reading results. */
export const HELP_ORDER: HelpTopic[] = [
  "home",
  "code",
  "races",
  "entry",
  "runners",
  "schoolResults",
  "results",
  "standings",
  "scoring",
];
