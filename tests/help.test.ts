import { describe, expect, it } from "vitest";
import { HELP_GUIDES, HELP_ORDER, type HelpTopic } from "@/lib/help";

describe("help guides", () => {
  const topics = Object.keys(HELP_GUIDES) as HelpTopic[];

  it("lists every guide exactly once on the /help page", () => {
    expect([...HELP_ORDER].sort()).toEqual([...topics].sort());
  });

  it.each(topics)("%s has a title, summary and at least one step", (topic) => {
    const guide = HELP_GUIDES[topic];
    expect(guide.title.trim()).not.toBe("");
    expect(guide.summary.trim()).not.toBe("");
    expect(guide.steps.length).toBeGreaterThan(0);
    for (const step of guide.steps) expect(step.trim()).not.toBe("");
  });
});
