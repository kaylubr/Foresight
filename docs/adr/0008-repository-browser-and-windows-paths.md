# Connecting a repository uses an in-app directory browser and translates Windows paths

The connect surface was a free-text path field, so typing a full absolute path was the only way to point Foresight at a repository. On WSL that is actively hostile: a path copied on the Windows side (`C:\Users\you\code`) is not a path the Linux-side git can resolve, and the WSL path (`/mnt/c/Users/you/code`) is tedious to type.

The browser reads directories through `GET /api/browse` and the connect form renders an inline picker over it. The browser **grants no new read capability**: `POST /api/connect` already accepts and reads any path, so the picker only removes the typing. It reads directory names and marks which children contain a `.git` entry.

The selection unit is a directory, not a repository. Marking a child as a repository is a hint, not a gate: connecting a subdirectory still resolves to the working copy's top level through `git rev-parse --show-toplevel`, which is existing behaviour and must keep working.

A drive-letter path is translated onto its mount (`C:\Users\you\code` becomes `/mnt/c/Users/you/code`) inside `resolveRepoPath`, so connect, preview, and staleness accept it uniformly. The failure message still names the input **as typed**, so a translation that resolves nowhere is reported honestly rather than as a confusing mount path.

## Consequences

- The picker is inline, not a modal and not a route, matching the existing sections on the working surface.
- A listing is capped, and truncation is reported rather than hidden, so a short list never claims to be complete when it is not.
- Dotfolders are hidden by default and shown on request.
- The picker starts from a roots list: the home directory, `/`, and each mounted drive, so a Windows-side repository is reachable without typing a prefix.
- Translation is WSL-specific. On a host without the mount it fails to resolve and the error names the original input.
- UNC paths (`\\wsl$\...`, `\\wsl.localhost\...`) are not translated; the browser reaches those repositories instead.
- This does not touch the sandbox decision in [0005](./0005-sanitized-children-no-network.md): rehearsal is still Linux-only.

## Considered Options

- The File System Access API (`showDirectoryPicker`) was rejected: it returns a handle, not a path, so it cannot feed a server that needs a path string for git.
- A native OS folder dialog was rejected: it needs a desktop shell (Tauri/Electron) or a per-OS helper, adding a runtime dependency and platform-specific code for a problem the backend can solve with `readdir`.
- A modal picker was rejected: the app has no modals and avoids them, and an inline panel matches the existing layout.
- A recent-repositories list alone was rejected: it does not help the first connection, and does not remove the typing for repositories outside the list.
- Client-side path guessing was rejected: the browser cannot see the server's filesystem.
