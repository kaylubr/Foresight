import { readFile } from "node:fs/promises";

export interface HostSignals {
  distroName: string | undefined;
  version: string;
}

export function filesystemRootName(signals: HostSignals): string {
  if (signals.distroName) {
    return "WSL filesystem";
  }
  return /microsoft/i.test(signals.version) ? "WSL filesystem" : "Filesystem";
}

async function readKernelVersion(): Promise<string> {
  try {
    return await readFile("/proc/version", "utf8");
  } catch {
    return "";
  }
}

export async function readFilesystemRootName(): Promise<string> {
  return filesystemRootName({
    distroName: process.env.WSL_DISTRO_NAME,
    version: await readKernelVersion()
  });
}
