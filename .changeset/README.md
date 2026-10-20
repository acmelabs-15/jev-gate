# Changesets and releases

jev-gate releases the way acmelabs-15/brain does.

1. A visible change gets a changeset: `bunx changeset`, answer the two prompts, commit the file.
2. On a push to main with pending changesets, the release workflow opens a pull request
   named `ci: Version Packages`. That pull request bumps `package.json`, rewrites
   `CHANGELOG.md`, and runs `version:sync` so both manifests in `.claude-plugin/` agree.
3. Merging it lands a commit with no changesets left. The workflow then cuts the tag
   `v<version>`, a GitHub release carrying that version's changelog section, and moves
   the tag `latest` to the same commit. A pre-release version, one with a hyphen, does
   not move `latest`.

The ACMElabs marketplace entry for jev-gate points at `ref: latest`, so a release reaches
installed users when `latest` moves.
