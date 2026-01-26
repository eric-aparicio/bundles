/**
 * Manual Sync ALL Bundles from Shopify to PostgreSQL
 * Run this to populate DB with existing bundles
 */

import dotenv from 'dotenv';
import { createRestClient } from '../lib/shopify.js';
import { bulkUpsertProducts } from '../lib/database/products.js';
import { createBundle } from '../lib/database/bundles.js';
import prisma from '../lib/db.js';

dotenv.config();

async function syncAllBundles() {
  const shop = process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const admin = createRestClient(shop, accessToken);

  console.log('\n🔄 Syncing ALL bundles from Shopify to PostgreSQL...\n');

  try {
    // Get all products
    const productsResponse = await admin.get('/products.json?limit=250');
    const products = productsResponse.products || [];
    
    console.log(`📦 Found ${products.length} total products in Shopify`);
    
    let bundlesFound = 0;
    let bundlesSaved = 0;
    
    for (const product of products) {
      try {
        // Check if product has bundle metafield
        const metafieldsResponse = await admin.get(`/products/${product.id}/metafields.json`);
        const bundleMetafield = metafieldsResponse.metafields?.find(
          m => m.namespace === 'custom' && m.key === 'bundle_config'
        );
        
        if (bundleMetafield) {
          bundlesFound++;
          console.log(`\n🎁 Bundle found: ${product.title}`);
          
          const bundleConfig = JSON.parse(bundleMetafield.value);
          const productId = `gid://shopify/Product/${product.id}`;
          
          // First upsert product
          await bulkUpsertProducts([{
            id: productId,
            title: product.title,
            imageUrl: product.image?.src || product.images?.[0]?.src,
            status: product.status,
            productType: 'Bundle',
            variants: product.variants || []
          }]);
          
          // Then create bundle
          const price = product.variants?.[0]?.price || '0';
          await createBundle(productId, bundleConfig.components, price);
          
          bundlesSaved++;
          console.log(`   ✅ Saved to database`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`   ❌ Error with ${product.title}:`, error.message);
      }
    }
    
    console.log(`\n✅ Sync completed!`);
    console.log(`   Bundles found: ${bundlesFound}`);
    console.log(`   Bundles saved: ${bundlesSaved}\n`);
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
  }
}

syncAllBundles();
