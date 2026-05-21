import { describe, expect, it } from "vitest";
import { filterActionItemsBySearchTerms, parseSearchTerms, type ActionSearchItem } from "./search-utils";

const actionItems: ActionSearchItem[] = [
  {
    id: "create-worktree",
    title: "Create Worktree",
    keywords: ["worktree", "workspace", "create workspace", "new"],
  },
  {
    id: "repository-settings",
    title: "Repository Settings",
    keywords: ["settings", "repository"],
  },
];

describe("filterActionItemsBySearchTerms", () => {
  it("検索語が空なら全アクションを返す", () => {
    const terms = parseSearchTerms("");
    const result = filterActionItemsBySearchTerms(actionItems, terms);
    expect(result.map((item) => item.id)).toEqual(["create-worktree", "repository-settings"]);
  });

  it("workspace で Create Worktree がヒットする", () => {
    const terms = parseSearchTerms("workspace");
    const result = filterActionItemsBySearchTerms(actionItems, terms);
    expect(result.map((item) => item.id)).toEqual(["create-worktree"]);
  });

  it("repository settings で Repository Settings がヒットする", () => {
    const terms = parseSearchTerms("repository settings");
    const result = filterActionItemsBySearchTerms(actionItems, terms);
    expect(result.map((item) => item.id)).toEqual(["repository-settings"]);
  });

  it("トークンが別アクションに分散するとヒットしない", () => {
    const terms = parseSearchTerms("worktree settings");
    const result = filterActionItemsBySearchTerms(actionItems, terms);
    expect(result).toEqual([]);
  });
});
