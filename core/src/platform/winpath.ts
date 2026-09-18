const WINDOWS_PATH = /^([A-Za-z]):[\\/](.*)$/;

export function fromWindowsPath(input: string): string {
  const match = WINDOWS_PATH.exec(input);
  if (!match) {
    return input;
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}
