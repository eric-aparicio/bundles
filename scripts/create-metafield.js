/**
 * Create Bundle Metafield Definition in Shopify
 * Run this ONCE to create the metafield definition
 */

import dotenv from 'dotenv';
import { createRestClient, getAccessToken } from '../lib/shopify.js';

dotenv.config();

async function createMetafieldDefinition() {
  const shop = process.env.SHOP;
  const accessToken = await getAccessToken();
  const admin = createRestClient(shop, accessToken);

  console.log('\n📝 Creating bundle_config metafield definition in Shopify...\n');

  try {
    // Create metafield definition for products
    const result = await admin.post('/metafield_definitions.json', {
      metafield_definition: {
        name: 'Bundle Configuration',
        namespace: 'custom',
        key: 'bundle_config',
        description: 'Stores bundle component configuration and settings',
        type: 'json',
        owner_type: 'PRODUCT',
        validations: []
      }
    });

    console.log('✅ Metafield definition created successfully!');
    console.log(`   ID: ${result.metafield_definition.id}`);
    console.log(`   Name: ${result.metafield_definition.name}`);
    console.log(`   Namespace: ${result.metafield_definition.namespace}`);
    console.log(`   Key: ${result.metafield_definition.key}`);
    console.log('\n✨ You can now create bundles - they will save correctly!\n');

  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  Metafield definition already exists - you\'re all set!');
    } else {
      console.error('❌ Error creating metafield definition:', error.message);
      console.error('\nTry creating it manually in Shopify Admin:');
      console.error('1. Go to Settings → Custom data → Products');
      console.error('2. Click "Add definition"');
      console.error('3. Name: Bundle Configuration');
      console.error('4. Namespace and key: custom.bundle_config');
      console.error('5. Type: JSON');
    }
  }
}

createMetafieldDefinition();
