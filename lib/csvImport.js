/**
 * CSV Import Endpoint Handler
 * Bulk create bundles from CSV import
 */

export async function handleCSVImport(req, res, saveBundleConfig, createRestClient) {
  try {
    const { bundles } = req.body;
    
    if (!bundles || !Array.isArray(bundles)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid data format" 
      });
    }

    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);

    console.log(`\n📥 Importing ${bundles.length} bundles from CSV...`);

    let created = 0;
    let errors = 0;

    for (const bundleData of bundles) {
      try {
        const { bundleName, bundlePrice, components, status } = bundleData;

        // Create product in Shopify
        const productData = {
          product: {
            title: bundleName,
            product_type: "Bundle",
            status: status || "draft",
            variants: [{ 
              price: bundlePrice, 
              inventory_management: null 
            }]
          }
        };

        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
        const createResult = await admin.post('/products.json', productData);
        const productId = `gid://shopify/Product/${createResult.product.id}`;

        // Save bundle config
        await new Promise(resolve => setTimeout(resolve, 300));
        await saveBundleConfig(productId, components, admin);

        created++;
        console.log(`   ✅ ${bundleName}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ ${bundleData.bundleName}: ${error.message}`);
      }
    }

    console.log(`\n✅ Import completed: ${created} created, ${errors} errors`);
    res.json({ success: true, created, errors });
    
  } catch (error) {
    console.error("Error importing bundles:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
