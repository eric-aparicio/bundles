import fetch from 'node-fetch';
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { createRestClient, getAccessToken } from "../lib/shopify.js";
import prisma from "../lib/db.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// PUT /api/bundles/:id/status
router.put("/:id/status", async (req, res) => {
  try {
    const bundleId = req.params.id;
    const { status } = req.body;
    if (!status || !['active', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const shop = process.env.SHOP;
    const accessToken = await getAccessToken();
    const admin = createRestClient(shop, accessToken);
    const numericId = bundleId.includes("gid://") ? bundleId.split("/").pop() : bundleId;
    await admin.put(`/products/${numericId}.json`, {
      product: { id: parseInt(numericId), status }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error changing status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bundles/export
router.get("/export", async (req, res) => {
  try {
    const bundles = await prisma.bundle.findMany({
      include: {
        product: true,
        components: true
      }
    });

    const csvData = bundles.map(bundle => ({
      bundleName: bundle.product.title,
      bundlePrice: bundle.price,
      status: bundle.product.status,
      components: bundle.components.map(c =>
        `${c.productTitle} (x${c.quantity})`
      ).join('; '),
      component_count: bundle.components.length
    }));

    const csv = stringify(csvData, {
      header: true,
      columns: ['bundleName', 'bundlePrice', 'status', 'components', 'component_count']
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bundles.csv"');
    res.send(csv);
  } catch (error) {
    console.error("Error exporting CSV:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


export default router;
