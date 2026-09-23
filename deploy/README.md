# SaveVid AI: VPS migration runbook

Move off Render (metered egress + free-tier spin-down) onto a single VPS with
included bandwidth. SaveVid proxies video bytes through the server, so bandwidth
scales with downloads. A VPS with included traffic is the right home for that;
metered clouds are not.

All state lives in **Turso (remote)**, so there is nothing to migrate. The VPS
is stateless apart from Caddy's TLS cert (kept in a Docker volume). Rollback is
just repointing DNS back at Render.

---

## 1. Which VPS ($5/mo class)

**Pick: Hetzner Cloud CX22.** For a video proxy, included bandwidth is the whole
game, and Hetzner gives ~50x what the mainstream clouds do at this price.

| Provider | Plan | vCPU / RAM | Included traffic | ~Price/mo |
|---|---|---|---|---|
| **Hetzner (recommended)** | **CX22** (x86) | 2 / 4 GB | **20 TB** | ~4.30 EUR (~$4.70, incl. IPv4) |
| Hetzner (cheaper, ARM) | CAX11 | 2 / 4 GB | 20 TB | ~4.00 EUR |
| Netcup | VPS 1000 ARM G11 | 4 / 8 GB | "unlimited" (fair use) | ~$5 |
| Contabo | VPS S | 4 / 8 GB | 32 TB | ~$5-6 |
| DigitalOcean / Vultr / Linode | Basic | 1 / 1-2 GB | **1-2 TB only** | $6 |

Notes:
- **20 TB vs your ~0.6 TB/month now** = 30x headroom, so bandwidth stops being a
  cost or an outage cause.
- **Avoid DO/Vultr/Linode for this workload:** only 1-2 TB included, then
  ~$0.01/GB overage. You would blow past 1 TB in days at current traffic.
- **Region:** your #1 country is Spain and traffic is EU-heavy, so pick a
  Hetzner **EU** location (Falkenstein / Nuremberg / Helsinki) for best latency.
  Ashburn/Hillsboro if you expect to skew US later.
- **x86 (CX22) vs ARM (CAX11):** the Docker image currently builds for x86, so
  CX22 is the no-surprises pick. CAX11 (ARM) also works since the box builds from
  source, but stick with CX22 unless you want to save ~0.30 EUR.
- Choose **Ubuntu 24.04** as the image.

---

## 2. Cutover steps (about 15 minutes)

### a. Create the box
- Hetzner Cloud console: new CX22, Ubuntu 24.04, EU region, add your SSH key.
- Note its public IPv4.
- (Optional) Cloud Firewall or `ufw`: allow **22, 80, 443** inbound.

### b. Bootstrap it
SSH in as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/OxIsrafil/savevidai/main/deploy/setup-vps.sh | bash
```

First run creates `/opt/savevidai/deploy/app.env` and stops. Fill it in with the
**same values you already have in Render** (Environment tab: the 4 analytics
vars), then re-run:

```bash
nano /opt/savevidai/deploy/app.env
bash /opt/savevidai/deploy/setup-vps.sh
```

It builds the current `main` and starts the app + Caddy.

### c. Test BEFORE touching DNS
From your laptop, prove the box serves the app, bypassing DNS:

```bash
curl -sk --resolve savevidai.israfill.dev:443:<VPS_IP> https://savevidai.israfill.dev/api/health
```

Expect `{"status":"ok"}` (or a 200). If Caddy has not issued a cert yet because
DNS is not live, test the origin directly first: `curl -s http://<VPS_IP>/api/health`
will 404 at Caddy (host mismatch) which still proves Caddy is up.

### d. Flip DNS (Cloudflare)
- Cloudflare dashboard, israfill.dev zone, DNS records.
- Edit the `savevidai` record: point it to the **VPS IP** (A record).
- Keep it **DNS-only (grey cloud), NOT proxied.** Two reasons: Caddy needs to
  reach Let's Encrypt directly for the cert, and Cloudflare's free proxy is not
  for serving large volumes of video (their ToS), which is exactly your traffic.
- TTL: set low (e.g. 60s) a few minutes before cutover so it propagates fast.

