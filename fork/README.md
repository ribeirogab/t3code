# T3 Code fork

Personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). The `custom` branch is the latest upstream nightly tag plus the fork commits on top.

Fork-owned files: `.github/workflows/fork-release.yml` and `fork/`. Everything else is upstream.

## Add a change

1. `git switch custom && git pull --rebase origin custom`
2. Put new code in new files. In upstream files, change as few lines as possible, for example one import and one call. Each changed upstream line can conflict on a rebase.
3. Make one commit per change, with the message `fork: <change>`.
4. `git push origin custom`. The workflow builds and publishes a release.

## Release flow

`fork-release.yml` runs every hour, on each push to `custom`, and on demand (`rebuild` forces a new build of the same commit).

1. It finds the latest published upstream nightly.
2. When `custom` does not contain it, it rebases `custom` onto it and pushes. The push starts the build run.
3. It builds the macOS arm64 app and the Linux x64 CLI archive with upstream's `release-desktop.yml`.
4. It signs the macOS app with the fork certificate (`fork/bin/resign-mac`).
5. It publishes the prerelease `vX.Y.Z-nightly.YYYYMMDD.<upstream run><fork revision>`, for example `v0.1.8-nightly.20261108.4367001`. The version keeps the upstream nightly format, so the app stays on the Nightly track and sorts after the upstream build it comes from.
6. It keeps the last 20 releases.

## Install and update

| Target | First install | Updates |
| --- | --- | --- |
| Mac app | `fork/bin/install-mac [tag]` | Update button in the app |
| Homelab server | `ssh homelab 'bash -s' -- <version> < fork/bin/install-server` | Update everything in the Mac app |

`install-server` sets `T3CODE_RELEASE_BASE_URL` in `~/.t3/service.env`, so the server downloads updates from this fork.

Do not use **Settings → About → Update track**. It reads upstream npm versions.

## Rebase conflicts

The workflow opens an issue with the `fork-conflict` label. The last release keeps working. To fix:

```sh
fork/bin/sync
git rebase --continue
git push --force-with-lease origin custom
```

`rerere` is on in the local clone, so Git repeats a conflict resolution it already knows.

## Secrets

| Secret | Use |
| --- | --- |
| `FORK_DEPLOY_KEY` | Deploy key with write access. It pushes the rebased branch, because `GITHUB_TOKEN` cannot push workflow file changes. |
| `FORK_MAC_CERT_P12`, `FORK_MAC_CERT_PASSWORD` | Self-signed code signing certificate `T3 Code Fork (ribeirogab)`. A copy is in the login keychain of the Mac. |

Keep the same certificate. macOS keeps app permissions, and the app accepts an update, only while the signing certificate stays the same.
