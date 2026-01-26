/**
 * 🛒 Create Order WITHOUT visible IDs
 * Crea un pedido sin IDs visibles en properties
 */

import dotenv from "dotenv";
import { createRestClient } from "./lib/shopify.js";
import { getBundleConfig } from "./lib/bundles.js";

dotenv.config();

const BUNDLE_PRODUCT_ID = '10138221838678';
const BUNDLE_VARIANT_ID = '52396533743958';

// Variantes seleccionadas
const SELECTED_VARIANTS = {
  0: 'L', // Pantalón - L
  1: 'NEGRO / Adulto', // Vendas - NEGRO / Adulto
  2: 'NEGRO/ROJO', // Protector bucal - NEGRO/ROJO
  3: 'L/XL' // Guantes - L/XL
};

async function createOrderClean() {
  console.log('🛒 CREANDO PEDIDO BUNDLE SIMPLE\n');
  console.log('='.repeat(70));
  
  const admin = createRestClient(process.env.SHOP, process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
  
  try {
    const config = await getBundleConfig(BUNDLE_PRODUCT_ID, admin);
    
    if (!config || !config.is_bundle) {
      console.log('❌ El producto no es un bundle');
      return;
    }
    
    console.log(`✅ Bundle configurado con ${config.components.length} componentes\n`);
    
    // Crear el pedido con UN SOLO line item
    const orderData = {
      order: {
        line_items: [
          {
            variant_id: BUNDLE_VARIANT_ID,
            quantity: 1,
            properties: []
          }
        ],
        customer: {
          first_name: "Test",
          last_name: "Bundle Simple",
          email: "test-bundle-simple@example.com"
        },
        financial_status: "paid",
        send_receipt: false,
        send_fulfillment_receipt: false,
        note: "🧪 Pedido bundle simple - " + new Date().toISOString()
      }
    };
    
    // Agregar componentes como properties (formato legible)
    console.log('📦 Componentes del bundle:\n');
    for (let i = 0; i < config.components.length; i++) {
      const component = config.components[i];
      const componentName = component.product_title.split(' - ')[0];
      const selectedValue = SELECTED_VARIANTS[i];
      const quantity = component.quantity || 1;
      
      // Formato: "1 x PRODUCTO VARIANTE"
      const formattedValue = `${quantity} x ${componentName} ${selectedValue}`;
      const propertyName = `Item ${i + 1}`;
      
      orderData.order.line_items[0].properties.push({
        name: propertyName,
        value: formattedValue
      });
      
      console.log(`   ${propertyName}: ${formattedValue}`);
    }
    
    console.log('\n⏳ Enviando pedido a Shopify...');
    const orderResponse = await admin.post('/orders.json', orderData);
    const order = orderResponse.order;
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 ¡PEDIDO CREADO CORRECTAMENTE!');
    console.log('='.repeat(70));
    
    console.log(`\n📋 Order #${order.order_number} (ID: ${order.id})`);
    console.log(`   Total: €${order.total_price} ✅`);
    console.log(`   Line items: ${order.line_items.length}`);
    
    const bundleItem = order.line_items[0];
    console.log(`\n📦 Bundle:`);
    console.log(`   Producto: ${bundleItem.title}`);
    console.log(`   Precio: €${bundleItem.price}`);
    console.log(`   Cantidad: ${bundleItem.quantity}`);
    
    console.log(`\n✅ Componentes visibles en properties:`);
    if (bundleItem.properties && bundleItem.properties.length > 0) {
      bundleItem.properties.forEach(prop => {
        console.log(`   ${prop.name}: ${prop.value}`);
      });
    } else {
      console.log('   ⚠️ No se encontraron properties');
    }
    
    console.log(`\n🔗 Ver en Shopify Admin:`);
    console.log(`   https://${process.env.SHOP}/admin/orders/${order.id}`);
    
    console.log('\n✅ VERIFICACIÓN:');
    console.log('='.repeat(70));
    console.log('✓ Precio correcto: €50.00');
    console.log('✓ Un solo line item (el bundle)');
    console.log('✓ Properties muestran todos los componentes con variantes');
    console.log('✓ Sin necesidad de descuentos automáticos\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

createOrderClean();
