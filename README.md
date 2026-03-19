# Home Server Dashboard

A live monitoring dashboard for your home server with system stats, process list, port usage, and hosted apps.

**Runs on Linux, macOS, and Windows** – uses [systeminformation](https://systeminformation.io/), which supports all major platforms.

## Features

- **System stats** – CPU, memory, disk usage with live charts
- **Processes** – Top processes by CPU/memory, sortable
- **Ports** – All listening ports with process and PID
- **Hosted apps** – Detected services (Plex, Jellyfin, nginx, Next.js, etc.) with quick links
- **Hosted Apps tab** – Card view with live iframe previews and reachability status

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on your home server

1. Clone or copy this project to your server.
2. Run `npm install && npm run build`.
3. Start with `npm start` or use a process manager (PM2, systemd).

The dashboard reads system data from the machine it runs on, so it must run on the server you want to monitor.

## Tech stack

- Next.js 16 (App Router)
- Tailwind CSS
- Recharts
- [systeminformation](https://systeminformation.io/) for system stats
