import prisma from './db.js';
import { getAccessToken } from './shopify.js';

/**
 * CSV Import Endpoint Handler
 * Bulk create bundles from CSV import
 */
export async function handleCSVImport(req, res, saveBundleConfig, createRestClient) {
  try {
    const { bundles } = req.body;
    if (!bundles || !Array.isArray(bundles)) {
      return res.status(400).json({ success: false, message: "Invalid data format" });
    }

    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();
    const admin = createRestClient(shop, accessToken);

    console.log(`\n📥 Importing ${bundles.length} bundles from CSV...`);
    let created = 0;
    let errors = 0;

    for (const bundleData of bundles) {
      try {
        const { bundleName, bundlePrice, components, status } = bundleData;

        // Crear producto en Shopify
        const productData = {
          product: {
            title: bundleName,
            product_type: "Bundle",
            status: status || "draft",
            variants: [{ price: bundlePrice, inventory_management: null }]
          }
        };

        await new Promise(resolve => setTimeout(resolve, 500));
        const createResult = await admin.post('/products.json', productData);
        const productId = `gid://shopify/Product/${createResult.product.id}`;

        // Guardar config en Shopify metafields
        await new Promise(resolve => setTimeout(resolve, 300));
        await saveBundleConfig(productId, components, admin);

        // Guardar producto en DB local
        await prisma.product.upsert({
          where: { id: productId },
          create: {
            id: productId,
            shopifyId: String(createResult.product.id),
            title: bundleName,
            status: status || 'draft',
            variants: createResult.product.variants || [],
          },
          update: {
            title: bundleName,
            status: status || 'draft',
            updatedAt: new Date(),
          }
        });

        // Guardar bundle en DB local
        await prisma.bundle.upsert({
          where: { productId },
          create: {
            productId,
            price: String(bundlePrice),
            status: 'active',
          },
          update: {
            price: String(bundlePrice),
            updatedAt: new Date(),
          }
        });

        created++;
        console.log(`   ✅ ${bundleName}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ ${bundleData.bundleName}: ${error.message}`);
      }
    }

    console.log(`\n✅ Import: ${created} created, ${errors} errors`);
    res.json({ success: true, created, errors });
  } catch (error) {
    console.error("Error importing bundles:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
