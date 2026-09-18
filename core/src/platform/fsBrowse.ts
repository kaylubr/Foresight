import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BrowseEntry, BrowseResult } from "../../../shared/types";
import { pathExists } from "./fsutil";

const MAX_ENTRIES = 500;

interface MountParent {
  path: string;
  driveLabels?: boolean;
  hide?: string[];
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

function parentOf(path: string): string | null {
  const parent = dirname(path);
  return parent === path ? null : parent;
}

export async function rootsFrom(parents: MountParent[], home: string): Promise<BrowseEntry[]> {
  const candidates: Array<{ name: string; path: string }> = [
    { name: "Home", path: home },
    { name: "/", path: "/" }
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

export async function browseRoots(): Promise<BrowseEntry[]> {
  return rootsFrom(MOUNT_PARENTS, homedir());
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

export async function listDirectories(dir: string, includeHidden = false): Promise<BrowseResult> {
  const path = resolve(dir);
  const names = await directoryNames(path, includeHidden);
  const truncated = names.length > MAX_ENTRIES;
  const entries = await Promise.all(
    names.slice(0, MAX_ENTRIES).map(async (name) => {
      const child = join(path, name);
      return { name, path: child, isRepo: await isRepository(child) };
    })
  );
  return { path, parent: parentOf(path), truncated, entries };
}

export async function browse(target: string | null, includeHidden = false): Promise<BrowseResult> {
  if (target === null || target.trim().length === 0) {
    return { path: null, parent: null, truncated: false, entries: await browseRoots() };
  }
  return listDirectories(target, includeHidden);
}
