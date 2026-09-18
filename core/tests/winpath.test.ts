import { describe, expect, it } from "vitest";
import { fromWindowsPath } from "../src/platform/winpath";

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
