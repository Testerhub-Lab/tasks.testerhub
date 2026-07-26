# Zero spike

This stack validates Zero without changing the current Pulsar product schema.

- PostgreSQL `18.4` is isolated in a named volume and has no published port.
- `zero-cache` `1.8.0` and the spike Next.js app bind only to server loopback.
- Pulsar auth and Zero data stay in separate databases inside the disposable PostgreSQL container.
- Only `spike_issue` is included in the Zero publication.

Copy `.env.example` to `.env`, replace every placeholder, then run:

```bash
docker compose -p pulsar-zero-spike up -d --build
```

For a remote VDS, use an SSH tunnel:

```bash
ssh -L 3013:127.0.0.1:3013 -L 4848:127.0.0.1:4848 37.46.129.245
```

Open `http://localhost:3013/zero-spike`, sign in, and open the page in two tabs.

Remove the spike containers while preserving its data:

```bash
docker compose -p pulsar-zero-spike down
```

Delete the isolated spike data only after the experiment is complete:

```bash
docker compose -p pulsar-zero-spike down --volumes
```
