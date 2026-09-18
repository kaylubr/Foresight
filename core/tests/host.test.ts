import { describe, expect, it } from "vitest";
import { filesystemRootName } from "../src/platform/host";

describe("filesystemRootName", () => {
  it("names the WSL filesystem from a distro name", () => {
    expect(filesystemRootName({ distroName: "Ubuntu", version: "Linux 6.6 generic" })).toBe(
      "WSL filesystem"
    );
  });

  it("names the WSL filesystem from a microsoft kernel string", () => {
    expect(
      filesystemRootName({
        distroName: undefined,
        version: "Linux 6.6.114.1-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC"
      })
    ).toBe("WSL filesystem");
  });

  it("falls back to a plain filesystem", () => {
    expect(filesystemRootName({ distroName: undefined, version: "Linux 6.6 generic" })).toBe(
      "Filesystem"
    );
  });
});
