import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { BrowseEntry, BrowseResult, BrowseTrailEntry } from "../../../shared/types";
import { pathExists } from "./fsutil";
import { readFilesystemRootName } from "./host";

const MAX_ENTRIES = 500;

interface MountParent {
  path: string;
  driveLabels?: boolean;
  hide?: string[];
}

interface BrowseListing {
  path: string;
  truncated: boolean;
  entries: BrowseEntry[];
}

const MOUNT_PARENTS: MountParent[] = [
  { path: "/mnt", driveLabels: true, hide: ["wsl", "wslg"] },
  { path: "/media" },
  { path: "/run/media" },
  { path: "/Volumes" }
];

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function isRepository(path: string): Promise<boolean> {
  return pathExists(join(path, ".git"));
}

async function childDirectoryNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function driveLabel(name: string): string {
  return /^[a-z]$/i.test(name) ? `${name.toUpperCase()}:` : name;
}

export async function rootsFrom(
  parents: MountParent[],
  home: string,
  rootName: string
): Promise<BrowseEntry[]> {
  const candidates: Array<{ name: string; path: string }> = [
    { name: "Home", path: home },
    { name: rootName, path: "/" }
  ];
  for (const parent of parents) {
    for (const name of await childDirectoryNames(parent.path)) {
      if (parent.hide?.includes(name)) {
        continue;
      }
      candidates.push({
        name: parent.driveLabels ? driveLabel(name) : name,
        path: join(parent.path, name)
      });
    }
  }
  const seen = new Set<string>();
  const roots: BrowseEntry[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    roots.push({ ...candidate, isRepo: await isRepository(candidate.path) });
  }
  return roots;
}

export function trailFor(path: string, rootName: string): BrowseTrailEntry[] {
  const trail: BrowseTrailEntry[] = [
    { label: "Roots", path: null },
    { label: rootName, path: "/" }
  ];
  let current = "";
  for (const segment of path.split("/").filter((part) => part.length > 0)) {
    current = `${current}/${segment}`;
    trail.push({ label: segment, path: current });
  }
  return trail;
}

async function directoryNames(dir: string, includeHidden: boolean): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`cannot read directory: ${dir}`);
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() || (entry.isSymbolicLink() && (await isDirectory(join(dir, entry.name))))) {
      names.push(entry.name);
    }
  }
  const visible = includeHidden ? names : names.filter((name) => !name.startsWith("."));
  return visible.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export async function listDirectories(dir: string, includeHidden = false): Promise<BrowseListing> {
  const path = resolve(dir);
  const names = await directoryNames(path, includeHidden);
  const truncated = names.length > MAX_ENTRIES;
  const entries = await Promise.all(
    names.slice(0, MAX_ENTRIES).map(async (name) => {
      const child = join(path, name);
      return { name, path: child, isRepo: await isRepository(child) };
    })
  );
  return { path, truncated, entries };
}

export async function browse(target: string | null, includeHidden = false): Promise<BrowseResult> {
  const rootName = await readFilesystemRootName();
  if (target === null || target.trim().length === 0) {
    return {
      path: null,
      truncated: false,
      trail: [],
      entries: await rootsFrom(MOUNT_PARENTS, homedir(), rootName)
    };
  }
  const listing = await listDirectories(target, includeHidden);
  return { ...listing, trail: trailFor(listing.path, rootName) };
}