Within a minute or two Caddy issues the cert and the site is live from the VPS.
Watch it:

```bash
docker compose -f /opt/savevidai/compose.prod.yaml logs -f caddy   # cert issuance
docker compose -f /opt/savevidai/compose.prod.yaml logs -f app     # requests
curl -si https://savevidai.israfill.dev/api/health
```

### e. Point UptimeRobot at the new box
No change needed if it monitors the hostname. Keep the 5-minute /api/health
ping.

### f. Decommission Render
Once the VPS is serving cleanly for a few hours: in Render, **suspend** (do not
delete yet) the `savevidai` service so you can roll back instantly if needed.
Delete after a day of stable VPS operation.

---

## 3. Rollback (instant)

If anything goes wrong, repoint the Cloudflare `savevidai` A record back to
Render's target (or re-enable the Render service). DNS-only means the switch is
just the record value. No data is lost either way (Turso is shared).

---

## 4. Day-to-day after the move

Auto-deploy is off on Render and there is no CI deploy to the VPS, so you deploy
on purpose:

```bash
ssh root@<VPS_IP>
cd /opt/savevidai
git pull
docker compose -f compose.prod.yaml up -d --build
```

- **Maintenance mode:** the in-dashboard admin toggle still works (it is an
  in-memory flag; a container restart clears it to Live, same as before). The
  `MAINTENANCE_MODE` env var in `deploy/app.env` is the hard-override backup.
- **Logs:** `docker compose -f compose.prod.yaml logs -f app`.
- **Bandwidth:** check the Hetzner console traffic graph. At ~0.6 TB/month you
  have ~30x headroom on the 20 TB allowance.
- **Updating this box from a new release:** just `git pull` + the up command
  above. It rebuilds from source, so it always runs current `main`.

---

## 5. What did NOT change

- Turso analytics DB, admin dashboard, ADMIN_PASSWORD, ANALYTICS_SALT: identical.
- The app, Dockerfile, Caddyfile: unchanged. `compose.prod.yaml` just adds the
  env file and builds from source instead of pulling the stale GHCR image.
- Downloads still proxy through the server. The point of the move is that a VPS
  includes the bandwidth to do that at viral scale; Render meters it.

---

## 6. Country lookup (DB-IP Lite)

The admin's countries panel is fed by an offline lookup on the box: no header
and no third-party call per visitor. The container keeps a copy of the free
DB-IP "IP to Country Lite" database and looks each visitor's IP up in memory
while the event is recorded. Only the two-letter country code is stored; the IP
is discarded right after the daily visitor hash and the lookup, never logged.

- **Data source:** https://db-ip.com/db/download/ip-to-country-lite, fetched as
  `https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz` (about
  4 MB compressed, 8 MB unpacked).
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0). DB-IP requires the
  link `<a href="https://db-ip.com">IP Geolocation by DB-IP</a>` on pages that
  display results from the database. The admin footnote carries it; the public
  pages neither display nor use the results.
- **Where it lives:** `GEOIP_DIR` when set, otherwise `<directory of
  ANALYTICS_DB_PATH>/geoip`, so production resolves to `/data/geoip` on the
  `analytics_data` volume and the file survives rebuilds. Two files:
  `dbip-country-lite.mmdb` and a marker `dbip-country-lite.month` holding the
  `YYYY-MM` it came from.
- **Refresh:** the image sets `GEOIP_UPDATE=1`, so the app checks 10 seconds
  after start and then every 24 hours. When the marker is not the current UTC
  month it downloads that month's file, falls back to the previous month while
  the new one is not published yet, validates it, swaps it in atomically and
  reloads it without a restart. Failures log one warning line and retry on the
  next cycle; the site is never affected. Set `GEOIP_UPDATE=0` in
  `deploy/app.env` to stop the network refresh (the file on disk keeps being
  used).
- **Force a refresh now:** delete the marker and restart the app:
  `docker compose -f compose.prod.yaml exec app rm -f /data/geoip/dbip-country-lite.month`
  then `docker compose -f compose.prod.yaml restart app`.
- **History:** events recorded before this lookup existed keep a NULL country
  and show up as "Not known" in the admin.
