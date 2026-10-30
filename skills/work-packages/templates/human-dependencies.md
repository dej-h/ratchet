# Human dependencies and external gates

Everything an agent cannot complete purely in local code (approvals, external
provisioning, or live environment runbooks). If a work package lists an `HD-xx`
that is not `Done`, build against the safe default in `Unblock-with` and leave
`TODO(HD-xx)` where applicable so dark-launched slices can merge to `main`
without breaking users.

| ID | What | Owner | Blocks | Unblock-with (safe default on `main` until Done) | Status |
|---|---|---|---|---|---|
| HD-01 | Verify deployed resource permissions and live smoke runbook on `main`. | Maintainer | WP-CORE.3, WP-CORE.4 | Keep feature opt-in behind manifest version or `isActive: false` | Open |
