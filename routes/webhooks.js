import { Router } from "express";
import { isBundleVariant } from "../lib/bundles.js";
import { syncBundleInventory, restoreBundleInventory, getDefaultLocation, adjustInventory } from "../lib/inventory.js";
import { createRestClient } from "../lib/shopify.js";

const router = Router();

/**
 * Webhook: orders/create
 * Deduct component inventory when bundle is sold
 */
router.post("/orders/create", async (req, res) => {
  try {
    const payload = req.body;
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

    console.log(`\n🔔 Webhook: orders/create`);
    console.log(`   Order ID: ${payload.id}`);

    const admin = createRestClient(shop, accessToken);
    const locationId = await getDefaultLocation(admin);

    for (const item of payload.line_items) {
      const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
      const { isBundle, config } = await isBundleVariant(variantId, admin);

      if (!isBundle) continue;

      console.log(`   🎁 Bundle: ${item.title}`);
      
      // Check if customer selected custom variants
      if (item.properties && item.properties._bundle_customization === 'true') {
        console.log(`   🎨 Custom variants selected`);
        
        if (!config || !config.components) {
          console.log(`   ⚠️ No bundle config found, skipping customization`);
          continue;
        }
        
        // Match property values to component variants
        const selectedVariants = [];
        
        for (let i = 0; i < config.components.length; i++) {
          const component = config.components[i];
          const componentName = component.product_title.split(' - ')[0];
          
          // Find the property value for this component
          // Format is "1 x PRODUCT_NAME VARIANT" or just "VARIANT"
          const propertyValue = item.properties[componentName];
          
          if (!propertyValue) {
            console.log(`   ⚠️ No property found for ${componentName}`);
            continue;
          }
          
          // Extract variant from "1 x Product Variant" format
          let variantValue = propertyValue;
          if (propertyValue.includes(' x ')) {
            // Format: "1 x PRODUCT_NAME VARIANT"
            const parts = propertyValue.split(' x ');
            if (parts.length > 1) {
              // Get everything after "1 x PRODUCT_NAME "
              const afterProduct = parts[1].replace(componentName, '').trim();
              variantValue = afterProduct;
            }
          }
          
          // Find matching variant in available_variants
          let matchedVariantId = null;
          
          if (component.available_variants && component.available_variants.length > 0) {
            const matchedVariant = component.available_variants.find(v => {
              const variantTitle = v.title.split(' - ').pop();
              return variantTitle === variantValue || 
                     v.title.includes(variantValue) ||
                     variantValue.includes(variantTitle);
            });
            
            if (matchedVariant) {
              matchedVariantId = matchedVariant.id;
            }
          }
          
          // Fallback to default variant
          if (!matchedVariantId) {
            matchedVariantId = component.variant_id || component.default_variant_id;
          }
          
          if (matchedVariantId) {
            selectedVariants.push({
              name: componentName,
              value: propertyValue,
              variantId: matchedVariantId
            });
            console.log(`   ✓ ${propertyValue} -> ${matchedVariantId}`);
          }
        }
        
        // Deduct stock from selected variants
        for (const variant of selectedVariants) {
          try {
            await adjustInventory(variant.variantId, -item.quantity, locationId, admin);
          } catch (error) {
            console.error(`   ❌ Error adjusting ${variant.variantId}:`, error.message);
          }
        }
      } else {
        // Default behavior: use configured components
        await syncBundleInventory(variantId, item.quantity, locationId, config, admin);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`❌ Error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Webhook: orders/cancelled
 * Restore component inventory when order is cancelled
 */
router.post("/orders/cancelled", async (req, res) => {
  try {
    const payload = req.body;
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

    console.log(`\n🔔 Webhook: orders/cancelled`);
    console.log(`   Order ID: ${payload.id}`);

    const admin = createRestClient(shop, accessToken);
    const locationId = await getDefaultLocation(admin);

    for (const item of payload.line_items) {
      const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
      const { isBundle, config } = await isBundleVariant(variantId, admin);

      if (!isBundle) continue;

      console.log(`   🎁 Bundle: ${item.title}`);
      await restoreBundleInventory(variantId, item.quantity, locationId, config, admin);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`❌ Error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
