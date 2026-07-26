# Zero 1.8 production gate

Checked on 2026-07-26 against the committed lockfile and the stable
`@rocicorp/zero`/`rocicorp/zero` version `1.8.0`.

## Dependency decision

`npm audit --omit=dev` reports 37 transitive findings: 29 moderate, 8 high, and
0 critical. `npm audit fix --force` is not accepted because npm proposes an
incompatible old Zero build. Forced OpenTelemetry overrides are also not
accepted because they produce a dependency graph outside Zero's declared
ranges.

The high findings are temporarily accepted with these runtime restrictions:

- all `OTEL_*` trigger variables are forced to empty strings and
  `ZERO_ENABLE_TELEMETRY=false`; Zero's `startOtelAuto` exits before loading the
  vulnerable OpenTelemetry propagators when these variables are empty;
- the bundled `cloudevents` path calls `uuid.v4()` only; the advisory concerns
  caller-provided buffers in `uuid` v3/v5/v6;
- `rimraf` occurs in the bundled `gaxios` package metadata but is not imported
  by its runtime build; the `rimraf -> glob -> minimatch -> brace-expansion`
  advisory path is not reachable by Pulsar;
- do not enable OpenTelemetry or add direct use of those transitive packages
  until a stable Zero release upgrades them.

The Windows-only `@hono/node-server` static-file advisory belongs to the
separate STDIO MCP package and is not reachable from the Linux Zero service.
The MCP package already uses SDK `1.29.0`; npm's proposed `1.24.3` downgrade is
not accepted.

Re-run the audit and this reachability review for every Zero upgrade. Remove
the acceptance as soon as a compatible stable release resolves the graph.

## Replica recovery decision

For the initial single-node deployment, the SQLite replica is treated as a
disposable cache and Litestream is not required. PostgreSQL remains the source
of truth and must have independently tested off-server backups.

The fallback was tested with 100,001 published rows:

- source PostgreSQL relation: about 22 MB;
- fresh Zero cache volume became healthy in 17.5 seconds;
- Zero reported its internal ready state in 10.1 seconds;
- the table copy took 0.69 seconds;
- SQLite replica: 12.7 MB;
- observed Zero memory after sync: about 576 MiB;
- replication slot was active with 0 bytes of WAL lag.

Zero 1.8 logs a restore warning/error when no Litestream URL is configured and
then performs the expected cold resync. For this single-node contour the
message is accepted only when the service becomes healthy and WAL lag returns
to zero. A failed health check or sustained lag is still an incident.

Add Litestream with a dedicated Pulsar S3 bucket and credentials before any of
these changes:

- more than one Zero cache node;
- cold-resync time exceeds the agreed recovery objective;
- the replica grows enough that resync materially loads PostgreSQL.

Do not reuse another application's S3 credentials.
