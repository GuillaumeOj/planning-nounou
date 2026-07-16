# Backend

## Keep `populate_dev` in sync with the features you add

`tracking/management/commands/populate_dev.py` builds the demo dataset the dev
stack runs on (`uv run tox -e populate`). It is not test fixture code — it's how
everyone gets a database they can actually click through, and it's the first
place a new feature gets looked at.

**When you add or change a backend feature, extend `populate_dev` in the same
change.** A feature the demo dataset never creates is one nobody sees in dev
until it surprises them in production.

In practice, in the same PR:

- **New model** → create a few, wired to the families and contracts they belong
  to, not floating on their own.
- **New field** → give it a realistic and *varied* value across the dataset;
  leaving it at its default means the UI only ever renders one case.
- **New effective-dated snapshot** (the `ContractTerms` / `ContractSchedule`
  pattern) → create more than one, so the history has depth and
  `current_*` has something to pick.
- **New state a feature can be in** (a status, a role, an invitation that's
  still pending) → cover the states worth seeing, not just the happy one.
- **Anything owned by the demo accounts** → check `_flush` reaches it, so a
  re-run still resets cleanly instead of piling up.
- **Cover it** in `tests/tracking/test_populate_dev.py`.

Two invariants the command must keep, whatever you add:

- **Dev only.** It mints accounts sharing one weak password, so it must stay
  behind `_guard_dev_only` and never be reachable from a deployed environment.
- **Re-runnable.** Every run wipes and rebuilds the demo dataset, scoped to the
  `DEMO_DOMAIN` email suffix. It must never touch data someone made by hand.
