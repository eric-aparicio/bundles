/**
 * Add change to bundle history
 */
export async function addBundleHistory(productId, action, changes, admin) {
  try {
    const numericId = productId.includes("gid://") ? productId.split("/").pop() : productId;
    
    // Get existing history
    const metafieldsResponse = await admin.get(`/products/${numericId}/metafields.json?namespace=bundle_history`);
    const historyMetafield = metafieldsResponse.metafields?.find(m => m.key === 'change_log');
    
    let history = [];
    if (historyMetafield) {
      try {
        history = JSON.parse(historyMetafield.value);
      } catch (e) {
        history = [];
      }
    }
    
    // Add new history entry
    const newEntry = {
      date: new Date().toISOString(),
      action,
      changes,
      timestamp: Date.now()
    };
    
    history.unshift(newEntry); // Add to beginning
    
    // Keep only last 50 entries
    if (history.length > 50) {
      history = history.slice(0, 50);
    }
    
    // Save updated history
    const metafieldData = {
      metafield: {
        namespace: "bundle_history",
        key: "change_log",
        value: JSON.stringify(history),
        type: "json"
      }
    };
    
    if (historyMetafield) {
      await admin.put(`/products/${numericId}/metafields/${historyMetafield.id}.json`, metafieldData);
    } else {
      await admin.post(`/products/${numericId}/metafields.json`, metafieldData);
    }
    
    return history;
  } catch (error) {
    console.error("Error adding bundle history:", error);
    return [];
  }
}

/**
 * Get bundle history
 */
export async function getBundleHistory(productId, admin) {
  try {
    const numericId = productId.includes("gid://") ? productId.split("/").pop() : productId;
    
    const metafieldsResponse = await admin.get(`/products/${numericId}/metafields.json?namespace=bundle_history`);
    const historyMetafield = metafieldsResponse.metafields?.find(m => m.key === 'change_log');
    
    if (!historyMetafield) {
      return [];
    }
    
    try {
      return JSON.parse(historyMetafield.value);
    } catch (e) {
      return [];
    }
  } catch (error) {
    console.error("Error fetching bundle history:", error);
    return [];
  }
}
