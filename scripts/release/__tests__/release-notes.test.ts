import { describe, expect, test } from "bun:test";

import { releaseNotes } from "../release-notes";

const changelog = `# @acmelabs/jev-gate

## 0.2.0

### Minor Changes

- Second thing.

## 0.1.0

### Minor Changes

- First release.
`;

describe("releaseNotes", () => {
  test("returns the section for the version, up to the next heading", () => {
    expect(releaseNotes(changelog, "0.2.0")).toBe("### Minor Changes\n\n- Second thing.");
  });

  test("the last section runs to the end of the file", () => {
    expect(releaseNotes(changelog, "0.1.0")).toBe("### Minor Changes\n\n- First release.");
  });

  test("a version with no section gets a one-line fallback", () => {
    expect(releaseNotes(changelog, "0.3.0")).toBe("Release 0.3.0.");
  });

  test("an empty changelog gets the fallback", () => {
    expect(releaseNotes("", "0.1.0")).toBe("Release 0.1.0.");
  });

  test("a v-prefixed heading is found too", () => {
    expect(releaseNotes("## v1.0.0\n\nBody.\n", "1.0.0")).toBe("Body.");
  });
});
