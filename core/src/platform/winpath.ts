import { pathExists } from "./fsutil";

const WINDOWS_PATH = /^([A-Za-z]):[\\/](.*)$/;

export function windowsMount(input: string): string | null {
  const match = WINDOWS_PATH.exec(input);
  return match === null ? null : `/mnt/${match[1].toLowerCase()}`;
}

export function fromWindowsPath(input: string): string {
  const match = WINDOWS_PATH.exec(input);
  if (match === null) {
    return input;
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

export async function mountedWindowsPath(input: string): Promise<string> {
  const mount = windowsMount(input);
  if (mount === null || !(await pathExists(mount))) {
    return input;
  }
  return fromWindowsPath(input);
}
