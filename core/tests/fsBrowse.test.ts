import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { browse, browseRoots, listDirectories, rootsFrom } from "../src/platform/fsBrowse";

const created: string[] = [];

function makeTree(): string {
  const root = mkdtempSync(join(tmpdir(), "foresight-browse-"));
  created.push(root);
  mkdirSync(join(root, "alpha"));
  mkdirSync(join(root, "beta"));
  mkdirSync(join(root, ".hidden"));
  mkdirSync(join(root, "repo"));
  mkdirSync(join(root, "repo", ".git"));
  return root;
}

function makeMountParent(...names: string[]): string {
  const parent = mkdtempSync(join(tmpdir(), "foresight-mount-"));
  created.push(parent);
  for (const name of names) {
    mkdirSync(join(parent, name));
  }
  return parent;
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("browseRoots", () => {
  it("offers the home directory and the filesystem root", async () => {
    const paths = (await browseRoots()).map((entry) => entry.path);
    expect(paths).toContain(homedir());
    expect(paths).toContain("/");
  });

  it("returns the roots when no target is given", async () => {
    const listing = await browse(null);
    expect(listing.path).toBeNull();
    expect(listing.parent).toBeNull();
    expect(listing.entries.map((entry) => entry.path)).toContain(homedir());
  });
});

describe("rootsFrom", () => {
  it("always starts from the home directory and the filesystem root", async () => {
    const paths = (await rootsFrom([], "/home/kyle")).map((entry) => entry.path);
    expect(paths).toEqual(["/home/kyle", "/"]);
  });

  it("offers a volume-shaped parent's children verbatim", async () => {
    const parent = makeMountParent("Backup", "C", "Macintosh HD");
    const names = (await rootsFrom([{ path: parent }], "/home/kyle")).map((entry) => entry.name);
    expect(names).toContain("Backup");
    expect(names).toContain("Macintosh HD");
    expect(names).toContain("C");
    expect(names).not.toContain("C:");
  });

  it("labels single letters as drives when the parent asks for it", async () => {
    const parent = makeMountParent("c", "d");
    const names = (await rootsFrom([{ path: parent, driveLabels: true }], "/home/kyle")).map(
      (entry) => entry.name
    );
    expect(names).toContain("C:");
    expect(names).toContain("D:");
    expect(names).not.toContain("c");
  });

  it("hides the names a parent asks to hide", async () => {
    const parent = makeMountParent("c", "wsl", "wslg");
    const roots = await rootsFrom(
      [{ path: parent, driveLabels: true, hide: ["wsl", "wslg"] }],
      "/home/kyle"
    );
    expect(roots.map((entry) => entry.name)).toEqual(["Home", "/", "C:"]);
  });

  it("ignores a mount parent that does not exist", async () => {
    const parent = makeMountParent();
    const paths = (await rootsFrom([{ path: join(parent, "absent") }], "/home/kyle")).map(
      (entry) => entry.path
    );
    expect(paths).toEqual(["/home/kyle", "/"]);
  });
});

describe("listDirectories", () => {
  it("lists child directories, hides dotfolders, and marks repositories", async () => {
    const root = makeTree();
    const listing = await listDirectories(root);
    expect(listing.path).toBe(root);
    expect(listing.parent).toBe(tmpdir());
    expect(listing.truncated).toBe(false);
    expect(listing.entries.map((entry) => entry.name)).toEqual(["alpha", "beta", "repo"]);
    expect(listing.entries.find((entry) => entry.name === "repo")?.isRepo).toBe(true);
    expect(listing.entries.find((entry) => entry.name === "alpha")?.isRepo).toBe(false);
  });

  it("includes dotfolders when asked", async () => {
    const root = makeTree();
    const listing = await listDirectories(root, true);
    expect(listing.entries.map((entry) => entry.name)).toEqual([".hidden", "alpha", "beta", "repo"]);
  });

  it("caps a very large directory and says so", async () => {
    const root = mkdtempSync(join(tmpdir(), "foresight-browse-many-"));
    created.push(root);
    for (let index = 0; index < 505; index += 1) {
      mkdirSync(join(root, `dir-${String(index).padStart(3, "0")}`));
    }
    const listing = await listDirectories(root);
    expect(listing.truncated).toBe(true);
    expect(listing.entries).toHaveLength(500);
  });

  it("reports no parent at the filesystem root", async () => {
    const listing = await listDirectories("/");
    expect(listing.path).toBe("/");
    expect(listing.parent).toBeNull();
  });

  it("fails loud on a directory it cannot read", async () => {
    const missing = join(makeTree(), "nope");
    await expect(listDirectories(missing)).rejects.toThrow(`cannot read directory: ${missing}`);
  });

  it.runIf(!isRoot)("fails loud on a directory without permission", async () => {
    const locked = join(makeTree(), "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      await expect(listDirectories(locked)).rejects.toThrow(`cannot read directory: ${locked}`);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});
