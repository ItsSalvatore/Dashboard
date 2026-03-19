# Server Control Panel

All-in-one server management for Ubuntu/Linux: monitoring, process control, Minecraft, SSL, and server services.

## Features

- **Overview** – CPU, memory, disk, GPU stats with live charts
- **Process control** – Kill processes from the UI (no CLI needed)
- **Hosted apps** – Card view with live previews and quick links
- **Docker** – List, start, stop, restart containers; one-click install if missing
- **Websites** – Create sites with nginx or OpenLiteSpeed; one-click WordPress; integrated DNS zone + SSL; website-centric detail with File Manager, Backup, SSL
- **Firewall** – UFW rules management
- **DNS** – bind9 zone and record management
- **FTP** – Create/delete SFTP users
- **Backups** – Create, restore, delete backups
- **Minecraft** – Start, stop, restart your Minecraft server
- **SSL** – List Certbot certificates, renew all
- **Server** – Reload/restart nginx, view system info
- **Auth** – Password protection
- **One-Click Installs** – Install Docker, nginx, Certbot with a single click (Ubuntu/Debian)
- **File Manager** – Browse, upload, delete, preview files under /var/www
- **Services Notes** – Persistent notepad for your containers; “Copy from Docker” snapshots current state for when things go down

## Setup

```bash
cd server-panel
npm install
cp .env.example .env.local
# Edit .env.local: set PANEL_PASSWORD (required) and MINECRAFT_SERVER_PATH
npm run dev
```

## Minecraft configuration

Set `MINECRAFT_SERVER_PATH` in `.env.local` to the folder containing:

- `start.sh` or `run.sh` – will be executed to start the server
- Or `server.jar` – will run with `java -Xmx2G -Xms1G -jar server.jar nogui`

## Website creation

- **Webserver**: nginx (default) or OpenLiteSpeed
- **Static site**: Creates vhost + placeholder index.html
- **WordPress**: Docker Compose with WordPress + MySQL, nginx proxy to container

Requires: nginx or OpenLiteSpeed; Docker (for WordPress). Point DNS to your server first. Run `certbot --nginx -d yourdomain.com` (or `--webroot` for OLS) after creation for SSL.

## Firewall

Uses UFW. Requires `sudo` or root. Add rules like `allow 22/tcp`, `allow 80/tcp`, etc.

## DNS

Uses bind9. Zones stored in `/etc/bind/zones/`. Create zone, then add A, AAAA, CNAME, MX, TXT, NS records.

## FTP

Creates system users with home directories. Users can SFTP in. For vsftpd, add users to `/etc/vsftpd.userlist`.

## Backups

Backs up `/var/www` and `/etc/nginx` to `BACKUP_DIR` (default `/var/backups/panel`). Set `BACKUP_DIR` in `.env.local` to customize.

## One-Click Installs

The **One-Click Installs** tab (and inline install buttons on Docker, SSL, Server tabs) lets you install Docker, nginx, and Certbot without using the terminal. Uses the official Docker script and `apt-get` for nginx/certbot. **Requires sudo** and Ubuntu or Debian.

**Sudo setup** – Install commands use `sudo -n` (non-interactive). Either:

1. **Run the panel as root**: `sudo npm start`
2. **Or add passwordless sudo** for your panel user:
   ```bash
   sudo visudo
   # Add (replace 'paneluser' with your user):
   paneluser ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/curl, /usr/bin/sh, /usr/bin/tee, /usr/bin/chmod, /usr/bin/groupadd, /usr/bin/usermod
   ```
   For Docker, the official script runs many commands; the simplest approach is `paneluser ALL=(ALL) NOPASSWD: ALL` (use with caution).

## Security

- **Auth**: Set `PANEL_PASSWORD` or `PANEL_PASSWORD_HASH` (required)
- **Session**: HttpOnly, SameSite=Lax cookie; use HTTPS in production
- **Input validation**: Domain sanitization, container ID validation, path traversal checks
- **Principle of least privilege**: Run panel as non-root where possible; Docker socket access required for containers

## Run on your server

```bash
npm run build
npm start
```

Or use PM2: `pm2 start npm --name "server-panel" -- start`
