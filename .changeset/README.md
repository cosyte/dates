# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **changelog** and the **publish** for `@cosyte/dates`. `config.json` names
a `changelog` generator, so the release writes its own version heading into `CHANGELOG.md` and
**your changeset summary is the entry a reader sees there**. Write it for a consumer, and do not
hand-edit `CHANGELOG.md`: it is generated output.

Add a changeset for every change a consumer can observe:

```bash
pnpm changeset
```

## Which bump to pick

The rule is about the **published surface**: the values and types exported from `@cosyte/dates`,
and the behaviour a consumer sees when they call into it.

- **`minor`** when a consumer of the last published version could observe the difference: an export
  added, removed or renamed; a conversion, a validation issue or a refusal that behaves differently;
  a value that used to come back and now does not. Below `1.0.0` a breaking change is also a
  `minor`, and its summary says what broke and what to do instead.
- **`patch`** for a fix that changes nothing else a consumer relies on, and for changes nobody
  installing the package can observe: documentation, tests, repository tooling, CI, or package
  metadata.

## Writing the summary

The opening sentence becomes the bullet in the GitHub release, and the shared release tooling
refuses the release, rather than trimming it, when that sentence does not fit. So:

- **Open with one complete, short sentence** saying what changed for a reader. Put the detail in the
  paragraphs after it.
- **No internal bookkeeping**: no item identifiers, no plan or phase names, no decision-record
  numbers. The release tooling refuses them.
- **No heading at the start of a line.** Continuation lines are indented under the entry's bullet, so
  a `##` line becomes a real heading inside the release section once published. Use an inline code
  span instead.
