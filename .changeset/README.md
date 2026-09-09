# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — one
markdown file per pending change describing the semver bump for the affected
packages. The three publishable packages are **fixed together**: bumping any of
them bumps all three to the same version.

Workflow:

```bash
pnpm changeset          # record a change (pick a bump + write a summary)
pnpm changeset:version  # apply pending changesets: bump versions + changelogs
pnpm release            # build everything, then publish to npm in dependency order
```

See the [common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md).
