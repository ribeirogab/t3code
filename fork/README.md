# T3 Code fork

Personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). The `custom` branch is the latest upstream nightly tag plus the fork commits on top.

Fork-owned files: `.github/workflows/fork-release.yml`, `.claude/rules/fork.md`, `fork/`, and `apps/web/src/fork/`. Everything else is upstream.

## Add a change

Every change goes through a pull request into `custom`. Do not commit or push to `custom` directly.

1. `git fetch origin && git switch -c fork/<change> origin/custom`
2. Put new code in new files. In upstream files, change as few lines as possible, for example one import and one call. Each changed upstream line can conflict on a rebase.
3. Run the typecheck, the lint, the format check, and the tests of the area you changed.
4. Push the branch and open a pull request into `custom` with the title `fork: <change>`.
5. Wait for the owner to approve.
6. Rebase the branch onto the latest `custom` and squash merge it:

   ```sh
   git fetch origin && git rebase origin/custom && git push --force-with-lease
   gh pr merge <number> --squash --delete-branch
   ```

   The hourly rebase rewrites `custom`, so rebase the branch right before the merge. Git drops the old copies of the fork commits. The squash keeps one `fork: <change>` commit per change.

7. The merge pushes to `custom`, and the workflow builds and publishes a release.

## Release flow

`fork-release.yml` runs every hour, on each push to `custom`, and on demand (`rebuild` forces a new build of the same commit).

1. It finds the latest published upstream nightly.
2. When `custom` does not contain it, it rebases `custom` onto it and pushes. The push starts the build run.
3. It builds the macOS arm64 app and the Linux x64 CLI archive with upstream's `release-desktop.yml`.
4. It signs the macOS app with the fork certificate (`fork/bin/resign-mac`).
5. It publishes the prerelease `vX.Y.Z-nightly.YYYYMMDD.<upstream run><fork revision>`, for example `v0.1.8-nightly.20261108.4367001`. The version keeps the upstream nightly format, so the app stays on the Nightly track and sorts after the upstream build it comes from.
6. It keeps the last 20 releases.

## Install and update

```sh
fork/bin/use fork
fork/bin/use official
```

`use` moves the server on the `homelab` SSH host first, then the Mac app, to the latest release of the fork or of upstream. Options: `--only mac`, `--only server`, and an exact tag such as `v0.1.8-nightly.20261108.4367001`.

- The Mac app restarts, and the restart interrupts running threads.
- `install-mac` checks the signature of the new app before the swap: the fork certificate for `fork`, the T3 Tools Developer ID for `official`.
- `install-server` runs on the server. For `fork`, it sets `T3CODE_RELEASE_BASE_URL` in `~/.t3/service.env`, so the server downloads updates from this fork. For `official`, it removes that line. When the update fails, it restores the previous `service.env`.
- Threads, settings, and data stay, because both apps use the same folders.

After the first install, use the update button in the Mac app. It updates the Mac app and the server.

Do not use **Settings → About → Update track**. It reads upstream npm versions.

Keep fork changes free of database migrations. An upstream build cannot open a database that has a migration it does not know, so `use official` would fail.

## Rebase conflicts

The workflow opens an issue with the `fork-conflict` label. The last release keeps working. To fix:

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
