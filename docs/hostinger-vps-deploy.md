# Hostinger VPS Deployment

Use this once the app works locally.

## 1. Install Runtime On VPS

```bash
sudo apt update
sudo apt install -y nodejs npm nginx
sudo npm install -g pm2
```

For production, Node.js 20 or newer is recommended.

## 2. Upload Project

Upload the `teakwood-web` folder to the VPS, for example:

```bash
/var/www/teakwood-web
```

## 3. Configure Environment

Create `.env.production` in the project folder:

```bash
MYSQL_HOST=localhost-or-hostinger-db-host
MYSQL_PORT=3306
MYSQL_DATABASE=TeakwoodProduction
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
NEXT_PUBLIC_APP_URL=https://your-domain.com
APP_SESSION_SECRET=long-random-secret
```

## 4. Build And Run

```bash
cd /var/www/teakwood-web
npm ci
npm run build
pm2 start npm --name teakwood-web -- start
pm2 save
```

### Updating an existing deployment

Run from the application's existing production directory:

```bash
git pull --ff-only && npm ci && npm run build
```

Only after the build succeeds, restart the application's PM2 process:

```bash
pm2 restart teakwood-web
```

If your process uses a different name, find it with `pm2 list` and use that name.
Keep the existing port and environment configuration.

`git pull` does not install dependencies. The e-way bill PDF feature requires
`pdfkit`, `bwip-js`, and `qrcode`; these are already declared in `package.json`
and `package-lock.json`. Run `npm ci` after pulling to install the locked versions
before building. Do not copy Windows `node_modules` to the Linux server.

For a `Module not found` error, verify the install with:

```bash
npm ls pdfkit bwip-js qrcode --depth=0
```

## 5. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/teakwood-web`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/teakwood-web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
