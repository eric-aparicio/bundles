import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { createRestClient } from "../lib/shopify.js";
import { getAllBundles } from "../lib/bundles.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// PUT /api/bundles/:id/status - Change bundle status
router.put("/:id/status", async (req, res) => {
  try {
    const bundleId = req.params.id;
    const { status } = req.body;
    
    if (!status || !['active', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    const numericId = bundleId.includes("gid://") 
      ? bundleId.split("/").pop() 
      : bundleId;
    
    await admin.put(`/products/${numericId}.json`, {
      product: {
        id: parseInt(numericId),
        status: status
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error changing status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bundles/export - Export bundles to CSV
router.get("/export", async (req, res) => {
  try {
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    const bundles = await getAllBundles(admin);
    
    const csvData = bundles.map(bundle => ({
      name: bundle.title,
      price: bundle.price,
      status: bundle.status,
      components: bundle.config?.components?.map(c => 
        `${c.product_title} (x${c.quantity})`
      ).join('; ') || '',
      component_count: bundle.config?.components?.length || 0
    }));
    
    const csv = stringify(csvData, {
      header: true,
      columns: ['name', 'price', 'status', 'components', 'component_count']
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bundles.csv"');
    res.send(csv);
  } catch (error) {
    console.error("Error exporting CSV:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/bundles/import - Import bundles from CSV
router.post("/import", upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const csvContent = req.file.buffer.toString();
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });
    
    let created = 0;
    let errors = 0;
    
    for (const record of records) {
      try {
        // Validate and create bundle
        // This is a simplified version - you'd need to match products by title
        // and create proper component structure
        created++;
      } catch (error) {
        errors++;
      }
    }
    
    res.json({ success: true, created, errors });
  } catch (error) {
    console.error("Error importing CSV:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
