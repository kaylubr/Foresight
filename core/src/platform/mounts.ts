import { readFile } from "node:fs/promises";

const VIRTUAL_FILESYSTEMS = new Set([
  "autofs",
  "bpf",
  "cgroup",
  "cgroup2",
  "configfs",
  "debugfs",
  "devpts",
  "devtmpfs",
  "efivarfs",
  "fusectl",
  "hugetlbfs",
  "mqueue",
  "nsfs",
  "overlay",
  "proc",
  "pstore",
  "ramfs",
  "rpc_pipefs",
  "securityfs",
  "sysfs",
  "tmpfs",
  "tracefs"
]);

const ESCAPES: Record<string, string> = {
  "040": " ",
  "011": "\t",
  "012": "\n",
  "134": "\\"
};

function unescape(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (match, code: string) => ESCAPES[code] ?? match);
}

export function parseMountTable(text: string): Map<string, string> {
  const mounts = new Map<string, string>();
  for (const line of text.split("\n")) {
    const parts = line.split(" ");
    if (parts.length < 3) {
      continue;
    }
    mounts.set(unescape(parts[1]), parts[2]);
  }
  return mounts;
}

export function isVirtualFilesystem(type: string): boolean {
  return VIRTUAL_FILESYSTEMS.has(type);
}

export async function readMountTable(): Promise<Map<string, string>> {
  try {
    return parseMountTable(await readFile("/proc/mounts", "utf8"));
  } catch {
    return new Map<string, string>();
  }
}
