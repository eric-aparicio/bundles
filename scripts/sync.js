/**
 * Initial Data Sync Script
 * Syncs all products and bundles from Shopify to PostgreSQL database
 */

import dotenv from 'dotenv';
import { createGraphQLClient } from '../lib/graphql.js';
import { bulkUpsertProducts } from '../lib/database/products.js';
import { createBundle } from '../lib/database/bundles.js';
import prisma from '../lib/db.js';

// Load environment variables
dotenv.config();

const SHOP = process.env.SHOP;
const ACCESS_TOKEN = await getAccessToken();

async function syncProducts() {
  console.log('📦 Starting product sync...');
  
  const graphql = createGraphQLClient(SHOP, ACCESS_TOKEN);
  
  try {
    // Fetch all products from Shopify
    const products = await graphql.getAllProducts(250);
    console.log(`   Found ${products.length} products in Shopify`);
    
    // Upsert to database
    const results = await bulkUpsertProducts(products);
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`   ✅ Synced ${success} products`);
    if (failed > 0) {
      console.log(`   ⚠️  Failed: ${failed} products`);
    }
    
    return { products: success, failed };
  } catch (error) {
    console.error('❌ Error syncing products:', error);
    throw error;
  }
}

async function syncBundles() {
  console.log('\n🎁 Starting bundle sync...');
  
  const graphql = createGraphQLClient(SHOP, ACCESS_TOKEN);
  
  try {
    // Fetch products with metafields
    const products = await graphql.getAllProducts(250);
    
    let bundlesCount = 0;
    
    for (const product of products) {
      const bundleConfig = graphql.getBundleConfig(product.metafields);
      
      if (bundleConfig && bundleConfig.is_bundle) {
        try {
          // Check if bundle already exists
          const existing = await prisma.bundle.findUnique({
            where: { productId: product.id },
          });
          
          if (!existing) {
            await createBundle(
              product.id,
              bundleConfig.components,
              product.variants[0]?.price || '0'
            );
            bundlesCount++;
            console.log(`   ✅ Created bundle: ${product.title}`);
          } else {
            console.log(`   ⏭️  Bundle already exists: ${product.title}`);
          }
        } catch (error) {
          console.error(`   ❌ Error creating bundle for ${product.title}:`, error.message);
        }
      }
    }
    
    console.log(`   ✅ Synced ${bundlesCount} new bundles`);
    return { bundles: bundlesCount };
  } catch (error) {
    console.error('❌ Error syncing bundles:', error);
    throw error;
  }
}

async function logSync(type, status, data) {
  await prisma.syncLog.create({
    data: {
      type,
      status,
      productsCount: data.products || 0,
      bundlesCount: data.bundles || 0,
      duration: data.duration || 0,
      error: data.error || null,
    },
  });
}

async function main() {
  const startTime = Date.now();
  
  console.log('🚀 Starting initial sync from Shopify to Database\n');
  console.log(`   Shop: ${SHOP}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);
  
  try {
    // Sync products first
    const productsResult = await syncProducts();
    
    // Then sync bundles
    const bundlesResult = await syncBundles();
    
    const duration = Date.now() - startTime;
    
    // Log successful sync
    await logSync('initial_sync', 'success', {
      products: productsResult.products,
      bundles: bundlesResult.bundles,
      duration,
    });
    
    console.log('\n✅ Sync completed successfully!');
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Products: ${productsResult.products}`);
    console.log(`   Bundles: ${bundlesResult.bundles}`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log failed sync
    await logSync('initial_sync', 'error', {
      duration,
      error: error.message,
    });
    
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run sync
main();
