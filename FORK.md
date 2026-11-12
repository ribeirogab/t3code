# T3 Code fork

Personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). The `custom` branch is the latest upstream nightly tag plus the fork commits on top.

The fork is for the desktop app only. The desktop app renders `apps/web` and bundles `apps/server`, so fork code goes there. Do not change, build, or test the mobile app, the hosted web app, or any other app for the fork. In the surface checklist of `AGENTS.md`, only the desktop app applies.

Fork-owned files: `FORK.md`, `.github/workflows/fork-release.yml`, `.github/workflows/fork-ci.yml`, `fork/`, `apps/web/src/fork/`, `apps/web/src/routes/_chat.settings.fork.tsx`, `apps/server/src/fork/`, `packages/contracts/src/fork/`, and `packages/provider-core/src/fork/`. Everything else is upstream, including the line in `AGENTS.md` that points here.

## Local setup

Read `fork/AGENTS.local.md` of the main checkout when it exists. It completes this file with the setup of one machine: its hosts, how to reach the other machines, how to get credentials, and the checks it can run. Git ignores it, so private data goes there and never here. From any worktree, its path is:

```sh
"$(git rev-parse --path-format=absolute --git-common-dir)/../fork/AGENTS.local.md"
```

## Add a change

Every change goes through a pull request into `custom`. Do not commit or push to `custom` directly.

- The repository is public. Keep private data out of every file, commit message, and pull request: hostnames, addresses, IPs, personal paths, and emails. The commit author name and email are fine.
- Keep fork changes free of database migrations. An upstream build cannot open a database that has a migration it does not know, so `fork/bin/use official` would fail.
- Every feature that changes what the app shows or does gets a toggle in **Settings → Fork**. Add it to `FORK_FEATURES` in `apps/web/src/fork/forkFeatures.ts` with the `section` of the screen it changes: `Sidebar`, `Thread details`, `Chat` for the thread view, or `Threads` for the thread menu. Add a section to `FORK_FEATURE_SECTIONS` only when none fits. Read the toggle with `useForkFeature` in components and with `isForkFeatureEnabled` in event handlers. With the toggle off, or with the **Fork features** master switch off, the app behaves like upstream. New features are on by default. The toggles live in the desktop app on each machine. The server cannot read them, so the server part of a feature stays on.

1. `git fetch origin && git switch -c fork/<change> origin/custom`
2. Put new code in new files under `fork/`, `apps/web/src/fork/`, `apps/server/src/fork/`, `packages/contracts/src/fork/`, or `packages/provider-core/src/fork/`. In upstream files, change as few lines as possible, for example one import and one call. Each changed upstream line can conflict on a rebase.
3. Run the typecheck, the lint, the format check, and the tests of the area you changed.
   `fork-ci.yml` runs `vp run check:changed` on every pull request into `custom`. This check replaces a local `vp run check:changed` as the gate before the merge.
4. Push the branch and open a pull request into `custom` with the title `fork: <change>`.
5. Stop and ask the owner to approve. Merge only after the approval.
6. Rebase the branch onto the latest `custom` and squash merge it:

   ```sh
   git fetch origin && git rebase origin/custom && git push --force-with-lease
   gh pr merge <number> --squash --delete-branch
   ```

   The daily rebase rewrites `custom`, so rebase the branch right before the merge. Git drops the old copies of the fork commits. The squash keeps one `fork: <change>` commit per change.

7. Make a release from the new `custom` with `fork/bin/release`. See [Release flow](#release-flow).

## Release flow

`fork/bin/release` makes the releases on our own machines. GitHub Actions is not in the path: the hosted macOS runners often had no capacity, and `fork-release.yml` was found disabled several times. The workflow stays disabled as a fallback.

```sh
fork/bin/release sync    # homelab: rebase custom onto the latest upstream nightly and push it
fork/bin/release linux   # homelab: Linux x64 AppImage and CLI archive, built in Docker
fork/bin/release mac     # Mac: macOS arm64 app, signed with the fork certificate
```

1. `sync` stops when the rebase has conflicts. Resolve them as [Rebase conflicts](#rebase-conflicts) says, then run `sync` again.
2. `linux` and `mac` build the head of `custom`. The first one creates a draft release `vX.Y.Z-nightly.YYYYMMDD.<upstream run><fork revision>`, for example `v0.1.8-nightly.20261108.4367001`. The second one builds the same commit and version as the draft. Run them in any order.
3. The one that finishes second publishes the prerelease and keeps the last 20 releases. A draft never reaches the updater, so the app and the server never see a release that has only one platform.

The version keeps the upstream nightly format, so the app stays on the Nightly track and sorts after the upstream build it comes from.

Each command works in its own clone (`~/Library/Caches/t3code-fork-release` on the Mac, `~/.cache/t3code-fork-release` on Linux) and never touches the clone you run it from. `linux` needs Docker. `mac` needs Xcode, Rust, Vite+, and the `T3 Code Fork (ribeirogab)` certificate in the login keychain. Over SSH, unlock the login keychain first, or `codesign` fails with `errSecInternalComponent`. `fork/AGENTS.local.md` has the SSH steps of this machine.

## Install and update

```sh
fork/bin/use fork
fork/bin/use official
```

`use` moves the desktop app on this machine to the latest release of the fork or of upstream: the app on macOS arm64, the AppImage on Linux x64. Options: `--only app`, `--only server`, `--server <ssh-host>`, and an exact tag such as `v0.1.8-nightly.20261108.4367001`.

To also move a T3 server on another machine, pass `--server <ssh-host>` or set `T3CODE_FORK_SERVER=<ssh-host>` in your shell profile. `use` moves that server first, then the app. Without a server, it moves only the app.

- The Mac app restarts, and the restart interrupts running threads.
- `install-mac` checks the signature of the new app before the swap: the fork certificate for `fork`, the T3 Tools Developer ID for `official`.
- `install-linux` checks the AppImage against the sha512 in `nightly-linux.yml` and installs it at `~/Applications/t3code-nightly.AppImage`, with a **T3 Code (Nightly)** entry in the app menu. Restart the app if it is running. AppImages need FUSE 2: on Ubuntu 24.04, `sudo apt install libfuse2t64`.
- `install-server` runs on the server. For `fork`, it sets `T3CODE_RELEASE_BASE_URL` in `~/.t3/service.env`, so the server downloads updates from this fork. For `official`, it removes that line. When the update fails, it restores the previous `service.env`.
- Threads, settings, and data stay, because both apps use the same folders.

After the first install, use the update button in the app. It updates the app and the server.

Do not use **Settings → About → Update track**. It reads upstream npm versions.

## Rebase conflicts

`fork/bin/release sync` stops and lists the files. The last release keeps working. To fix:

```sh
fork/bin/sync
git rebase --continue
git push --force-with-lease origin custom
```

`rerere` is on in the local clone, so Git repeats a conflict resolution it already knows.

## Secrets

| Secret                                        | Use                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `FORK_DEPLOY_KEY`                             | Deploy key with write access. It pushes the rebased branch, because `GITHUB_TOKEN` cannot push workflow file changes. |
| `FORK_MAC_CERT_P12`, `FORK_MAC_CERT_PASSWORD` | Self-signed code signing certificate `T3 Code Fork (ribeirogab)`. A copy is in the login keychain of the Mac.         |

Keep the same certificate. macOS keeps app permissions, and the app accepts an update, only while the signing certificate stays the same.
