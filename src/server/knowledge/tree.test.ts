import { describe, expect, it } from "vitest";
import {
  flattenWikiTree,
  getWikiBreadcrumbs,
  getWikiParentOptions,
} from "./tree";

const pages = [
  { id: "root", parentId: null, title: "Root" },
  { id: "child", parentId: "root", title: "Child" },
  { id: "leaf", parentId: "child", title: "Leaf" },
  { id: "other", parentId: null, title: "Other" },
];

describe("Wiki tree helpers", () => {
  it("flattens the tree with nesting depth", () => {
    expect(flattenWikiTree(pages)).toEqual([
      { ...pages[0], depth: 0 },
      { ...pages[1], depth: 1 },
      { ...pages[2], depth: 2 },
      { ...pages[3], depth: 0 },
    ]);
  });

  it("excludes a page and its descendants from parent choices", () => {
    expect(getWikiParentOptions(pages, "child").map((page) => page.id)).toEqual([
      "root",
      "other",
    ]);
  });

  it("builds breadcrumbs from root to the active page", () => {
    expect(getWikiBreadcrumbs(pages, "leaf").map((page) => page.id)).toEqual([
      "root",
      "child",
      "leaf",
    ]);
  });
});
