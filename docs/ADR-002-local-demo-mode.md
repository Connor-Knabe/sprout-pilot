# ADR-002: isolate the local demo from control APIs

Status: accepted, July 25, 2026.

Problem: the dashboard needs a deterministic sales/development example without
letting seeded telemetry become authorization for a real pump command.

Decision: keep mock snapshots in the existing dashboard read path, add an
explicit interactive `/demo` page, and make `npm run demo` omit the local D1
binding. Demo UI disables every write control. Scenario selection changes only
the requested mock snapshot.

Rejected: seeding fake telemetry into D1, because watering safety intentionally
trusts recent D1 telemetry. Rejected: mocking Particle dispatch alone, because
that still exercises command persistence and can become unsafe when credentials
exist.

Known limit: demo policy editing is intentionally read-only. A future editable
demo must keep state in the browser only and must not call write APIs.
