# Stage 5 cutover rehearsal

This runbook is the isolated PULSAR-16 rehearsal. It validates the cutover
mechanics without changing production data, production Compose, DNS or UI
design. The source and target databases, S3 bucket and test credentials are
disposable.

## Rehearsal

Start from a fresh Compose project and use generated secrets:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml up -d --build
```

Run the existing REST/MCP/S3 contract before seeding the legacy fixture:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml exec app npm run zero:rest:check
```

Export the native Wiki, verify its SHA-256 sidecar, rehearse a forced
transaction rollback, import into UUID/Zero, and smoke-test password auth and
the `/zero` workspace shell:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml exec \
  -e CUTOVER_SEED_FIXTURE=true \
  -e CUTOVER_ALLOW_DROP_ISSUE_LINKS=true \
  -e CUTOVER_VERIFY_ROLLBACK=true \
  -e CUTOVER_ADMIN_EMAIL=cutover-admin@rehearsal.invalid \
  -e CUTOVER_ADMIN_PASSWORD \
  app npm run zero:cutover:check
```

`CUTOVER_ALLOW_DROP_ISSUE_LINKS=true` is mandatory when the snapshot contains
Wiki links to disposable test issues. The import records their count in an
audit event; it never silently discards them. Projects, the Wiki page tree,
every revision, archive state and timestamps are validated after import.
Because test users are reset by the accepted architecture, imported Wiki
authorship is explicitly normalized to the recreated cutover administrator and
recorded as `authorStrategy=cutover-admin` in the import audit event.

Verify that the legacy PostgreSQL backup is restorable and has identical
schema and per-table row counts:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml exec \
  postgres sh /opt/pulsar/verify-legacy-backup.sh
```

Finish with the permission boundary:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml exec app npm run zero:permissions:check
```

Remove only the disposable contour after collecting the command output and
checksums:

```bash
docker compose -p pulsar-zero-cutover -f infra/zero-spike/docker-compose.yml down --volumes --remove-orphans
```

## GO / NO-GO

GO requires all of the following in one fresh run:

- the native Wiki artifact and sidecar checksum validate before import;
- the forced import failure leaves no partially imported projects;
- target project/page/revision counts, tree, content and metadata equal the
  source snapshot;
- every dropped Wiki-to-issue link is explicitly approved and counted;
- the recreated global administrator can log in and open `/zero`;
- REST/MCP/S3 and permission checks pass;
- the restored legacy database has identical schema and per-table row counts;
- auth identities and sessions remain outside the Zero publication;
- a final off-server backup copy and its checksum are confirmed by an operator.

Any failed or skipped item is NO-GO. Keep old writes stopped, do not switch
traffic, restore the verified legacy dump into the original environment, start
the legacy application, run its smoke checks, and only then reopen writes.

## Inputs required for a real cutover

The rehearsal deliberately does not decide or store these production values.
Before a real cutover, an operator must provide and approve:

- maintenance window, maximum downtime and named GO/NO-GO decision owner;
- final global-admin email and a password supplied through the secret store;
- FirstVDS private-bucket credentials plus accepted CORS and lifecycle policy;
- encrypted off-server backup destination and retention period;
- traffic-switch and rollback commands for the production platform.

Do not run this rehearsal command against production. The real cutover remains
a separate explicitly approved operation after the evidence is reviewed.
