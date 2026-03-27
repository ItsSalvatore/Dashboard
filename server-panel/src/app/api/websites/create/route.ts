import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { isValidDomain, sanitizeDomain } from "@/lib/validation";
import { requireAuth } from "@/lib/auth";

const execAsync = promisify(exec);

const BIND_ZONE_DIR = "/etc/bind/zones";
const BIND_NAMED_CONF = "/etc/bind/named.conf.local";

export const dynamic = "force-dynamic";

const WEB_ROOT = process.env.WEB_ROOT || "/var/www";
const NGINX_AVAILABLE = "/etc/nginx/sites-available";
const NGINX_ENABLED = "/etc/nginx/sites-enabled";
const OLS_ROOT = process.env.OLS_ROOT || "/usr/local/lsws";
const OLS_VHOSTS = `${OLS_ROOT}/conf/vhosts`;

function nginxConfig(domain: string, root: string): string {
  return `server {
    listen 80;
    server_name ${domain} www.${domain};
    root ${root};
    index index.php index.html;
    location / {
        try_files $uri $uri/ /index.php?$args;
    }
    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi$script_name;
        include fastcgi_params;
    }
}
`;
}

function nginxConfigStatic(domain: string, root: string): string {
  return `server {
    listen 80;
    server_name ${domain} www.${domain};
    root ${root};
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
`;
}

export async function POST(request: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const domain = sanitizeDomain(typeof body.domain === "string" ? body.domain : "");
    const wordpress = body.wordpress === true;
    const webserver = body.webserver === "ols" ? "ols" : "nginx";
    const createDnsZone = body.createDnsZone === true;
    const issueSsl = body.issueSsl === true;

    if (!isValidDomain(domain)) {
      return NextResponse.json(
        { error: "Invalid domain. Use format: example.com" },
        { status: 400 }
      );
    }

    const siteRoot = join(WEB_ROOT, domain);
    if (existsSync(siteRoot)) {
      return NextResponse.json(
        { error: `Site ${domain} already exists` },
        { status: 409 }
      );
    }

    if (wordpress) {
      await mkdir(siteRoot, { recursive: true });
      const dbPass = generatePassword();
      const rootPass = generatePassword();
      const wpPort = 8080;
      const composeYml = `version: "3.8"
services:
  wordpress:
    image: wordpress:latest
    ports:
      - "${wpPort}:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: ${dbPass}
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_data:/var/www/html
    depends_on:
      - db
  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wp
      MYSQL_PASSWORD: ${dbPass}
      MYSQL_ROOT_PASSWORD: ${rootPass}
    volumes:
      - db_data:/var/lib/mysql
volumes:
  wp_data:
  db_data:
`;
      const composePath = join(siteRoot, "docker-compose.yml");
      await writeFile(composePath, composeYml);
      await execAsync(`cd ${siteRoot} && docker compose up -d`, {
        shell: "/bin/bash",
      });

      const nginxProxy = `server {
    listen 80;
    server_name ${domain} www.${domain};
    location / {
        proxy_pass http://127.0.0.1:${wpPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
      const configPath = join(NGINX_AVAILABLE, domain);
      await writeFile(configPath, nginxProxy);
      await execAsync(`ln -sf ${configPath} ${join(NGINX_ENABLED, domain)}`);
      await execAsync("nginx -t && systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null");

      await runPostCreate(domain, siteRoot, createDnsZone, issueSsl);
      return NextResponse.json({
        ok: true,
        domain,
        wordpress: true,
        port: wpPort,
        dnsZone: createDnsZone,
        sslIssued: issueSsl,
        message: issueSsl ? `WordPress + SSL created` : `WordPress created. Run: certbot --nginx -d ${domain} for SSL`,
      });
    }

    await mkdir(siteRoot, { recursive: true });
    await writeFile(
      join(siteRoot, "index.html"),
      `<!DOCTYPE html><html><head><title>${domain}</title></head><body><h1>${domain}</h1><p>Site created by Server Panel.</p></body></html>`
    );

    if (webserver === "ols" && existsSync(OLS_ROOT)) {
      await mkdir(join(OLS_VHOSTS, domain), { recursive: true });
      const olsConfig = `docRoot                   ${siteRoot}
vhDomain                  ${domain} www.${domain}
enableGzip                1
indexFiles                index.html, index.php
`;
      await writeFile(join(OLS_VHOSTS, domain, "vhconf.conf"), olsConfig);
      await execAsync(`${OLS_ROOT}/bin/lswsctrl reload 2>/dev/null || true`);
      await runPostCreate(domain, siteRoot, createDnsZone, issueSsl);
      return NextResponse.json({
        ok: true,
        domain,
        root: siteRoot,
        webserver: "openlitespeed",
        dnsZone: createDnsZone,
        sslIssued: issueSsl,
        message: issueSsl ? `Site + SSL created` : `Site created. Run: certbot --webroot -w ${siteRoot} -d ${domain} for SSL`,
      });
    }

    const configPath = join(NGINX_AVAILABLE, domain);
    const config = nginxConfigStatic(domain, siteRoot);
    await writeFile(configPath, config);
    await execAsync(`ln -sf ${configPath} ${join(NGINX_ENABLED, domain)}`);
    await execAsync("nginx -t && systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null");

    await runPostCreate(domain, siteRoot, createDnsZone, issueSsl);
    return NextResponse.json({
      ok: true,
      domain,
      root: siteRoot,
      dnsZone: createDnsZone,
      sslIssued: issueSsl,
      message: issueSsl ? `Site + SSL created` : `Site created. Run: certbot --nginx -d ${domain} for SSL`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message ?? "Failed to create site" },
      { status: 500 }
    );
  }
}

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0123456789";
  let s = "";
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function runPostCreate(
  domain: string,
  siteRoot: string,
  createDnsZone: boolean,
  issueSsl: boolean
): Promise<void> {
  if (createDnsZone && existsSync(BIND_ZONE_DIR)) {
    const zoneFile = join(BIND_ZONE_DIR, `${domain}.zone`);
    if (!existsSync(zoneFile)) {
      const serial = Math.floor(Date.now() / 1000);
      const zoneContent = `$TTL 3600
@ IN SOA ns1.${domain}. admin.${domain}. ( ${serial} 7200 3600 1209600 3600 )
@ IN NS ns1.${domain}.
@ IN A 127.0.0.1
ns1 IN A 127.0.0.1
www IN A 127.0.0.1
`;
      await writeFile(zoneFile, zoneContent);
      const zoneConfig = `zone "${domain}" {
    type master;
    file "${zoneFile}";
    allow-transfer { none; };
};
`;
      const namedConf = await readFile(BIND_NAMED_CONF, "utf8").catch(() => "");
      if (!namedConf.includes(`zone "${domain}"`)) {
        await writeFile(BIND_NAMED_CONF, namedConf + "\n" + zoneConfig);
      }
      await execAsync("systemctl reload bind9 2>/dev/null || service named reload 2>/dev/null || true");
    }
  }
  if (issueSsl) {
    await execAsync(
      `certbot --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null || certbot --webroot -w ${siteRoot} -d ${domain} -d www.${domain} --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null || true`
    );
  }
}
