# Shopify Bundles App

Sistema completo para crear y gestionar bundles (packs) de productos en Shopify con selección de variantes personalizables.

## Características Principales

- **Interfaz de administración web** - Crea y edita bundles desde una UI intuitiva
- **Selección de variantes** - Los clientes eligen variantes de cada componente del pack
- **Precio especial del bundle** - Define un precio reducido para el pack completo
- **Gestión automática de inventario** - Webhooks actualizan el stock de cada componente
- **PostgreSQL + Shopify sync** - Base de datos local para rapidez + sincronización con Shopify
- **Theme integration** - Snippet Liquid para mostrar bundles en product pages

## Ejemplo de Bundle

**PACK BRUISER ELITE BOXING - €50.00** (ahorro de €10 vs componentes individuales)

Componentes:

- Pantalón de Boxeo (variantes: L, M, XL)
- Vendas Bruiser (variantes: NEGRO/Adulto, AZUL/Adulto)
- Protector Bucal (variantes: NEGRO/ROJO, AZUL/AMARILLO)
- Guantes MMA (variantes: L/XL, S/M)

## Arquitectura

```text
┌─────────────────┐
│  Admin UI       │ ← Crea/edita bundles
│  (Frontend)     │
└────────┬────────┘
         │
┌────────▼────────┐
│  Express Server │ ← API + Webhooks
│  (Backend)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐  ┌─▼───────┐
│ Shopify│  │PostgreSQL│
└────────┘  └──────────┘
```

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL + Prisma ORM
- **Frontend**: Vanilla HTML/CSS/JS (Admin UI)
- **Integration**: Shopify Admin API + Webhooks
- **Deployment**: AWS (App Runner + RDS) / Railway / Vercel
- **Theme**: Liquid (Shopify)

## Estructura del Proyecto

```text
bundles/
├── server.js                    # Express server
├── lib/                         # Business logic
│   ├── shopify.js              # Shopify API client
│   ├── bundles.js              # Bundle operations
│   └── database/               # Database operations
├── routes/
│   ├── webhooks.js             # Shopify webhooks
│   └── csv.js                  # Exports
├── public/                     # Admin UI
│   └── index.html              # Dashboard
├── prisma/                     # Database schema
│   └── schema.prisma
├── theme/                      # Shopify theme files
│   ├── snippets/
│   │   └── bundle-customizer.liquid
│   └── sections/
│       └── main-order.liquid
└── scripts/                    # Maintenance
    └── sync.js
```

## Configuración

### 1. Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
# Shopify
SHOP=tu-tienda.myshopify.com
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_APP_URL=https://tu-app.apprunner.aws

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Session
SESSION_SECRET=random-secret-key

# Cron (AWS EventBridge)
CRON_SECRET=token-seguro-para-cron

# Server
PORT=3000
NODE_ENV=production
```

### 2. Instalación

```bash
# Instalar dependencias
npm install

# Generar Prisma Client
npm run prisma:generate

# Migrar base de datos
npm run prisma:migrate
```

### 3. Desarrollo Local

```bash
# Iniciar servidor de desarrollo
npm run dev

# Servidor iniciará en http://localhost:3000
```

## Integración con Tema Shopify

### 1. Subir archivos del tema

```text
theme/snippets/bundle-customizer.liquid → Themes > Edit code > snippets/
theme/sections/main-order.liquid → Themes > Edit code > sections/
```

### 2. Incluir en product template

Agrega en tu `sections/main-product.liquid` o template correspondiente:

```liquid
{% render 'bundle-customizer', product: product %}
```

## Cómo Funciona

### Creación de Bundle

1. Admin accede a la UI web (`/`)
2. Busca productos y selecciona componentes
3. Define precio del bundle
4. App crea:
   - Producto en Shopify
   - Metafield `custom.bundle_config` con configuración
   - Registro en PostgreSQL

### Compra de Bundle

1. Cliente ve producto bundle en storefront
2. `bundle-customizer.liquid` lee metafield y muestra opciones
3. Cliente selecciona variantes de cada componente
4. Al agregar al carrito:
   - Se crea 1 line item (el bundle)
   - Con properties mostrando componentes seleccionados
5. Al completar pedido:
   - Webhook `orders/create` se dispara
   - App reduce inventario de cada componente

## Scripts Útiles

```bash
# Crear pedido de prueba
node test-create-order-clean.js

# Inspeccionar metafields de un producto
node test-inspect-metafields.js

# Sincronizar productos desde Shopify
node scripts/sync.js

# Visualizar base de datos
npm run prisma:studio
```

## Deployment

### AWS Servidor (Recomendado)

Si ya tienes servidor en AWS (EC2), sigue [AWS_SETUP.md](AWS_SETUP.md):

1. Preparar EC2 + RDS
2. Configurar `.env` en servidor
3. Levantar app con PM2 (`ecosystem.config.cjs`)
4. Publicar con Nginx + SSL
5. Actualizar webhooks Shopify
6. Configurar cron quincenal

Arranque productivo:

```bash
npm run start:aws
```

### Railway (Alternativa)

1. Conecta el repositorio GitHub
2. Railway detecta automáticamente `package.json`
3. Configura variables de entorno
4. Deploy automático en cada push

### Comandos

- `npm start` - Producción
- `npm run dev` - Desarrollo
- `npm run prisma:migrate` - Migrar BD

## Troubleshooting

### Bundle no se muestra

```bash
# Verificar metafield
node test-inspect-metafields.js

# Verificar que bundle-customizer.liquid está en tema
# Admin > Themes > Edit code > snippets/
```

### Inventario no se reduce

```bash
# Verificar webhooks en Shopify Admin
# Settings > Notifications > Webhooks

# Ver logs en servidor AWS (PM2)
# pm2 logs bundles-v2 --lines 100
```

## Documentación Completa

Para documentación técnica detallada, ver [`DOCUMENTACION.md`](./DOCUMENTACION.md):

- Arquitectura completa del sistema
- Flujo de datos paso a paso
- Guía de troubleshooting
- Mejoras futuras

## Contribuir

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto es privado y propiedad de Bruiser.

## Links Útiles

- [Shopify Admin API Docs](https://shopify.dev/docs/api/admin-rest)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com)

## Permisos Requeridos (Shopify API)

- `read_products` - Leer productos
- `write_products` - Crear/modificar bundles
- `write_metafields` - Guardar configuración
- `read_orders` - Procesar pedidos
- `write_inventory` - Actualizar stock

---

**Desarrollado para Bruiser** | [Reportar Issue](https://github.com/eric-aparicio/bundles/issues)
