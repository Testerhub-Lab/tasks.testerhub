# Zero Stage 2 isolated contour

This directory keeps the Compose contour created for PULSAR-6 and evolves it
into the isolated Stage 2 validation environment. The temporary spike table and
UI were removed; their implementation remains in branch history at commit
`9eba6b3`.

- PostgreSQL `18.4` is isolated in a named volume and has no published port.
- `zero-cache` `1.8.0` and the Next.js app bind only to server loopback.
- Existing cookie auth stays in `pulsar_app`; Stage 2 data stays in
  `pulsar_zero` inside the disposable PostgreSQL container.
- Only the explicit `pulsar_zero_data` publication from
  `infra/zero-stage2/schema.sql` is replicated.
- OpenTelemetry exporters remain disabled under the accepted PULSAR-7 gate.

The production-gate evidence and restrictions are recorded in
[PRODUCTION_GATE.md](./PRODUCTION_GATE.md). The application model and
permission boundary are described in
[../zero-stage2/README.md](../zero-stage2/README.md).

Copy `.env.example` to `.env`, replace every placeholder, then run with a fresh
Compose project so the clean Stage 2 schema is initialized:

```bash
docker compose -p pulsar-zero-stage2 up -d --build
```

For a remote VDS, use an SSH tunnel when testing the app and zero-cache:

```bash
ssh -L 3013:127.0.0.1:3013 -L 4848:127.0.0.1:4848 37.46.129.245
```

Remove the containers while preserving their isolated data:

```bash
docker compose -p pulsar-zero-stage2 down
```

Delete only this disposable validation volume after the experiment:

```bash
docker compose -p pulsar-zero-stage2 down --volumes
```
