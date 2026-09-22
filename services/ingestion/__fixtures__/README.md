# Parser fixtures

The `.html` files here are **not committed** — they are roughly 800KB of
third-party markup that would dominate every diff. Fetch them before running
the parser tests:

```bash
bash scripts/fetch-fixtures.sh
```

Four completed UFC.com event pages, covering KO/TKO, submission, and unanimous
and split decisions. No Contest, cancellation and pending states are exercised
by in-memory edits inside the test file, since no saved example of those states
exists yet.

A fixture must be a complete page: the parser reads the event date from the
hero section, which sits far from the fight listings. Trimming a fixture down
to just the listings breaks it.
