import { assert, describe, it } from "@effect/vitest";
import {
  cliReleaseAssetUrl,
  cliReleaseDownloadBaseUrl,
  cliReleaseIndexPageUrl,
} from "@t3tools/shared/cliRelease";

const forkVersion = "0.1.11-nightly.20261119.4941001";
const forkReleases = "https://github.com/ribeirogab/t3code/releases";

describe("fork release repository", () => {
  it("downloads a fork version from the fork releases", () => {
    assert.equal(
      cliReleaseDownloadBaseUrl(forkVersion),
      `${forkReleases}/download/v${forkVersion}`,
    );
    assert.equal(
      cliReleaseAssetUrl(forkVersion, "SHA256SUMS"),
      `${forkReleases}/download/v${forkVersion}/SHA256SUMS`,
    );
  });

  it("keeps a configured release mirror", () => {
    assert.equal(
      cliReleaseDownloadBaseUrl(forkVersion, "https://mirror.example.com/t3code"),
      `https://mirror.example.com/t3code/v${forkVersion}`,
    );
  });

  it("finds the newest version in the fork release index", () => {
    assert.equal(
      cliReleaseIndexPageUrl(1),
      "https://api.github.com/repos/ribeirogab/t3code/releases?per_page=100&page=1",
    );
  });
});
