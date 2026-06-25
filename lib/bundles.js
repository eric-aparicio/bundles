/**
 * Bundle Management Functions using Shopify REST API
 * Stores bundle configurations in Shopify product metafields
 */

/**
 * Save bundle configuration to product metafield
 * @param {string} productId - Numeric ID of bundle product
 * @param {Array} components - Array of component objects
 * @param {Object} admin - REST client
 * @returns {Promise<Object>} Updated product
 */
export async function saveBundleConfig(productId, components, admin) {
  // Extract numeric ID from GID if provided
  const numericId = productId.includes("gid://") 
    ? productId.split("/").pop() 
    : productId;
  
  // Enrich components with available variants
  const enrichedComponents = [];
  for (const component of components) {
    try {
      const variantId = component.variant_id.split('/').pop();
      
      // Get variant to find product ID
      const variantResponse = await admin.get(`/variants/${variantId}.json`);
      const productId = variantResponse.variant.product_id;
      
      // Get product with variants
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit
      const productResponse = await admin.get(`/products/${productId}.json`);
      const product = productResponse.product;
      
      // Build available variants list
      const availableVariants = product.variants.map(v => ({
        id: `gid://shopify/ProductVariant/${v.id}`,
        title: v.title,
        price: v.price,
        available: v.inventory_quantity > 0 || v.inventory_policy === 'continue'
      }));
      
      enrichedComponents.push({
        ...component,
        allow_variant_selection: product.variants.length > 1, // Only if multiple variants
        available_variants: availableVariants,
        default_variant_id: component.variant_id
      });
      
    } catch (error) {
      console.error(`   ⚠️  Could not enrich component ${component.product_title}:`, error.message, error.stack);
      // Fallback: use component as-is
      enrichedComponents.push({
        ...component,
        allow_variant_selection: false,
        available_variants: [],
        default_variant_id: component.variant_id
      });
    }
  }
  
  const metafieldValue = {
    is_bundle: true,
    allow_customization: true, // Enable customization
    components: enrichedComponents,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  // Use Product Metafield REST endpoint
  console.log(`   💾 Saving metafield for product ${numericId}...`);
  const result = await admin.post(`/products/${numericId}/metafields.json`, {
    metafield: {
      namespace: "custom",
      key: "bundle_config",
      type: "json",
      value: JSON.stringify(metafieldValue),
    },
  });
  
  return result.metafield;
}

/**
 * Get bundle configuration from product
 * @param {string} productId - Numeric ID of product
 * @param {Object} admin - REST client
 * @returns {Promise<Object|null>} Bundle config or null
 */
export async function getBundleConfig(productId, admin) {
  const numericId = productId.includes("gid://") 
    ? productId.split("/").pop() 
    : productId;
  
  try {
    const result = await admin.get(`/products/${numericId}/metafields.json`);
    
    // Find the bundle_config metafield
    const bundleMetafield = result.metafields?.find(
      (m) => m.namespace === "custom" && m.key === "bundle_config"
    );
    
    if (!bundleMetafield) return null;
    
    return JSON.parse(bundleMetafield.value);
  } catch (error) {
    return null;
  }
}

/**
 * Get all bundles (products with bundle_config metafield)
 * @param {Object} admin - REST client
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Array of bundles
 */
export async function getAllBundles(admin) {
  try {
    // Get all products with limit - REDUCE to 50 to avoid rate limiting
    const productsResponse = await admin.get("/products.json?limit=50&fields=id,title,image,images,variants,status,product_type");
    const products = productsResponse.products || [];

    const bundles = [];
    let processedCount = 0;
    const maxBundles = 20; // Limit to 20 bundles to avoid rate limiting

    console.log(`📦 Checking ${products.length} products for bundles...`);

    for (const product of products) {
      // Stop if we've found enough bundles
      if (bundles.length >= maxBundles) {
        console.log(`⚠️ Reached limit of ${maxBundles} bundles, stopping search`);
        break;
      }

      try {
        // AGGRESSIVE RATE LIMITING: 800ms delay between each request
        await new Promise(resolve => setTimeout(resolve, 800));
        
        processedCount++;
        if (processedCount % 5 === 0) {
          console.log(`   Processed ${processedCount}/${products.length} products...`);
        }
        
        // Get metafields for this specific product
        const metafieldsResponse = await admin.get(`/products/${product.id}/metafields.json?namespace=custom&key=bundle_config`);
        const metafields = metafieldsResponse.metafields || [];
        
        // Find bundle_config metafield
        const bundleMetafield = metafields.find(m => m.key === 'bundle_config');
        
        if (!bundleMetafield) continue; // Skip if not a bundle
        
        let config = {};
        try {
          config = JSON.parse(bundleMetafield.value);
        } catch (e) {
          console.error(`Error parsing bundle config for product ${product.id}`);
          continue;
        }

        bundles.push({
          id: `gid://shopify/Product/${product.id}`,
          title: product.title,
          price: product.variants?.[0]?.price,
          inventoryQuantity: product.variants?.[0]?.inventory_quantity || 0,
          image: product.image?.src || product.images?.[0]?.src,
          status: product.status,
          config: config,
        });
        
        console.log(`   ✅ Found bundle: ${product.title}`);
      } catch (error) {
        if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
          console.error(`⚠️ Rate limit hit! Waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        console.error(`Error fetching metafields for product ${product.id}:`, error.message);
        continue;
      }
    }

    console.log(`✅ Loaded ${bundles.length} bundles (checked ${processedCount} products)`);
    return bundles;
  } catch (error) {
    console.error("Error in getAllBundles:", error);
    throw error;
  }
}

/**
 * Delete bundle configuration from product
 * @param {string} productId - Numeric ID or GID of product
 * @param {Object} admin - REST client
 * @returns {Promise<void>}
 */
export async function deleteBundleConfig(productId, admin) {
  const numericId = productId.includes("gid://") 
    ? productId.split("/").pop() 
    : productId;
  
  // Get metafields to find the bundle_config metafield ID
  const result = await admin.get(`/products/${numericId}/metafields.json`);
  const bundleMetafield = result.metafields?.find(
    (m) => m.namespace === "custom" && m.key === "bundle_config"
  );
  
  if (bundleMetafield) {
    await admin.delete(`/products/${numericId}/metafields/${bundleMetafield.id}.json`);
  }
}

/**
 * Check if a variant is a bundle
 * @param {string} variantId - Numeric ID or GID of variant
 * @param {Object} admin - REST client
 * @returns {Promise<Object>} {isBundle, config}
 */
export async function isBundleVariant(variantId, admin) {
  const numericId = variantId.includes("gid://") 
    ? variantId.split("/").pop() 
    : variantId;
  
  try {
    // Get variant to find product ID
    const variantResult = await admin.get(`/variants/${numericId}.json`);
    const productId = `gid://shopify/Product/${variantResult.variant.product_id}`;
    
    // Get product metafields
    const config = await getBundleConfig(productId, admin);
    
    if (!config) {
      return { isBundle: false, config: null };
    }
    
    return { isBundle: config.is_bundle === true, config };
  } catch (error) {
    console.error(`   ⚠️ isBundleVariant error for ${variantId}:`, error.message);
    return { isBundle: false, config: null };
  }
}
/**
 * Get all variants for a product
 */
export async function getProductVariants(productId, admin) {
  try {
    const numericId = productId.includes("gid://") ? productId.split("/").pop() : productId;
    
    const productResponse = await admin.get(`/products/${numericId}.json`);
    const product = productResponse.product;
    
    return product.variants.map(v => ({
      id: `gid://shopify/ProductVariant/${v.id}`,
      numericId: v.id,
      title: v.title,
      price: v.price,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      inventory_quantity: v.inventory_quantity || 0
    }));
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return [];
  }
}
