/**
 * Inventory Management Functions using REST API
 * Handles synchronization of component inventory when bundles are sold/cancelled
 */

/**
 * Get inventory item ID for a variant
 */
export async function getInventoryItemId(variantId, admin) {
  // Extract numeric ID from GID
  const numericId = variantId.includes("gid://") 
    ? variantId.split("/").pop() 
    : variantId;
  
  const result = await admin.get(`/variants/${numericId}.json`);
  return result.variant?.inventory_item_id;
}

/**
 * Get default location for inventory
 */
export async function getDefaultLocation(admin) {
  const result = await admin.get(`/locations.json?limit=1`);
  return result.locations?.[0]?.id;
}

/**
 * Adjust inventory for a specific item
 */
export async function adjustInventory(inventoryItemId, locationId, quantityDelta, admin) {
  // Get current inventory level first
  const levelResult = await admin.get(`/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`);
  const currentLevel = levelResult.inventory_levels?.[0];
  
  if (!currentLevel) {
    throw new Error("Inventory level not found");
  }
  
  // Adjust inventory using inventory_levels/adjust endpoint
  const adjResult = await admin.post(`/inventory_levels/adjust.json`, {
    inventory_item_id: inventoryItemId,
    location_id: locationId,
    available_adjustment: quantityDelta,
  });
  
  return {
    available: adjResult.inventory_level?.available,
    locationName: `Location ${locationId}`,
  };
}

/**
 * Sync bundle inventory when sold (deduct components)
 */
export async function syncBundleInventory(variantId, quantitySold, locationId, bundleConfig, admin) {
  console.log(`\n🔄 Sincronizando inventario para bundle ${variantId}`);
  console.log(`   Cantidad vendida: ${quantitySold}`);
  console.log(`   Componentes: ${bundleConfig.components.length}`);

  const results = [];

  for (const component of bundleConfig.components) {
    const totalToDeduct = component.quantity * quantitySold;
    
    console.log(`   📦 ${component.product_title}: -${totalToDeduct}`);

    try {
      const inventoryItemId = await getInventoryItemId(component.variant_id, admin);
      const result = await adjustInventory(inventoryItemId, locationId, -totalToDeduct, admin);

      results.push({
        variant_id: component.variant_id,
        product_title: component.product_title,
        quantity_deducted: totalToDeduct,
        new_available: result.available,
        success: true,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.push({
        variant_id: component.variant_id,
        product_title: component.product_title,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Restore bundle inventory when cancelled (add back components)
 */
export async function restoreBundleInventory(variantId, quantityCancelled, locationId, bundleConfig, admin) {
  console.log(`\n🔄 Restaurando inventario para bundle ${variantId}`);
  console.log(`   Cantidad cancelada: ${quantityCancelled}`);

  const results = [];

  for (const component of bundleConfig.components) {
    const totalToRestore = component.quantity * quantityCancelled;
    
    console.log(`   📦 ${component.product_title}: +${totalToRestore}`);

    try {
      const inventoryItemId = await getInventoryItemId(component.variant_id, admin);
      const result = await adjustInventory(inventoryItemId, locationId, totalToRestore, admin);

      results.push({
        variant_id: component.variant_id,
        product_title: component.product_title,
        quantity_restored: totalToRestore,
        new_available: result.available,
        success: true,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.push({
        variant_id: component.variant_id,
        product_title: component.product_title,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}
