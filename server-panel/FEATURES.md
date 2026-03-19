# Server Panel vs CyberPanel – Feature Comparison

A quick reference for what this panel has and what CyberPanel offers for comparison.

## ✅ What We Have

| Feature | Status |
|--------|--------|
| System monitoring (CPU, memory, disk, GPU) | ✅ |
| Process control (kill from UI) | ✅ |
| Docker containers (list, start, stop, restart) | ✅ |
| One-click Docker/nginx/Certbot install | ✅ |
| Website creation (nginx/OLS, static + WordPress) | ✅ |
| Firewall (UFW) | ✅ |
| DNS (bind9) | ✅ |
| FTP/SFTP users | ✅ |
| Backups (tar to local) | ✅ |
| SSL (Certbot, renew) | ✅ |
| Minecraft server control | ✅ |
| **File manager** (browse, upload, delete, preview) | ✅ |
| Auth (password protection) | ✅ |
| **Website-centric integrations** (CyberPanel-inspired) | ✅ |

## 🔲 What CyberPanel Has That We Don’t (Yet)

| Feature | Notes |
|--------|-------|
| **Integrated file manager** | ✅ We added a basic one (browse, upload, delete, preview) |
| **Database management** (phpMyAdmin, MySQL) | Create DBs, users, run queries |
| **Email server** (Postfix, Dovecot, Rspamd) | Full mail stack with spam filtering |
| **WordPress Manager** | Staging, auto-login, plugin/theme management, LSCache |
| **ModSecurity WAF** | Web application firewall |
| **CSF / Fail2ban** | Extra firewall and brute-force protection |
| **Git integration** | Deploy from Git repos |
| **SSH terminal** | In-browser shell |
| **PHP version switcher** | Multiple PHP versions |
| **Remote backups** | SFTP, S3, Google Drive |
| **LiteSpeed Enterprise** | Commercial web server (we use nginx/OLS) |

## Suggested Next Additions (by impact)

1. **Database management** – MySQL/MariaDB + phpMyAdmin or Adminer
2. **Remote backups** – SFTP/S3 targets
3. **In-browser terminal** – Web-based SSH (e.g. xterm.js + backend)
4. **Git deploy** – Clone and deploy from Git repos
5. **Email** – Postfix + basic webmail (larger scope)
