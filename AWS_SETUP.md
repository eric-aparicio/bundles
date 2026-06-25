# AWS Deployment Guide — Bundles Manager (Producción Real)

## Arquitectura actual

- **Servidor**: EC2 Ubuntu (t3.small) — instancia compartida "Bruiser-APPs"
- **Proceso**: Node.js gestionado con PM2
- **Acceso público**: ngrok (túnel HTTPS con dominio estático)
- **Reverse proxy interno**: Nginx
- **Base de datos**: MySQL 8 local en el mismo EC2 (no RDS)
- **Auth Shopify**: OAuth `client_credentials`, token dinámico renovado cada 24h
- **Cron**: crontab local, ejecuta sync de inventario los días 1 y 16 de cada mes

## Variables de entorno (.env)

Ver `.env.example` para la plantilla completa. Variables críticas:
- `DATABASE_URL` — conexión MySQL local (127.0.0.1:3306)
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — para OAuth client_credentials
- `SHOPIFY_LOCATION_ID` — fijo, evita llamada API con scope read_locations restringido
- `CRON_SECRET` — protege el endpoint de sincronización

## Comandos de despliegue

```bash
cd /var/www/bundles
git pull origin main
npm ci --omit=dev
npx prisma generate
npx prisma db push   # o migrate deploy si hay carpeta migrations/
pm2 reload bundles-app --update-env
```

## Servicios systemd relevantes

```bash
sudo systemctl status ngrok        # túnel HTTPS público
sudo systemctl status nginx        # reverse proxy
pm2 status                          # proceso Node.js
```

## Notas importantes

- El bundle NUNCA debe tener `inventory_management: shopify` activo — su disponibilidad depende de los componentes, no de stock propio.
- Los webhooks `orders/create` y `orders/cancelled` están registrados apuntando a la URL de ngrok — si el dominio ngrok cambia, hay que re-registrarlos.
- El scope `read_locations` puede dar 403 con tokens `client_credentials` aunque esté en Partners — por eso `SHOPIFY_LOCATION_ID` está hardcodeado en `.env`.
