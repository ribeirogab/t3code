import { describe, expect, it } from "vite-plus/test";

import { matchesForkSettingsSearch } from "./forkSettingsSearch.logic";

const entry = {
  title: "Pause goal",
  description: "Add Pause next to a goal's Clear.",
  searchTerms: ["fork goal pause resume stop hook"],
};

describe("matchesForkSettingsSearch", () => {
  it.each([
    ["", true],
    ["   ", true],
    ["pause", true],
    ["CLEAR", true],
    ["hook", true],
    ["Paüse", true],
    ["clear hook", true],
    ["clear sidebar", false],
    ["sidebar", false],
  ])("query %j matches: %s", (query, expected) => {
    expect(matchesForkSettingsSearch(query, entry)).toBe(expected);
  });
});
