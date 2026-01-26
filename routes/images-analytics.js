import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import { createRestClient } from "../lib/shopify.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/bundles/:id/image - Upload custom image for bundle
router.post("/:id/image", upload.single('image'), async (req, res) => {
  try {
    const bundleId = req.params.id;
    const numericId = bundleId.includes("gid://") ? bundleId.split("/").pop() : bundleId;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    
    // Upload image to Shopify
    const formData = new FormData();
    formData.append('image[attachment]', req.file.buffer.toString('base64'));
    formData.append('image[filename]', req.file.originalname);
    
    const response = await fetch(`https://${shop}/admin/api/2024-10/products/${numericId}/images.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: {
          attachment: req.file.buffer.toString('base64'),
          filename: req.file.originalname
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Shopify API Error: ${response.statusText}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bundles/:id/analytics - Get sales analytics for bundle
router.get("/:id/analytics", async (req, res) => {
  try {
    const bundleId = req.params.id;
    const numericId = bundleId.includes("gid://") ? bundleId.split("/").pop() : bundleId;
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    // Get orders containing this product
    const ordersResponse = await admin.get(`/orders.json?limit=250`);
    const orders = ordersResponse.orders || [];
    
    let salesCount = 0;
    
    for (const order of orders) {
      for (const item of order.line_items) {
        if (item.product_id == numericId) {
          salesCount += item.quantity;
        }
      }
    }
    
    res.json({ success: true, sales: salesCount });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
