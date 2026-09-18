import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { BrowseEntry, BrowseResult, BrowseTrailEntry } from "../../../shared/types";
import { pathExists } from "./fsutil";
import { readFilesystemRootName } from "./host";
import { isVirtualFilesystem, readMountTable } from "./mounts";

const MAX_ENTRIES = 500;

interface MountParent {
  path: string;
  driveLabels?: boolean;
}

interface BrowseListing {
  path: string;
  truncated: boolean;
  entries: BrowseEntry[];
}

function mountParents(home: string): MountParent[] {
  const user = basename(home);
  return [
    { path: "/mnt", driveLabels: true },
    { path: "/media" },
    { path: join("/media", user) },
    { path: "/run/media" },
    { path: join("/run/media", user) },
    { path: "/Volumes" }
  ];
}

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

function directParent(parents: MountParent[], path: string): MountParent | null {
  const parent = dirname(path);
  return parents.find((candidate) => candidate.path === parent) ?? null;
}

async function mountedChildren(parent: string): Promise<string[]> {
  let parentDevice: number;
  try {
    parentDevice = (await stat(parent)).dev;
  } catch {
    return [];
  }
  const volumes: string[] = [];
  for (const name of await childDirectoryNames(parent)) {
    const child = join(parent, name);
    try {
      if ((await stat(child)).dev !== parentDevice) {
        volumes.push(child);
      }
    } catch {
      continue;
    }
  }
  return volumes;
}

export async function volumeMounts(parents: MountParent[]): Promise<string[]> {
  const table = await readMountTable();
  if (table.size === 0) {
    const volumes: string[] = [];
    for (const parent of parents) {
      volumes.push(...(await mountedChildren(parent.path)));
    }
    return volumes;
  }
  const parentsByPath = new Set(parents.map((parent) => parent.path));
  const volumes: string[] = [];
  for (const [point, type] of table) {
    if (parentsByPath.has(dirname(point)) && !isVirtualFilesystem(type)) {
      volumes.push(point);
    }
  }
  return volumes;
}

export async function rootsFrom(
  parents: MountParent[],
  home: string,
  rootName: string,
  volumes: string[]
): Promise<BrowseEntry[]> {
  const seen = new Set<string>([home, "/"]);
  const candidates: Array<{ name: string; path: string }> = [];
  for (const volume of volumes) {
    const parent = directParent(parents, volume);
    if (parent === null || seen.has(volume)) {
      continue;
    }
    seen.add(volume);
    candidates.push({
      name: parent.driveLabels ? driveLabel(basename(volume)) : basename(volume),
      path: volume
    });
  }
  candidates.sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: "base" }));
  const roots: BrowseEntry[] = [
    { name: "Home", path: home, isRepo: await isRepository(home) },
    { name: rootName, path: "/", isRepo: await isRepository("/") }
  ];
  for (const candidate of candidates) {
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
  const home = homedir();
  const parents = mountParents(home);
  const rootName = await readFilesystemRootName();
  if (target === null || target.trim().length === 0) {
    return {
      path: null,
      truncated: false,
      trail: [],
      entries: await rootsFrom(parents, home, rootName, await volumeMounts(parents))
    };
  }
  const listing = await listDirectories(target, includeHidden);
  return { ...listing, trail: trailFor(listing.path, rootName) };
}
