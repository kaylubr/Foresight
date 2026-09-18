# Connecting a repository uses an in-app directory browser and translates Windows paths

The connect surface was a free-text path field, so typing a full absolute path was the only way to point Foresight at a repository. On WSL that is actively hostile: a path copied on the Windows side (`C:\Users\you\code`) is not a path the Linux-side git can resolve, and the WSL path (`/mnt/c/Users/you/code`) is tedious to type.

The browser reads directories through `GET /api/browse` and the connect form renders an inline picker over it. The browser **grants no new read capability**: `POST /api/connect` already accepts and reads any path, so the picker only removes the typing. It reads directory names and marks which children contain a `.git` entry.

The selection unit is a directory, not a repository. Marking a child as a repository is a hint, not a gate: connecting a subdirectory still resolves to the working copy's top level through `git rev-parse --show-toplevel`, which is existing behaviour and must keep working.

The picker's roots are the volumes the host actually mounts. A directory is offered only when it is a direct child of a conventional mount location (`/mnt`, `/media`, `/media/<user>`, `/run/media`, `/run/media/<user>`, `/Volumes`) and the kernel mount table lists it on a storage filesystem. A mount point directory with nothing mounted behind it is therefore not offered, which is what once presented an empty placeholder as a drive. Virtual filesystems are excluded, so the WSL-internal `wsl` and `wslg` mounts stay out without being named, and requiring a direct child keeps a nested internal mount such as `/mnt/wslg/distro` out as well. Where there is no mount table, as on macOS, a direct child is compared against its parent directory's device instead.

The filesystem root is named for what it is on the host, so under WSL it reads as the WSL filesystem rather than an ambiguous `/`. The host is observed through a distro name or the kernel string, never through `process.platform`.

Each listing carries a trail from the roots screen down to the current folder, and its first segment returns to the roots screen. That segment is the only route back: the roots screen offers the entry points, but once a folder is entered there is no other way to reach it.

A drive-letter path is translated onto its mount (`C:\Users\you\code` becomes `/mnt/c/Users/you/code`) inside `resolveRepoPath`, but only when that mount exists, so the rewrite applies on WSL and is skipped where `/mnt` is absent. The failure message still names the input **as typed**, so an input that resolves nowhere is reported honestly rather than as a confusing mount path.

## Consequences

- The picker is inline, not a modal and not a route, matching the existing sections on the working surface.
- A listing is capped, and truncation is reported rather than hidden, so a short list never claims to be complete when it is not.
- Dotfolders are hidden by default and shown on request.
- The picker starts from a roots list: the home directory, the filesystem root named for the host, and each mounted volume found under a conventional mount location, so a repository on another volume is reachable without typing a prefix.
- The trail's first segment returns to the roots screen, and the trail names every level from the filesystem root down, so entering a folder is reversible and no level of the path is hidden.
- Only the roots list filters. Browsing a mount location still lists the directories that exist there, including an empty mount point, because a listing reports what the filesystem holds rather than what is worth offering.
- Translation is gated on the mount existing. On a host without the mount the input is used unchanged, and the error names it as typed.
- macOS can browse and read repositories, because only the network-isolation sandbox is Linux-specific. Running the server natively on Windows is not supported.
- UNC paths (`\\wsl$\...`, `\\wsl.localhost\...`) are not translated; the browser reaches those repositories instead.
- This does not touch the sandbox decision in [0005](./0005-sanitized-children-no-network.md): rehearsal is still Linux-only.

## Considered Options

- The File System Access API (`showDirectoryPicker`) was rejected: it returns a handle, not a path, so it cannot feed a server that needs a path string for git.
- A native OS folder dialog was rejected: it needs a desktop shell (Tauri/Electron) or a per-OS helper, adding a runtime dependency and platform-specific code for a problem the backend can solve with `readdir`.
- A modal picker was rejected: the app has no modals and avoids them, and an inline panel matches the existing layout.
- A recent-repositories list alone was rejected: it does not help the first connection, and does not remove the typing for repositories outside the list.
- Client-side path guessing was rejected: the browser cannot see the server's filesystem.
- Branching on `process.platform` was rejected: it infers a layout from a host's identity rather than observing the host, cannot be exercised on a single machine without mocking, and guesses wrong when a host deviates from its platform default.
- Shelling out to `mount`, or writing a second mount-table parser for macOS, was rejected: the device comparison answers the same question without a second grammar to maintain, and shelling out conflicts with the no-shell rule.
- Offering every child directory of a mount location was rejected: a mount point directory can exist with nothing mounted at it, which is how an empty placeholder came to be presented as a drive.
