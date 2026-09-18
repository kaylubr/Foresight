import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { browse, listDirectories, rootsFrom, trailFor } from "../src/platform/fsBrowse";
import { readMountTable } from "../src/platform/mounts";

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

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const hasMountTable = existsSync("/proc/mounts");

afterAll(() => {
  for (const dir of created) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("browse", () => {
  it("offers the home directory and the filesystem root when no target is given", async () => {
    const listing = await browse(null);
    expect(listing.path).toBeNull();
    expect(listing.trail).toEqual([]);
    const paths = listing.entries.map((entry) => entry.path);
    expect(paths).toContain(homedir());
    expect(paths).toContain("/");
  });

  it.runIf(hasMountTable)("offers only paths the mount table reports as mounted", async () => {
    const listing = await browse(null);
    const table = await readMountTable();
    const volumes = listing.entries
      .map((entry) => entry.path)
      .filter((path) => path !== homedir() && path !== "/");
    for (const volume of volumes) {
      expect(table.has(volume)).toBe(true);
    }
  });

  it("returns a trail from the roots screen down to the current folder", async () => {
    const root = makeTree();
    const listing = await browse(root);
    expect(listing.trail[0]).toEqual({ label: "Roots", path: null });
    expect(listing.trail[1].path).toBe("/");
    expect(listing.trail[listing.trail.length - 1].path).toBe(root);
  });
});

describe("rootsFrom", () => {
  it("always starts from the home directory and the named filesystem root", async () => {
    const roots = await rootsFrom([], "/home/kyle", "Filesystem", []);
    expect(roots.map((entry) => entry.path)).toEqual(["/home/kyle", "/"]);
    expect(roots.map((entry) => entry.name)).toEqual(["Home", "Filesystem"]);
  });

  it("names the filesystem root for the host", async () => {
    const roots = await rootsFrom([], "/home/kyle", "WSL filesystem", []);
    expect(roots[1].name).toBe("WSL filesystem");
  });

  it("offers a volume that is a direct child of a mount parent", async () => {
    const roots = await rootsFrom(
      [{ path: "/mnt", driveLabels: true }],
      "/home/kyle",
      "Filesystem",
      ["/mnt/c"]
    );
    expect(roots.map((entry) => entry.path)).toContain("/mnt/c");
    expect(roots.map((entry) => entry.name)).toContain("C:");
  });

  it("labels a volume by its name when the parent does not label drives", async () => {
    const roots = await rootsFrom([{ path: "/Volumes" }], "/home/kyle", "Filesystem", [
      "/Volumes/Backup"
    ]);
    expect(roots.map((entry) => entry.name)).toContain("Backup");
  });

  it("drops a mount point nested below a parent", async () => {
    const roots = await rootsFrom(
      [{ path: "/mnt", driveLabels: true }],
      "/home/kyle",
      "Filesystem",
      ["/mnt/c/Users"]
    );
    expect(roots.map((entry) => entry.path)).toEqual(["/home/kyle", "/"]);
  });

  it("drops a mount point that is not under a parent", async () => {
    const roots = await rootsFrom([{ path: "/mnt" }], "/home/kyle", "Filesystem", ["/opt/data"]);
    expect(roots.map((entry) => entry.path)).toEqual(["/home/kyle", "/"]);
  });
});

describe("trailFor", () => {
  it("starts at the roots screen and names the filesystem root", () => {
    expect(trailFor("/home/kyle", "Filesystem")).toEqual([
      { label: "Roots", path: null },
      { label: "Filesystem", path: "/" },
      { label: "home", path: "/home" },
      { label: "kyle", path: "/home/kyle" }
    ]);
  });

  it("stops at the filesystem root when it is the current folder", () => {
    expect(trailFor("/", "WSL filesystem")).toEqual([
      { label: "Roots", path: null },
      { label: "WSL filesystem", path: "/" }
    ]);
  });
});

describe("listDirectories", () => {
  it("lists child directories, hides dotfolders, and marks repositories", async () => {
    const root = makeTree();
    const listing = await listDirectories(root);
    expect(listing.path).toBe(root);
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
