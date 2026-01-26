import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import webhooksRouter from "./routes/webhooks.js";
import csvRouter from "./routes/csv.js";
import imagesAnalyticsRouter from "./routes/images-analytics.js";
import { getAllBundles, getBundleConfig, saveBundleConfig, deleteBundleConfig, getProductVariants } from "./lib/bundles.js";
import { createRestClient } from "./lib/shopify.js";
import { checkAndSyncDatabase, syncFromShopify } from "./lib/autoSync.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== "production";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security headers for Shopify iframe embedding
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com");
  res.setHeader("X-Frame-Options", "ALLOW-FROM https://admin.shopify.com");
  next();
});

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: !isDevelopment,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  })
);

// Static files (serves index.html at root)
app.use(express.static("public"));

// Health check (moved to /api/status)
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    app: "Shopify Bundles App",
    version: "2.0.0",
    shop: process.env.SHOP,
  });
});

// OAuth: Begin
app.get("/auth", async (req, res) => {
  try {
    const shop = req.query.shop || process.env.SHOP;

    if (!shop) {
      return res.status(400).send("Missing shop parameter");
    }

    const authRoute = await shopify.auth.begin({
      shop,
      callbackPath: "/auth/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    res.redirect(authRoute);
  } catch (error) {
    console.error("Error in /auth:", error);
    res.status(500).send("Error initiating OAuth");
  }
});

// OAuth: Callback
app.get("/auth/callback", async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;

    // Store session
    req.session.shop = session.shop;
    req.session.accessToken = session.accessToken;
    
    console.log(`✅ OAuth successful for shop: ${session.shop}`);

    res.send(`
      <html>
        <body>
          <h1>✅ Authentication Successful!</h1>
          <p>Shop: ${session.shop}</p>
          <p>Access token saved to session.</p>
          <p><a href="/">Go to dashboard</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error in auth callback:", error);
    res.status(500).send("Error completing OAuth");
  }
});

// API Routes (inline to avoid router issues in Railway)
app.get("/api/bundles", async (req, res) => {
  try {
    console.log('📦 Loading bundles from database...');
    const startTime = Date.now();
    
    // Load from PostgreSQL instead of Shopify API
    const { getAllBundles: getBundlesFromDB } = await import('./lib/database/bundles.js');
    const bundlesWithRelations = await getBundlesFromDB();
    
    // Transform to match frontend format
    const bundles = bundlesWithRelations.map(bundle => ({
      id: bundle.product.id,
      title: bundle.product.title,
      price: bundle.price,
      inventoryQuantity: bundle.product.variants?.[0]?.inventory_quantity || 0,
      image: bundle.product.imageUrl,
      status: bundle.product.status,
      config: {
        is_bundle: true,
        components: bundle.components.map(c => ({
          variant_id: c.variantId,
          product_title: c.productTitle,
          price: c.price,
          quantity: c.quantity,
        })),
      },
    }));
    
    const duration = Date.now() - startTime;
    console.log(`✅ Loaded ${bundles.length} bundles in ${duration}ms (from database)`);
    
    res.json({ success: true, bundles });
  } catch (error) {
    console.error("Error loading bundles:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products - Search products for bundle creation
app.get("/api/products", async (req, res) => {
  try {
    console.log('🔍 Searching products in database...');
    const searchQuery = (req.query.q || "").toLowerCase().trim();
    const limit = parseInt(req.query.limit) || 250;
    
    // Load from PostgreSQL instead of Shopify API
    const { getAllProducts } = await import('./lib/database/products.js');
    const products = await getAllProducts({
      search: searchQuery,
      limit,
      status: 'active', // Only show active products
    });
    
    // Format products for UI
    const formattedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      image: product.imageUrl,
      variants: (product.variants || []).map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
      })),
    }));
    
    console.log(`✅ Found ${formattedProducts.length} products (database)`);
    
    res.json({ success: true, products: formattedProducts });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/bundles/:id - Get single bundle for editing
// GET /api/products/:id/variants - Get all variants for a product
app.get("/api/products/:id/variants", async (req, res) => {
  try {
    const productId = req.params.id;
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    const variants = await getProductVariants(productId, admin);
    
    res.json({ success: true, variants });
  } catch (error) {
    console.error("Error fetching variants:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.get("/api/bundles/:id", async (req, res) => {
  try {
    const bundleId = req.params.id;
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    
    const admin = createRestClient(shop, accessToken);
    
    // Extract numeric ID
    const numericId = bundleId.includes("gid://") 
      ? bundleId.split("/").pop() 
      : bundleId;
    
    // Get product details
    const productResult = await admin.get(`/products/${numericId}.json`);
    const product = productResult.product;
    
    // Get bundle config
    const bundleConfig = await getBundleConfig(`gid://shopify/Product/${product.id}`, admin);
    
    res.json({
      success: true,
      bundle: {
        id: `gid://shopify/Product/${product.id}`,
        title: product.title,
        price: product.variants[0]?.price,
        image: product.image?.src || product.images?.[0]?.src,
        components: bundleConfig?.components || []
      }
    });
  } catch (error) {
    console.error("Error fetching bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/bundles", async (req, res) => {
  try {
    const { bundleName, bundlePrice, components } = req.body;
    
    if (!components || !bundleName || !bundlePrice) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    console.log(`\n📦 Creating bundle: ${bundleName}`);
    console.log(`   Components: ${components.length}`);
    
    // Get images from ALL components
    const componentImages = [];
    const seenProducts = new Set();
    const maxImages = Math.min(components.length, 10); // Up to 10 images (all components)
    
    for (const component of components) {
      // Stop if we have enough images
      if (componentImages.length >= maxImages) {
        console.log(`   ✅ Collected all ${maxImages} component images`);
        break;
      }

      try {
        const variantId = component.variant_id.split('/').pop();
        
        // AGGRESSIVE RATE LIMITING: 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const variantResponse = await admin.get(`/variants/${variantId}.json`);
        const productId = variantResponse.variant.product_id;
        
        // Skip if we already fetched this product's image
        if (seenProducts.has(productId)) continue;
        seenProducts.add(productId);
        
        // Get product with images
        await new Promise(resolve => setTimeout(resolve, 500));
        const productResponse = await admin.get(`/products/${productId}.json`);
        const product = productResponse.product;
        
        // Collect image
        const imageUrl = product.image?.src || product.images?.[0]?.src;
        if (imageUrl) {
          componentImages.push({
            src: imageUrl,
            alt: `${product.title}`
          });
          console.log(`   ✅ Image from: ${product.title}`);
        }
      } catch (e) {
        if (e.message.includes('429') || e.message.includes('Too Many Requests')) {
          console.log(`   ⚠️ Rate limit hit! Waiting 5 seconds before continuing...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        console.log(`   ⚠️ Could not fetch image for component: ${e.message}`);
        continue;
      }
    }
    
    console.log(`   Total images collected: ${componentImages.length}`);
    
    // Log the images we're about to add
    if (componentImages.length > 0) {
      console.log(`   📸 Images to add:`);
      componentImages.forEach((img, i) => {
        console.log(`      ${i + 1}. ${img.alt} - ${img.src.substring(0, 60)}...`);
      });
    }
    
    // Create product with all component images
    const productData = {
      product: {
        title: bundleName,
        product_type: "Bundle",
        status: "draft",
        variants: [{
          price: bundlePrice,
          inventory_management: null,
        }]
      }
    };
    
    // Add all component images to product
    if (componentImages.length > 0) {
      productData.product.images = componentImages;
      console.log(`   ✅ Added ${componentImages.length} images to product data`);
    } else {
      console.log(`   ⚠️ No images to add - bundle will have no images`);
    }
    
    // Extra delay before creating product
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`   Creating product in Shopify...`);
    const createResult = await admin.post('/products.json', productData);
    const newProduct = createResult.product;
    const productId = `gid://shopify/Product/${newProduct.id}`;
    
    console.log(`   ✅ Product created: ${productId}`);
    console.log(`   📸 Product has ${newProduct.images?.length || 0} images in Shopify`);
    
    // Save bundle configuration to metafield with delay
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`   Saving bundle configuration...`);
    await saveBundleConfig(productId, components, admin);
    
    // Save to PostgreSQL database
    try {
      console.log(`\n   💾 === DATABASE SAVE STARTED ===`);
      console.log(`   Product ID: ${productId}`);
      console.log(`   Bundle Name: ${bundleName}`);
      console.log(`   Bundle Price: ${bundlePrice}`);
      console.log(`   Components count: ${components.length}`);
      
      const { createBundle: saveBundleDB } = await import('./lib/database/bundles.js');
      const { upsertProduct } = await import('./lib/database/products.js');
      console.log(`   ✅ Database modules imported`);
      
      // Prepare product data with explicit field mapping
      const productData = {
        id: productId,
        title: bundleName,
        status: 'active',
        product_type: 'Bundle',
        image: newProduct.images?.[0]?.src || componentImages[0]?.src || null,
        images: newProduct.images || componentImages || [],
        variants: newProduct.variants || []
      };
      
      console.log(`   → Product data prepared:`, JSON.stringify(productData, null, 2));
      console.log(`   → Calling upsertProduct...`);
      
      await upsertProduct(productData);
      console.log(`   ✅ Product upserted successfully`);
      
      // Prepare components data
      console.log(`   → Preparing components for bundle save...`);
      console.log(`   → Components data:`, JSON.stringify(components, null, 2));
      console.log(`   → Calling createBundle with productId: ${productId}`);
      
      await saveBundleDB(productId, components, bundlePrice);
      console.log(`   ✅✅✅ BUNDLE SAVED TO DATABASE SUCCESSFULLY!`);
      console.log(`   === DATABASE SAVE COMPLETED ===\n`);
    } catch (dbError) {
      console.error(`\n   ❌❌❌ DATABASE SAVE FAILED ===`);
      console.error(`   Error name: ${dbError.name}`);
      console.error(`   Error message: ${dbError.message}`);
      console.error(`   Error code: ${dbError.code}`);
      console.error(`   Full error:`, dbError);
      console.error(`   Stack trace:`, dbError.stack);
      console.error(`   === DATABASE SAVE ERROR END ===\n`);
      // Don't fail the request - bundle exists in Shopify
    }
    
    console.log(`   ✅ Bundle created successfully!\n`);
    
    res.json({ 
      success: true, 
      message: "Bundle created successfully",
      productId: productId,
      bundle: {
        id: productId,
        title: bundleName,
        price: bundlePrice,
        image: newProduct.images?.[0]?.src || componentImages[0]?.src || null,
        images: newProduct.images || componentImages,
        imageCount: newProduct.images?.length || componentImages.length,
        config: {
          is_bundle: true,
          components: components
        }
      }
    });
  } catch (error) {
    console.error("❌ Error creating bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/bundles/import - Bulk import bundles from CSV
app.post("/api/bundles/import", async (req, res) => {
  try {
    const { bundles } = req.body;
    if (!bundles || !Array.isArray(bundles)) {
      return res.status(400).json({ success: false, message: "Invalid data format" });
    }

    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);

    console.log(`\n📥 Importing ${bundles.length} bundles from CSV...`);
    let created = 0, errors = 0;

    for (const bundleData of bundles) {
      try {
        const { bundleName, bundlePrice, components, status } = bundleData;
        const productData = {
          product: {
            title: bundleName,
            product_type: "Bundle",
            status: status || "draft",
            variants: [{ price: bundlePrice, inventory_management: null }]
          }
        };

        await new Promise(resolve => setTimeout(resolve, 500));
        const createResult = await admin.post('/products.json', productData);
        const productId = `gid://shopify/Product/${createResult.product.id}`;

        await new Promise(resolve => setTimeout(resolve, 300));
        await saveBundleConfig(productId, components, admin);
        created++;
        console.log(`   ✅ ${bundleName}`);
      } catch (error) {
        errors++;
        console.error(`   ❌ ${bundleData.bundleName}: ${error.message}`);
      }
    }

    console.log(`\n✅ Import: ${created} created, ${errors} errors`);
    res.json({ success: true, created, errors });
  } catch (error) {
    console.error("Error importing bundles:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// PUT /api/bundles/:id - Update existing bundle
app.put("/api/bundles/:id", async (req, res) => {
  try {
    const bundleId = req.params.id;
    const { bundleName, bundlePrice, components } = req.body;
    
    if (!bundleName || !bundlePrice || !components) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    const admin = createRestClient(shop, accessToken);
    
    // Extract numeric ID
    const numericId = bundleId.includes("gid://") 
      ? bundleId.split("/").pop() 
      : bundleId;
    
    // Update product title and price
    await admin.put(`/products/${numericId}.json`, {
      product: {
        id: parseInt(numericId),
        title: bundleName,
        variants: [{
          id: (await admin.get(`/products/${numericId}.json`)).product.variants[0].id,
          price: bundlePrice
        }]
      }
    });
    
    // Update bundle configuration
    await saveBundleConfig(`gid://shopify/Product/${numericId}`, components, admin);
    
    res.json({ success: true, message: "Bundle updated successfully" });
  } catch (error) {
    console.error("Error updating bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete("/api/bundles", async (req, res) => {
  try {
    const { bundleId } = req.body;
    
    if (!bundleId) {
      return res.status(400).json({ success: false, message: "Missing bundleId" });
    }
    
    const shop = process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    
    const admin = createRestClient(shop, accessToken);
    
    // Extract numeric ID from GID
    const numericId = bundleId.includes("gid://") 
      ? bundleId.split("/").pop() 
      : bundleId;
    
    const productGid = `gid://shopify/Product/${numericId}`;
    
    // Delete from database first
    try {
      const { deleteBundle } = await import('./lib/database/bundles.js');
      await deleteBundle(productGid);
      console.log(`   ✅ Deleted bundle from database: ${productGid}`);
    } catch (dbError) {
      console.error(`   ⚠️ Failed to delete from database:`, dbError.message);
    }
    
    // Delete the entire product from Shopify
    await admin.delete(`/products/${numericId}.json`);
    console.log(`   ✅ Deleted product from Shopify: ${numericId}`);
    
    res.json({ success: true, message: "Bundle deleted successfully" });
  } catch (error) {
    console.error("Error deleting bundle:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin endpoint to force product sync
app.post("/api/admin/force-sync", async (req, res) => {
  try {
    console.log('\n🔄 Manual sync triggered via API endpoint');
    const { syncFromShopify } = await import('./lib/autoSync.js');
    const result = await syncFromShopify();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: "Sync completed",
        ...result
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: "Sync failed",
        error: result.error
      });
    }
  } catch (error) {
    console.error("Error during manual sync:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Webhooks routes
app.use("/webhooks", webhooksRouter);
app.use("/api/bundles", csvRouter);
app.use("/api/bundles", imagesAnalyticsRouter);

// 404 handler
app.use((req, res) => {
  // Try to serve index.html for HTML requests, otherwise 404
  if (req.accepts('html')) {
    return res.sendFile("index.html", { root: "public" });
  }
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Manual sync endpoint
app.post("/api/sync", async (req, res) => {
  try {
    console.log('\n📥 Manual sync triggered via API');
    const result = await syncFromShopify();
    res.json(result);
  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`\n🚀 Bundles App Server`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🏪 Shop: ${process.env.SHOP}`);
    console.log(`🔗 URL: ${process.env.SHOPIFY_APP_URL}`);
    console.log(`✅ Ready!\n`);
    
    // Auto-sync database if empty
    try {
      await checkAndSyncDatabase();
    } catch (error) {
      console.error('⚠️  Auto-sync failed:', error.message);
      console.log('   You can manually sync by calling POST /api/sync\n');
    }
  });
}

export default app;


