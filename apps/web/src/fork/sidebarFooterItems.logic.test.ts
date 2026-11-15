import { describe, expect, it } from "vite-plus/test";

import { sidebarFooterItemVisible } from "./sidebarFooterItems.logic";

describe("sidebarFooterItemVisible", () => {
  it.each([
    [true, {}, "fork", true],
    [true, { sidebarFooterFork: false }, "fork", false],
    [false, {}, "fork", false],
    [true, {}, "usage", true],
    [true, { hideSidebarFooterUsage: true }, "usage", false],
    [false, { hideSidebarFooterUsage: true }, "usage", true],
    [true, { sidebarFooterUsage: false }, "usage", false],
    [true, {}, "pullRequests", true],
    [true, { hideSidebarFooterPullRequests: true }, "pullRequests", false],
    [false, { hideSidebarFooterPullRequests: true }, "pullRequests", true],
  ] as const)("master %s, features %j: %s visible is %s", (master, features, item, expected) => {
    expect(sidebarFooterItemVisible({ master, features }, item)).toBe(expected);
  });
});
