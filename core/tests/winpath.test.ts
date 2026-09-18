import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromWindowsPath, mountedWindowsPath, windowsMount } from "../src/platform/winpath";

describe("fromWindowsPath", () => {
  it("maps a drive-letter path onto its mount point", () => {
    expect(fromWindowsPath("C:\\Users\\kyle\\code")).toBe("/mnt/c/Users/kyle/code");
  });

  it("accepts forward slashes and a lower-case drive", () => {
    expect(fromWindowsPath("d:/work/repo")).toBe("/mnt/d/work/repo");
  });

  it("leaves a native path untouched", () => {
    expect(fromWindowsPath("/home/kyle/repo")).toBe("/home/kyle/repo");
  });

  it("leaves a drive-relative path untouched", () => {
    expect(fromWindowsPath("C:foo")).toBe("C:foo");
  });
});

describe("windowsMount", () => {
  it("returns the mount for a drive-letter path", () => {
    expect(windowsMount("C:\\Users\\kyle")).toBe("/mnt/c");
  });

  it("lower-cases the drive letter", () => {
    expect(windowsMount("D:/work")).toBe("/mnt/d");
  });

  it("returns null for a native path", () => {
    expect(windowsMount("/home/kyle/repo")).toBeNull();
  });

  it("returns null for a drive-relative path", () => {
    expect(windowsMount("C:foo")).toBeNull();
  });
});

describe("mountedWindowsPath", () => {
  it("leaves a native path untouched", async () => {
    expect(await mountedWindowsPath("/home/kyle/repo")).toBe("/home/kyle/repo");
  });

  it("leaves a drive untouched when its mount is absent", async () => {
    expect(await mountedWindowsPath("Q:\\nope")).toBe("Q:\\nope");
  });

  it.runIf(existsSync("/mnt/c"))("translates a drive whose mount exists", async () => {
    expect(await mountedWindowsPath("C:\\Users")).toBe("/mnt/c/Users");
  });
});
