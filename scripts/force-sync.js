/**
 * Force complete sync regardless of database state
 */

import { syncFromShopify } from '../lib/autoSync.js';
import prisma from '../lib/db.js';

async function forceSync() {
  try {
    console.log('\n🔄 FORCING COMPLETE SYNC...\n');
    console.log('   This will sync ALL products from Shopify to database');
    console.log('   regardless of current database state.\n');
    
    const result = await syncFromShopify();
    
    if (result.success) {
      console.log('\n✅ Force sync completed successfully!');
      console.log(`   Created: ${result.created || 0}`);
      console.log(`   Updated: ${result.updated || 0}`);
      console.log(`   Deleted: ${result.deleted || 0}`);
      console.log(`   Bundles: ${result.bundles || 0}\n`);
      
      // Get final count
      const finalCount = await prisma.product.count();
      console.log(`   📊 Total products now in database: ${finalCount}\n`);
    } else {
      console.error('\n❌ Force sync failed:', result.error);
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
}

forceSync();
