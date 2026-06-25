# Bundles Manager

Aplicación web para crear y gestionar **packs de productos (bundles)** en Shopify, con sincronización automática de inventario: cuando se vende un bundle, se descuenta automáticamente el stock de cada producto individual que lo compone.

Desarrollada para **Bruiser Boxing** (bruiser.es).

---

## 📋 Tabla de contenidos

- [¿Qué hace esta app?](#qué-hace-esta-app)
- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración de Shopify](#configuración-de-shopify)
- [Variables de entorno](#variables-de-entorno)
- [Uso de la aplicación](#uso-de-la-aplicación)
- [Sincronización de productos](#sincronización-de-productos)
- [Webhooks de inventario](#webhooks-de-inventario)
- [Importar/Exportar bundles vía CSV](#importarexportar-bundles-vía-csv)
- [Despliegue en producción](#despliegue-en-producción)
- [Solución de problemas](#solución-de-problemas)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## ¿Qué hace esta app?

- Crea **bundles** (packs) combinando productos/variantes existentes de tu tienda Shopify
- Sincroniza automáticamente el catálogo de productos entre Shopify y una base de datos local
- Descuenta el inventario de cada componente cuando se vende un bundle (webhook `orders/create`)
- Restaura el inventario si se cancela el pedido (webhook `orders/cancelled`)
- Permite que el cliente elija variantes (talla, color...) de cada componente directamente en la página del producto en Shopify
- Exporta/importa bundles en formato CSV para gestión masiva
- Sincronización periódica de inventario vía cron

---

## Arquitectura

```
Internet (HTTPS)
       │
   ngrok tunnel  ← expone la app públicamente con un dominio fijo
       │
     Nginx       ← reverse proxy (opcional según despliegue)
       │
  Node.js :3000  ← Express + PM2
       │
   ┌───┴────┐
   │        │
 MySQL   Shopify API
(Prisma)  (REST + GraphQL)
```

- **Backend**: Node.js + Express
- **Base de datos**: MySQL + Prisma ORM
- **Frontend**: HTML/JS vanilla (sin framework)
- **Gestor de procesos**: PM2
- **Túnel público**: ngrok (dominio estático)
- **Auth Shopify**: OAuth `client_credentials` — token renovado automáticamente cada 24h

---

## Requisitos previos

| Software | Versión | Notas |
|---|---|---|
| Node.js | 20.x LTS | `node --version` |
| MySQL | 8.x | Puede ser local o remoto |
| PM2 | última | `npm install -g pm2` |
| ngrok | última | Cuenta gratuita con dominio estático |
| Tienda Shopify | — | Con acceso a Partners Dashboard |

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/eric-aparicio/bundles.git
cd bundles
```

### 2. Instalar dependencias

```bash
npm ci --omit=dev
```

### 3. Crear la base de datos MySQL

```bash
# Conéctate a MySQL y crea la base de datos:
mysql -u root -p
```

```sql
CREATE DATABASE bundles_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bundles_user'@'localhost' IDENTIFIED BY 'TU_PASSWORD_AQUI';
GRANT ALL PRIVILEGES ON bundles_db.* TO 'bundles_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
nano .env   # completa con tus valores reales (ver sección siguiente)
```

### 5. Generar el cliente Prisma y crear las tablas

```bash
npx prisma generate
npx prisma db push
```

### 6. Arrancar la aplicación

```bash
# Modo desarrollo:
node server.js

# Modo producción (con PM2):
pm2 start ecosystem.config.cjs
pm2 save
```

La app quedará escuchando en `http://localhost:3000`.

---

## Configuración de Shopify

Esta app usa el flujo OAuth **`client_credentials`**, que genera tokens temporales (24h) automáticamente — no necesitas copiar manualmente un token de acceso permanente.

### Pasos en Shopify Partners

1. Ve a [partners.shopify.com](https://partners.shopify.com) → **Apps** → tu app (o crea una nueva)
2. En **Configuration**:
   - **App URL**: `https://TU_DOMINIO_NGROK.ngrok-free.app`
   - **Allowed redirection URL(s)**: `https://TU_DOMINIO_NGROK.ngrok-free.app/auth/callback`
3. En **API access scopes**, asegúrate de tener marcados:
   - `read_products`, `write_products`
   - `read_inventory`, `write_inventory`
   - `read_orders`, `write_orders`
   - `read_locations`
4. Guarda los cambios
5. Copia el **Client ID** y **Client Secret** — van en tu `.env`

> **⚠️ Importante:** Si cambias el scope `read_locations` después de que la app ya estaba instalada, debes **desinstalar y reinstalar** la app en la tienda para que el cambio tenga efecto.

### Instalar la app en tu tienda

```
partners.shopify.com → Apps → tu app → "Select store" → elige tu tienda → Install
```

### Registrar los webhooks

```bash
# Obtener un token (válido 24h):
TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"client_id":"TU_CLIENT_ID","client_secret":"TU_CLIENT_SECRET","grant_type":"client_credentials"}' \
  "https://TU_TIENDA.myshopify.com/admin/oauth/access_token" | grep access_token | cut -d'"' -f4)

# Registrar orders/create:
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $TOKEN" \
  -d '{"webhook":{"topic":"orders/create","address":"https://TU_DOMINIO_NGROK.ngrok-free.app/webhooks/orders/create","format":"json"}}' \
  "https://TU_TIENDA.myshopify.com/admin/api/2025-01/webhooks.json"

# Registrar orders/cancelled:
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $TOKEN" \
  -d '{"webhook":{"topic":"orders/cancelled","address":"https://TU_DOMINIO_NGROK.ngrok-free.app/webhooks/orders/cancelled","format":"json"}}' \
  "https://TU_TIENDA.myshopify.com/admin/api/2025-01/webhooks.json"
```

### Instalar el selector de variantes en el tema

La app incluye un snippet de Liquid que muestra al cliente las opciones (talla, color...) de cada componente del bundle.

1. Copia `theme/snippets/bundle-customizer.liquid` a tu tema en Shopify:
   ```
   Online Store → Themes → Edit code → Snippets → Add a new snippet
   Nombre: bundle-customizer
   ```
2. En la plantilla de producto (`main-product.liquid` o similar), añade:
   ```liquid
   {% render 'bundle-customizer', product: product %}
   ```
![Vista de un bundle en tienda](https://github.com/user-attachments/assets/b512780a-8e3b-4285-8e4d-cceb2860ec05)


---

## Variables de entorno

Copia `.env.example` y completa con tus valores:

```dotenv
# Entorno
NODE_ENV=production
PORT=3000

# Shopify — credenciales de tu app en Partners Dashboard
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_APP_URL=https://tu-dominio.ngrok-free.app
SHOPIFY_SHOP_URL=tu-tienda.myshopify.com
SHOP=tu-tienda.myshopify.com
SCOPES=write_products,read_products,write_inventory,read_inventory,write_orders,read_orders,read_locations

# Location ID fijo (evita error 403 con scope read_locations restringido)
# Obtenlo con: curl con token + GET /locations.json
SHOPIFY_LOCATION_ID=

# Sesión y cron
SESSION_SECRET=genera_con_openssl_rand_hex_32
CRON_SECRET=genera_con_openssl_rand_hex_32

# Base de datos MySQL
DATABASE_URL="mysql://usuario:password@127.0.0.1:3306/bundles_db?connection_limit=10&connect_timeout=60"
```

> **🔒 Nunca subas `.env` a Git.** Verifica que está en `.gitignore`. Si alguna vez se filtra una credencial, rótala inmediatamente desde Partners Dashboard (`Rotate API secret key`).

---

## Uso de la aplicación

Abre `https://tu-dominio-ngrok.ngrok-free.app` en el navegador (o `http://localhost:3000` en local).

<img width="1607" height="761" alt="image" src="https://github.com/user-attachments/assets/065f9538-d28e-4801-9f38-24e7aa707868" />


### Crear un bundle manualmente

1. Click en **"+ Crear Bundle"**
2. **Paso 1**: introduce nombre y precio del pack
3. **Paso 2**: busca y selecciona los productos/variantes que formarán el bundle, indica cantidades
4. Click en **"✓ Crear Bundle"** — esto:
   - Crea un nuevo producto en Shopify (estado `draft` por defecto)
   - Guarda la configuración en un metafield de Shopify (`custom.bundle_config`)
   - Guarda el bundle en la base de datos local

> <img width="1604" height="770" alt="image" src="https://github.com/user-attachments/assets/546c81f6-3cf4-4380-b069-20c2e321c1b0" />
> <img width="1597" height="731" alt="image" src="https://github.com/user-attachments/assets/17173f7b-26ef-4cbd-9a6b-d6a5682aad25" />


### Editar, duplicar o eliminar un bundle

Cada tarjeta de bundle tiene botones para **Editar**, **Duplicar** y **Eliminar** directamente desde la interfaz.

### Activar un bundle en la tienda

Los bundles se crean en estado `draft` por seguridad. Una vez revisado:
```
Shopify Admin → Products → busca el bundle → cambia Status a "Active"
```

---

## Sincronización de productos

La app mantiene una copia local (caché) del catálogo de Shopify en MySQL para no depender de llamadas constantes a la API.

### Sincronización automática

Al arrancar, si la base de datos está vacía, la app sincroniza automáticamente todos los productos de Shopify.

### Sincronización manual

```bash
curl -X POST http://localhost:3000/api/sync
```

Esto:
- Trae todos los productos de Shopify (paginado, 250 por página)
- Crea los productos nuevos en la DB
- Actualiza los existentes
- Elimina de la DB los que ya no existen en Shopify

> **⏱️ Nota:** con catálogos grandes (+500 productos) la sincronización puede tardar 15-30 segundos. Es normal.

---

## Webhooks de inventario

Cuando un cliente compra un bundle:

```
Shopify → webhook orders/create → tu servidor
         → identifica que es un bundle
         → lee la configuración (metafield)
         → descuenta el stock de cada componente individual
```

Si el pedido se cancela:

```
Shopify → webhook orders/cancelled → tu servidor
         → restaura el stock de cada componente
```

### Verificar que los webhooks están registrados

```bash
TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"client_id":"TU_CLIENT_ID","client_secret":"TU_CLIENT_SECRET","grant_type":"client_credentials"}' \
  "https://TU_TIENDA.myshopify.com/admin/oauth/access_token" | grep access_token | cut -d'"' -f4)

curl -s -H "X-Shopify-Access-Token: $TOKEN" \
  "https://TU_TIENDA.myshopify.com/admin/api/2025-01/webhooks.json"
```

---

## Importar/Exportar bundles vía CSV

### Exportar

Click en **"📥 Exportar CSV"** desde la interfaz. Genera un archivo con columnas:

```
Bundle Title, Bundle Price, Status, Component 1 ID, Component 1 Title, Component 1 Quantity, ...
```

> <img width="1917" height="444" alt="image" src="https://github.com/user-attachments/assets/1c5abdf3-75de-40c6-a525-c06b0a8a22c0" />


### Importar

Click en **"📤 Importar CSV"** y selecciona un archivo con el mismo formato. La app:
- Crea cada bundle como nuevo producto en Shopify (estado `draft`)
- Busca automáticamente el precio real de cada componente en la base de datos
- Intenta asignar la imagen del primer componente con foto disponible
- Guarda todo en la base de datos local

> **⚠️ Importante:** Los `Component X ID` deben ser GIDs de variante válidos (`gid://shopify/ProductVariant/...`) que existan en tu catálogo sincronizado.

---

## Despliegue en producción

### Stack recomendado

- **Servidor**: EC2 Ubuntu (o cualquier VPS)
- **Proceso**: PM2
- **Acceso público**: ngrok (dominio estático) o Nginx + Let's Encrypt si tienes dominio propio
- **Base de datos**: MySQL local o RDS

### Deploy manual recurrente

```bash
cd /ruta/a/bundles
git pull origin main
npm ci --omit=dev
npx prisma generate
npx prisma db push          # o: npx prisma migrate deploy (si usas migraciones)
pm2 reload bundles-app --update-env
```

### Arranque automático tras reinicio del servidor

```bash
pm2 save
pm2 startup systemd -u TU_USUARIO --hp /home/TU_USUARIO
# ejecuta el comando sudo que PM2 te indique
```

### Cron de sincronización periódica

```bash
crontab -e
```

```cron
# Sincroniza inventario los días 1 y 16 de cada mes a las 8:00
0 8 1,16 * * curl -s -X POST -H "Authorization: Bearer TU_CRON_SECRET" https://tu-dominio.ngrok-free.app/api/trigger-sync-inventory >> /var/log/bundles-cron.log 2>&1
```

---

## Solución de problemas

### ❌ Error: `[API] API Access has been disabled`

**Causa:** el token de acceso está revocado o la app fue desinstalada de la tienda.

**Solución:**
1. Verifica que la app sigue instalada: `Shopify Admin → Settings → Apps and sales channels`
2. Si no aparece, reinstálala desde Partners Dashboard
3. Verifica que el `.env` tiene `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` correctos (no el token antiguo `shpat_...` de versiones anteriores con Railway)

---

### ❌ Error 403 Forbidden en `/locations.json` — `read_locations scope`

**Causa:** Shopify puede rechazar el scope `read_locations` con tokens `client_credentials` aunque esté habilitado en Partners.

**Solución:** fija el `location_id` manualmente en `.env` en lugar de consultarlo cada vez:

```bash
# Obtén tu location_id una sola vez (puede funcionar incluso si /locations.json falla en runtime):
curl -s -H "X-Shopify-Access-Token: $TOKEN" \
  "https://TU_TIENDA.myshopify.com/admin/api/2025-01/locations.json"
```

```dotenv
SHOPIFY_LOCATION_ID=tu_id_numerico
```

---

### ❌ La sincronización solo trae algunos productos, no todos

**Causa:** rate limiting de Shopify durante la paginación.

**Solución:** la app ya incluye reintentos automáticos con backoff (`lib/graphql.js`). Si sigue fallando, aumenta el delay entre páginas en esa misma función.

---

### ❌ El bundle aparece como "Sin existencias" en Shopify aunque los componentes tienen stock

**Causa:** la variante del bundle tiene `inventory_management: "shopify"` activo, por lo que Shopify controla su stock como si fuera un producto normal (y suele estar en 0).

**Solución:** el bundle **nunca** debe gestionar su propio inventario — su disponibilidad depende de los componentes.

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $TOKEN" \
  -d '{"variant":{"inventory_management":null,"inventory_policy":"continue"}}' \
  "https://TU_TIENDA.myshopify.com/admin/api/2025-01/variants/ID_VARIANTE.json"
```

---

### ❌ El webhook responde `success:true` pero el inventario no se descuenta

**Causas posibles:**
1. El `variant_id` enviado no corresponde a un bundle configurado — verifica que el producto tiene el metafield `custom.bundle_config`
2. El token no tiene scope `write_inventory` — revisa los scopes en Partners
3. El `location_id` es incorrecto — ver sección anterior

**Diagnóstico:**
```bash
pm2 logs bundles-app --lines 0
# Y en otra terminal, simula el webhook:
curl -X POST -H "Content-Type: application/json" \
  -d '{"id":999,"line_items":[{"id":1,"title":"NOMBRE_BUNDLE","quantity":1,"variant_id":ID_VARIANTE_BUNDLE,"properties":[]}]}' \
  http://localhost:3000/webhooks/orders/create
```

Busca en los logs si aparece `🎁 Bundle: ...` y `📦 [componente]: -1` para cada uno.

---

### ❌ Error `getAccessToken is not defined`

**Causa:** algún archivo usa `getAccessToken()` sin importarla desde `lib/shopify.js`.

**Solución:** revisa el import al inicio del archivo afectado:
```javascript
import { createRestClient, getAccessToken } from './lib/shopify.js';
```

---

### ❌ Las importaciones/exportaciones CSV no funcionan o aparecen vacías

**Causa común:** dos endpoints distintos compitiendo por la misma ruta `/api/bundles/import` — uno espera JSON, otro espera `FormData`.

**Solución:** asegúrate de que solo existe un endpoint activo para esa ruta y que está definido **antes** de cualquier middleware `multer` en `server.js`.

---

### 🔄 Cómo reiniciar todo desde cero (último recurso)

```bash
pm2 delete bundles-app
pm2 start ecosystem.config.cjs
pm2 save

# Si la DB tiene datos corruptos:
npx prisma db push --force-reset   # ⚠️ borra todos los datos locales
curl -X POST http://localhost:3000/api/sync
```

---

## Estructura del proyecto

```
bundles/
├── server.js                 # Servidor Express principal y endpoints
├── ecosystem.config.cjs      # Configuración PM2
├── cron-sync-inventory.js    # Script de sincronización periódica
├── prisma/
│   └── schema.prisma          # Modelos de datos (Product, Bundle, BundleComponent, SyncLog)
├── lib/
│   ├── shopify.js              # Cliente REST + gestión de token dinámico
│   ├── graphql.js              # Cliente GraphQL + paginación de productos
│   ├── inventory.js            # Ajuste/restauración de inventario
│   ├── bundles.js               # Lógica de bundles y metafields
│   ├── autoSync.js              # Sincronización bidireccional Shopify ↔ DB
│   ├── csvImport.js             # Importación de bundles desde CSV
│   ├── rateLimit.js             # Rate limiting para llamadas a Shopify
│   └── database/                # CRUD sobre MySQL (Prisma)
├── routes/
│   ├── webhooks.js              # orders/create, orders/cancelled
│   ├── csv.js                    # Export/Import CSV
│   └── images-analytics.js      # Subida de imágenes y analytics
├── public/                    # Frontend (HTML/CSS/JS vanilla)
└── theme/
    └── snippets/
        └── bundle-customizer.liquid   # Selector de variantes en la tienda
```

---

## Licencia

Proyecto privado de uso interno para Bruiser Boxing / Capital Sports S.L.
