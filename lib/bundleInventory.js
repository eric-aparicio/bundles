/**
 * Bundle Inventory Management
 * Calculates and updates bundle inventory based on component availability
 */

/**
 * Calculate bundle inventory based on component availability
 * @param {Object} bundleConfig - Bundle configuration with components
 * @param {Object} admin - Shopify REST client
 * @returns {Promise<{available: number, limitedBy: {product: string, variant: string, quantity: number}}>}
 */
export async function calculateBundleInventory(bundleConfig, admin) {
  if (!bundleConfig.is_bundle || !bundleConfig.components) {
    throw new Error('Invalid bundle configuration');
  }

  let minAvailable = Infinity;
  let limitingFactor = {
    product: '',
    variant: '',
    quantity: 0
  };

  console.log(`   Calculating inventory for ${bundleConfig.components.length} components...`);

  for (const component of bundleConfig.components) {
    try {
      // Extract variant ID from GID or use directly
      const variantId = component.variant_id?.includes('gid://') 
        ? component.variant_id.split('/').pop()
        : component.variant_id;

      if (!variantId) {
        console.warn(`   ⚠️ Component missing variant_id, skipping`);
        continue;
      }

      // Get variant details including inventory
      const variantResponse = await admin.get(`/variants/${variantId}.json`);
      const variant = variantResponse.variant;

      // Get product name for logging
      const productResponse = await admin.get(`/products/${variant.product_id}.json`);
      const product = productResponse.product;

      const componentQuantity = component.quantity || 1;
      const availableInventory = variant.inventory_quantity || 0;
      
      // Calculate how many bundles we can make with this component
      const bundlesFromThis = Math.floor(availableInventory / componentQuantity);

      console.log(`   → ${product.title} (${variant.title}): ${availableInventory} units → ${bundlesFromThis} bundles`);

      if (bundlesFromThis < minAvailable) {
        minAvailable = bundlesFromThis;
        limitingFactor = {
          product: product.title,
          variant: variant.title,
          quantity: availableInventory
        };
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error(`   ❌ Error fetching component inventory:`, error.message);
      // If we can't get inventory, assume 0 to be safe
      minAvailable = 0;
    }
  }

  const available = minAvailable === Infinity ? 0 : minAvailable;

  return {
    available,
    limitedBy: limitingFactor
  };
}

/**
 * Update bundle inventory in Shopify
 * @param {string|number} productId - Shopify product ID (numeric or GID)
 * @param {number} quantity - New inventory quantity
 * @param {Object} admin - Shopify REST client
 */
export async function updateBundleInventory(productId, quantity, admin) {
  try {
    // Extract numeric ID if GID provided
    const numericId = String(productId).includes('gid://') 
      ? productId.split('/').pop()
      : productId;

    // Get product to find variant and location
    const productResponse = await admin.get(`/products/${numericId}.json`);
    const product = productResponse.product;
    
    if (!product.variants || product.variants.length === 0) {
      throw new Error('Product has no variants');
    }

    const variant = product.variants[0]; // Bundles have only one variant
    
    // Get default location
    const locationsResponse = await admin.get('/locations.json');
    const locations = locationsResponse.locations;
    
    if (locations.length === 0) {
      throw new Error('No locations found');
    }
    
    const locationId = locations[0].id;

    // Set inventory level
    await admin.post('/inventory_levels/set.json', {
      location_id: locationId,
      inventory_item_id: variant.inventory_item_id,
      available: quantity
    });

    console.log(`   ✅ Inventory updated: ${quantity} units at location ${locations[0].name}`);

  } catch (error) {
    console.error(`   ❌ Error updating inventory:`, error.message);
    throw error;
  }
}
