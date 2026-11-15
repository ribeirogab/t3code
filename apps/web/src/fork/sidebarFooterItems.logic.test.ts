import { describe, expect, it } from "vite-plus/test";

import { sidebarFooterItemVisible } from "./sidebarFooterItems.logic";

describe("sidebarFooterItemVisible", () => {
  it.each([
    [true, {}, "fork", true],
    [true, { sidebarFooterFork: false }, "fork", false],
    [false, {}, "fork", false],
    [true, {}, "usage", true],
    [true, { sidebarFooterUsage: false }, "usage", false],
    [false, { sidebarFooterUsage: false }, "usage", true],
    [true, { sidebarFooterPullRequests: false }, "pullRequests", false],
    [false, { sidebarFooterPullRequests: false }, "pullRequests", true],
  ] as const)("master %s, features %j: %s visible is %s", (master, features, item, expected) => {
    expect(sidebarFooterItemVisible({ master, features }, item)).toBe(expected);
  });
});
