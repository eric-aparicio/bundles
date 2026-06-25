import { Router } from "express";
import { getAllBundles, saveBundleConfig, deleteBundleConfig } from "../lib/bundles.js";
import { createGraphQLClient } from "../lib/shopify.js";

const router = Router();

/**
 * GET /api/bundles
 * Get all bundles
 */
router.get("/bundles", async (req, res) => {
  try {
    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();
    
    const admin = createGraphQLClient(shop, accessToken);
    const bundles = await getAllBundles(admin, 100);
    
    res.json({ success: true, bundles });
  } catch (error) {
    console.error("Error loading bundles:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/bundles
 * Create a new bundle
 */
router.post("/bundles", async (req, res) => {
  try {
    const { productId, components } = req.body;
    
    if (!productId || !components) {
      return res.status(400).json({ success: false, message: "Missing productId or components" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();
    
    const admin = createGraphQLClient(shop, accessToken);
    await saveBundleConfig(productId, components, admin);
    
    res.json({ success: true, message: "Bundle created successfully" });
  } catch (error) {
    console.error("Error creating bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/bundles
 * Delete a bundle
 */
router.delete("/bundles", async (req, res) => {
  try {
    const { bundleId } = req.body;  
    
    if (!bundleId) {
      return res.status(400).json({ success: false, message: "Missing bundleId" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();
    
    const admin = createGraphQLClient(shop, accessToken);
    await deleteBundleConfig(bundleId, admin);
    
    res.json({ success: true, message: "Bundle deleted successfully" });
  } catch (error) {
    console.error("Error deleting bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
