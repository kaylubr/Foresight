import { describe, expect, it } from "vitest";
import { isVirtualFilesystem, parseMountTable } from "../src/platform/mounts";

const TABLE = [
  "C:\\134 /mnt/c 9p rw,noatime,aname=drvfs;path=C:\\;uid=1000 0 0",
  "none /mnt/wsl tmpfs rw,relatime 0 0",
  "/dev/sda1 /media/kyle/My\\040Disk ext4 rw,relatime 0 0",
  "none /proc proc rw,nosuid,nodev 0 0"
].join("\n");

describe("parseMountTable", () => {
  it("maps each mount point to its filesystem type", () => {
    const table = parseMountTable(TABLE);
    expect(table.get("/mnt/c")).toBe("9p");
    expect(table.get("/mnt/wsl")).toBe("tmpfs");
    expect(table.get("/proc")).toBe("proc");
  });

  it("unescapes a space in a mount point", () => {
    expect(parseMountTable(TABLE).get("/media/kyle/My Disk")).toBe("ext4");
  });

  it("ignores lines it cannot read", () => {
    expect(parseMountTable("garbage\n\n").size).toBe(0);
  });
});

describe("isVirtualFilesystem", () => {
  it("rejects pseudo filesystems", () => {
    expect(isVirtualFilesystem("tmpfs")).toBe(true);
    expect(isVirtualFilesystem("overlay")).toBe(true);
    expect(isVirtualFilesystem("proc")).toBe(true);
  });

  it("accepts storage filesystems", () => {
    expect(isVirtualFilesystem("9p")).toBe(false);
    expect(isVirtualFilesystem("ext4")).toBe(false);
  });
});
