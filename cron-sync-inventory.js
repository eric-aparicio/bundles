/**
 * Bi-Weekly Inventory Sync
 * Syncs product inventory from Shopify to PostgreSQL every 2 weeks
 * Reduces Shopify API calls dramatically
 * 
 * Schedule: Day 1 and 15 of each month
 * Railway Cron: 0 0 1,15 * *
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { createRestClient, getAccessToken } from './lib/shopify.js';

dotenv.config();

const prisma = new PrismaClient();

async function syncInventoryBiWeekly() {
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🔄 BI-WEEKLY INVENTORY SYNC');
  console.log('='.repeat(80));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🏪 Shop: ${process.env.SHOP}\n`);
  
  const accessToken = await getAccessToken();
  const admin = createRestClient(process.env.SHOP, accessToken);
  
  let updatedCount = 0;
  let errorCount = 0;
  const errors = [];
  
  try {
    // Get all products from database
    const dbProducts = await prisma.product.findMany({
      select: {
        id: true,
        shopifyId: true,
        title: true,
        status: true
      },
      orderBy: {
        title: 'asc'
      }
    });
    
    console.log(`📦 Products in database: ${dbProducts.length}\n`);
    
    if (dbProducts.length === 0) {
      console.log('⚠️  No products found in database. Run product sync first.\n');
      
      await prisma.syncLog.create({
        data: {
          type: 'bi_weekly_sync',
          status: 'success',
          productsCount: 0,
          duration: Date.now() - startTime,
          metadata: {
            message: 'No products in database',
            timestamp: new Date().toISOString()
          }
        }
      });
      
      await prisma.$disconnect();
      return;
    }
    
    // Process in batches to respect rate limits
    const batchSize = 50;
    const totalBatches = Math.ceil(dbProducts.length / batchSize);
    
    console.log(`⚙️  Processing ${totalBatches} batches (${batchSize} products each)\n`);
    
    for (let i = 0; i < dbProducts.length; i += batchSize) {
      const batch = dbProducts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      console.log(`📊 Batch ${batchNum}/${totalBatches} (products ${i + 1}-${Math.min(i + batchSize, dbProducts.length)})`);
      
      for (const dbProduct of batch) {
        try {
          // Rate limiting: 500ms between requests = 2 req/sec (well below Shopify's 4 req/sec limit)
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get product from Shopify with variants
          const shopifyProduct = await admin.get(`/products/${dbProduct.shopifyId}.json`);
          const product = shopifyProduct.product;
          
          // Build variants array with inventory info
          const variants = product.variants.map(v => ({
            id: `gid://shopify/ProductVariant/${v.id}`,
            shopifyId: v.id.toString(),
            title: v.title,
            price: v.price,
            sku: v.sku || '',
            inventory_quantity: v.inventory_quantity || 0,
            inventory_item_id: v.inventory_item_id,
            inventory_management: v.inventory_management
          }));
          
          // Update in database
          await prisma.product.update({
            where: { id: dbProduct.id },
            data: {
              variants: variants,
              status: product.status,
              updatedAt: new Date()
            }
          });
          
          updatedCount++;
          
          // Progress indicator every 10 products
          if (updatedCount % 10 === 0) {
            console.log(`   ✅ ${updatedCount} products synced...`);
          }
          
        } catch (error) {
          errorCount++;
          const errorMsg = `${dbProduct.title}: ${error.message}`;
          errors.push(errorMsg);
          
          // Check for rate limit errors
          if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
            console.log(`\n   ⏸️  Rate limit hit! Pausing 10 seconds...\n`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            console.error(`   ❌ Error: ${errorMsg}`);
          }
        }
      }
      
      console.log(`   ✅ Batch ${batchNum} completed (${updatedCount}/${dbProducts.length})\n`);
    }
    
    const duration = Date.now() - startTime;
    const nextSync = new Date();
    nextSync.setDate(nextSync.getDate() + 14); // 14 days from now
    
    // Log sync results
    await prisma.syncLog.create({
      data: {
        type: 'bi_weekly_sync',
        status: errorCount === 0 ? 'success' : (updatedCount > 0 ? 'partial' : 'error'),
        productsCount: updatedCount,
        duration: duration,
        error: errorCount > 0 ? errors.slice(0, 10).join('\n') : null,
        metadata: {
          totalProducts: dbProducts.length,
          successCount: updatedCount,
          errorCount: errorCount,
          timestamp: new Date().toISOString(),
          nextSync: nextSync.toISOString(),
          errors: errorCount > 0 ? errors : []
        }
      }
    });
    
    console.log('='.repeat(80));
    console.log('✅ SYNC COMPLETED');
    console.log('='.repeat(80));
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`📦 Products updated: ${updatedCount}/${dbProducts.length}`);
    
    if (errorCount > 0) {
      console.log(`⚠️  Errors: ${errorCount}`);
      console.log(`\nFirst ${Math.min(5, errors.length)} errors:`);
      errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }
    
    console.log(`\n📅 Next sync scheduled: ${nextSync.toLocaleDateString()} ${nextSync.toLocaleTimeString()}`);
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error('\n' + '='.repeat(80));
    console.error('❌ SYNC FAILED');
    console.error('='.repeat(80));
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error('='.repeat(80) + '\n');
    
    // Log error
    await prisma.syncLog.create({
      data: {
        type: 'bi_weekly_sync',
        status: 'error',
        productsCount: updatedCount,
        duration: duration,
        error: error.message,
        metadata: {
          errorStack: error.stack,
          timestamp: new Date().toISOString()
        }
      }
    });
    
    throw error;
    
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncInventoryBiWeekly()
    .then(() => {
      console.log('✅ Sync completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Sync failed:', error.message);
      process.exit(1);
    });
}

export { syncInventoryBiWeekly };
