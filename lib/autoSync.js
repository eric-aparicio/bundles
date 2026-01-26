/**
 * Auto-sync functionality
 * Checks if database is empty and syncs from Shopify automatically
 */

import { createGraphQLClient } from './graphql.js';
import { bulkUpsertProducts } from './database/products.js';
import { createBundle } from './database/bundles.js';
import prisma from './db.js';

export async function checkAndSyncDatabase() {
  try {
    console.log('\n🔍 Checking database status...');
    
    // Check if we have products in DB
    const productCount = await prisma.product.count();
    
    if (productCount > 0) {
      console.log(`✅ Database already populated (${productCount} products)`);
      return { skipped: true, reason: 'Database already populated' };
    }

    console.log('📥 Database is empty - starting initial synchronization...');
    return await syncFromShopify();
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    return { error: error.message };
  }
}

export async function syncFromShopify() {
  const startTime = Date.now();
  const SHOP = process.env.SHOP;
  const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  try {
    console.log('\n🚀 Starting bidirectional sync from Shopify to Database');
    console.log(`   Shop: ${SHOP}`);
    console.log(`   Time: ${new Date().toISOString()}\n`);
    
    // Create GraphQL client
    const graphql = createGraphQLClient(SHOP, ACCESS_TOKEN);
    
    // Sync products with pagination
    console.log('📦 Fetching ALL products from Shopify (with pagination)...');
    const shopifyProducts = await graphql.getAllProducts(250);
    console.log(`   ✅ Found ${shopifyProducts.length} products in Shopify`);
    
    // Get all products from database
    console.log('💾 Fetching products from database...');
    const dbProducts = await prisma.product.findMany({
      select: { id: true }
    });
    console.log(`   ✅ Found ${dbProducts.length} products in database`);
    
    // Create sets for comparison
    const shopifyIds = new Set(shopifyProducts.map(p => p.id));
    const dbIds = new Set(dbProducts.map(p => p.id));
    
    // Determine actions needed
    const toCreate = shopifyProducts.filter(p => !dbIds.has(p.id));
    const toUpdate = shopifyProducts.filter(p => dbIds.has(p.id));
    const toDelete = dbProducts.filter(p => !shopifyIds.has(p.id));
    
    console.log(`\n📊 Sync Plan:`);
    console.log(`   ➕ Create: ${toCreate.length} new products`);
    console.log(`   🔄 Update: ${toUpdate.length} existing products`);
    console.log(`   🗑️  Delete: ${toDelete.length} removed products`);
    
    let created = 0, updated = 0, deleted = 0;
    
    // Create new products
    if (toCreate.length > 0) {
      console.log(`\n➕ Creating ${toCreate.length} new products...`);
      const createResults = await bulkUpsertProducts(toCreate);
      created = createResults.filter(r => r.success).length;
      console.log(`   ✅ Created ${created} products`);
    }
    
    // Update existing products
    if (toUpdate.length > 0) {
      console.log(`\n🔄 Updating ${toUpdate.length} existing products...`);
      const updateResults = await bulkUpsertProducts(toUpdate);
      updated = updateResults.filter(r => r.success).length;
      console.log(`   ✅ Updated ${updated} products`);
    }
    
    // Delete removed products
    if (toDelete.length > 0) {
      console.log(`\n🗑️  Deleting ${toDelete.length} removed products...`);
      for (const product of toDelete) {
        try {
          // Delete bundles first (foreign key constraint)
          await prisma.bundle.deleteMany({
            where: { productId: product.id }
          });
          // Then delete product
          await prisma.product.delete({
            where: { id: product.id }
          });
          deleted++;
        } catch (error) {
          console.error(`   ⚠️  Failed to delete ${product.id}: ${error.message}`);
        }
      }
      console.log(`   ✅ Deleted ${deleted} products`);
    }
    
    // Sync bundles from updated products
    console.log('\n🎁 Syncing bundles...');
    let bundlesCount = 0;
    
    for (const product of shopifyProducts) {
      const bundleConfig = graphql.getBundleConfig(product.metafields);
      
      if (bundleConfig && bundleConfig.is_bundle) {
        try {
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
            console.log(`   ✅ ${product.title}`);
          }
        } catch (error) {
          console.error(`   ❌ ${product.title}: ${error.message}`);
        }
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Log to database
    await prisma.syncLog.create({
      data: {
        type: 'bidirectional_sync',
        status: 'success',
        productsCount: created + updated,
        bundlesCount: bundlesCount,
        duration: duration,
      },
    });
    
    console.log('\n✅ Bidirectional sync completed successfully!');
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Bundles: ${bundlesCount}`);
    console.log(`   Total products in DB: ${shopifyProducts.length}\n`);
    
    return {
      success: true,
      created,
      updated,
      deleted,
      bundles: bundlesCount,
      duration: duration
    };
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    
    // Log error
    try {
      await prisma.syncLog.create({
        data: {
          type: 'bidirectional_sync',
          status: 'error',
          error: error.message,
          duration: Date.now() - startTime,
        },
      });
    } catch (logError) {
      console.error('Could not log error:', logError.message);
    }
    
    return { success: false, error: error.message };
  }
}

