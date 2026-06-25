import { Router } from "express";
import { isBundleVariant } from "../lib/bundles.js";
import { syncBundleInventory, restoreBundleInventory, getDefaultLocation, adjustInventory, getInventoryItemId } from "../lib/inventory.js";
import { createRestClient, getAccessToken } from "../lib/shopify.js";

const router = Router();

function normalizeLineItemProperties(properties) {
  if (Array.isArray(properties)) {
    return properties
      .filter((property) => property && property.name)
      .map((property) => ({
        name: String(property.name),
        value: String(property.value ?? ""),
      }));
  }

  if (properties && typeof properties === "object") {
    return Object.entries(properties).map(([name, value]) => ({
      name: String(name),
      value: String(value ?? ""),
    }));
  }

  return [];
}

function getPropertyValue(properties, name) {
  const found = properties.find((property) => property.name === name);
  return found ? found.value : null;
}

/**
 * Webhook: orders/create
 * Deduct component inventory when bundle is sold
 */
router.post("/orders/create", async (req, res) => {
  try {
    const payload = req.body;
    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();

    console.log(`\n🔔 Webhook: orders/create`);
    console.log(`   Order ID: ${payload.id}`);

    const admin = createRestClient(shop, accessToken);
    const locationId = await getDefaultLocation(admin);

    for (const item of payload.line_items) {
      const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
      const { isBundle, config } = await isBundleVariant(variantId, admin);

      if (!isBundle) continue;

      console.log(`   🎁 Bundle: ${item.title}`);
      const normalizedProperties = normalizeLineItemProperties(item.properties);
      const customizationFlag = getPropertyValue(normalizedProperties, "_bundle_customization");
      const hasItemProperties = normalizedProperties.some((property) => /^Item\s+\d+$/i.test(property.name));
      const hasCustomization = customizationFlag === "true" || hasItemProperties;
      
      // Check if customer selected custom variants
      if (hasCustomization) {
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
          const propertyValue = getPropertyValue(normalizedProperties, componentName)
            || getPropertyValue(normalizedProperties, `Item ${i + 1}`);
          
          if (!propertyValue) {
            console.log(`   ⚠️ No property found for ${componentName}`);
            continue;
          }
          
          // Extract variant from "1 x Product Variant" format
          let variantValue = propertyValue;
          const qtyPrefixMatch = variantValue.match(/^\s*\d+\s*x\s*/i);
          if (qtyPrefixMatch) {
            variantValue = variantValue.slice(qtyPrefixMatch[0].length).trim();
          }
          if (variantValue.startsWith(componentName)) {
            variantValue = variantValue.slice(componentName.length).trim();
          }
          
          // Find matching variant in available_variants
          let matchedVariantId = null;
          
          if (component.available_variants && component.available_variants.length > 0) {
            const matchedVariant = component.available_variants.find(v => {
              const variantTitle = v.title.split(' - ').pop()?.trim() || '';
              const normalizedVariantValue = variantValue.toLowerCase();
              const normalizedVariantTitle = variantTitle.toLowerCase();
              const normalizedFullTitle = v.title.toLowerCase();

              return normalizedVariantTitle === normalizedVariantValue
                     || normalizedFullTitle.includes(normalizedVariantValue)
                     || normalizedVariantValue.includes(normalizedVariantTitle);
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
              variantId: matchedVariantId,
              quantity: component.quantity || 1,
            });
            console.log(`   ✓ ${propertyValue} -> ${matchedVariantId}`);
          }
        }
        
        // Deduct stock from selected variants
        for (const variant of selectedVariants) {
          try {
            const inventoryItemId = await getInventoryItemId(variant.variantId, admin);
            const totalToDeduct = variant.quantity * item.quantity;
            await adjustInventory(inventoryItemId, locationId, -totalToDeduct, admin);
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
    const accessToken = await getAccessToken();

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
