# Human dependencies and external gates

If a work package lists an open `HD-xx` or `Q-xx`, build against `Unblock-with` and leave `TODO(HD-xx)` where applicable.

| ID | What | Owner | Blocks | Unblock-with (safe default on `main` until Done) | Status |
|---|---|---|---|---|---|
| HD-01 | Verify deployed resource permissions and live smoke runbook on `main`. | Maintainer | WP-CORE.3, WP-CORE.4 | Keep feature opt-in behind manifest version or `isActive: false` | Open |
