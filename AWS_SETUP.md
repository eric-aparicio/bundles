# AWS Deployment Guide (Servidor EC2 + RDS)

Esta guía es para desplegar la app en un servidor que ya tienes dentro de AWS (EC2), sin App Runner.

## Arquitectura recomendada

- App: EC2 (Ubuntu) con Node.js + PM2
- Reverse proxy: Nginx + SSL (Let's Encrypt)
- Base de datos: Amazon RDS PostgreSQL
- Cron: EventBridge Scheduler o cron local en EC2

## 1) Preparar infraestructura en AWS

1. EC2 con Ubuntu 22.04 o 24.04.

1. Security Group del EC2:

- Inbound `80/tcp` desde `0.0.0.0/0`
- Inbound `443/tcp` desde `0.0.0.0/0`
- Inbound `22/tcp` solo desde tu IP

1. RDS PostgreSQL accesible desde el Security Group del EC2.

## 2) Instalar dependencias en el servidor

Conectado por SSH al EC2:

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3) Clonar proyecto y configurar entorno

```bash
cd /var/www
sudo git clone <URL_PRIVADA_REPO> bundles-v2
sudo chown -R $USER:$USER bundles-v2
cd bundles-v2
cp .env.example .env
```

Edita `.env` con tus valores reales:

```dotenv
SHOP=tu-tienda.myshopify.com
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_API_KEY=xxxx
SHOPIFY_API_SECRET=xxxx
SHOPIFY_APP_URL=https://tudominio.com
SCOPES=write_products,read_products,write_inventory,read_inventory,write_orders,read_orders

SESSION_SECRET=string-largo-aleatorio
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/DB_NAME?schema=public
CRON_SECRET=token-seguro-para-cron

NODE_ENV=production
PORT=3000
```

## 4) Instalar y arrancar con PM2

```bash
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Para validar:

```bash
pm2 status
curl http://127.0.0.1:3000/api/status
```

## 5) Configurar Nginx (dominio público)

1. Copia `deploy/nginx-bundles.conf` a `/etc/nginx/sites-available/bundles`.
1. Ajusta `server_name` con tu dominio.
1. Activa el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/bundles /etc/nginx/sites-enabled/bundles
sudo nginx -t
sudo systemctl restart nginx
```

## 6) Configurar HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com
```

## 7) Configurar Shopify con tu dominio nuevo

1. Cambia `SHOPIFY_APP_URL=https://tudominio.com` en `.env`.
1. Reinicia app: `pm2 restart bundles-v2`.
1. En Shopify Admin actualiza webhooks:

- `https://tudominio.com/webhooks/orders/create`
- `https://tudominio.com/webhooks/orders/cancelled`

## 8) Cron quincenal

### Opción A (recomendada): EventBridge Scheduler

- Programación quincenal:

```bash
cron(0 0 1,15 * ? *)
```

- Target HTTP:
  - URL: `https://tudominio.com/api/trigger-sync-inventory`
  - Header: `Authorization: Bearer <CRON_SECRET>`
  - Método: `POST`

### Opción B: cron local en EC2

```bash
crontab -e
```

Agrega:

```bash
0 0 1,15 * * cd /var/www/bundles-v2 && /usr/bin/node cron-sync-inventory.js >> /var/log/bundles-cron.log 2>&1
```

## 9) Flujo de updates (deploy continuo manual)

```bash
cd /var/www/bundles-v2
git pull origin main
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 restart bundles-v2
```

## 10) Checklist final

1. `https://tudominio.com/api/status` responde `ok`.
1. PM2 en `online`.
1. Webhooks Shopify apuntan al dominio nuevo.
1. El cron de sync está activo.
1. Logs sin errores críticos:

```bash
pm2 logs bundles-v2 --lines 100
```
