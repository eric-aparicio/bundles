/**
 * Inspecciona todos los metafields del producto "Bundle prueba"
 */
import dotenv from 'dotenv';
import { createRestClient } from './lib/shopify.js';

dotenv.config();

const BUNDLE_PRODUCT_ID = '10138221838678';

async function inspectMetafields() {
  console.log('🔍 Inspeccionando metafields de "Bundle prueba"\n');
  
  const admin = createRestClient(process.env.SHOP, process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
  
  try {
    // Obtener todos los metafields del producto
    const response = await admin.get(`/products/${BUNDLE_PRODUCT_ID}/metafields.json`);
    
    console.log(`📦 Producto ID: ${BUNDLE_PRODUCT_ID}`);
    console.log(`📊 Total de metafields: ${response.metafields.length}\n`);
    
    if (response.metafields.length === 0) {
      console.log('❌ No se encontraron metafields en este producto');
      console.log('\nEl producto necesita tener un metafield con:');
      console.log('   namespace: "custom"');
      console.log('   key: "bundle_config"');
      console.log('   type: "json"');
    } else {
      console.log('Metafields encontrados:\n');
      response.metafields.forEach((m, i) => {
        console.log(`${i + 1}. Metafield ID: ${m.id}`);
        console.log(`   namespace: "${m.namespace}"`);
        console.log(`   key: "${m.key}"`);
        console.log(`   type: "${m.type}"`);
        console.log(`   value: ${m.value}`);
        console.log('');
      });
      
      // Buscar específicamente el bundle_config
      const bundleConfig = response.metafields.find(
        m => m.namespace === 'custom' && m.key === 'bundle_config'
      );
      
      if (bundleConfig) {
        console.log('✅ Metafield de bundle encontrado!');
        console.log('\nConfiguración:');
        try {
          const config = JSON.parse(bundleConfig.value);
          console.log(JSON.stringify(config, null, 2));
        } catch (e) {
          console.log('❌ Error al parsear JSON:', e.message);
        }
      } else {
        console.log('⚠️ No se encontró metafield con namespace="custom" y key="bundle_config"');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

inspectMetafields();
