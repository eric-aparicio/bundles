import dotenv from "dotenv";
import { createRestClient } from "../lib/shopify.js";
import { getBundleConfig } from "../lib/bundles.js";
import {
  getDefaultLocation,
  getInventoryItemId,
  syncBundleInventory,
  restoreBundleInventory,
} from "../lib/inventory.js";

dotenv.config();

async function findFirstBundle(admin) {
  const productsResponse = await admin.get("/products.json?limit=100&fields=id,title,variants");
  const products = productsResponse.products || [];

  for (const product of products) {
    const config = await getBundleConfig(product.id, admin);
    if (config?.is_bundle && config.components?.length > 0) {
      return {
        productId: product.id,
        productTitle: product.title,
        variantId: product.variants?.[0]?.id,
        config,
      };
    }
  }

  return null;
}

async function getBundleFromEnvOrDiscovery(admin) {
  const explicitProductId = process.env.BUNDLE_PRODUCT_ID;

  if (explicitProductId) {
    const config = await getBundleConfig(explicitProductId, admin);
    if (config?.is_bundle && config.components?.length > 0) {
      return {
        productId: explicitProductId,
        productTitle: `Bundle ${explicitProductId}`,
        variantId: null,
        config,
      };
    }

    return null;
  }

  return findFirstBundle(admin);
}

async function getVariantInventory(variantGid, admin) {
  const inventoryItemId = await getInventoryItemId(variantGid, admin);
  const levels = await admin.get(`/inventory_levels.json?inventory_item_ids=${inventoryItemId}`);
  const level = levels.inventory_levels?.[0];

  if (!level) {
    throw new Error(`No inventory level found for ${variantGid}`);
  }

  return {
    inventoryItemId,
    available: level.available,
  };
}

async function verifyPackDeduction() {
  const shop = process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error("Missing SHOP or SHOPIFY_ADMIN_API_ACCESS_TOKEN in environment");
  }

  const admin = createRestClient(shop, accessToken);

  console.log("🧪 Verificando descuento de inventario por compra de pack\n");

  const bundle = await getBundleFromEnvOrDiscovery(admin);
  if (!bundle) {
    console.log("❌ No se encontró ningún bundle configurado en la tienda");
    console.log("   Puedes definir BUNDLE_PRODUCT_ID en .env para validar un pack específico");
    return;
  }

  const bundleVariantGid = bundle.variantId
    ? `gid://shopify/ProductVariant/${bundle.variantId}`
    : "gid://shopify/ProductVariant/unknown";
  const locationId = await getDefaultLocation(admin);

  console.log(`📦 Bundle encontrado: ${bundle.productTitle} (${bundle.productId})`);
  console.log(`📍 Location ID: ${locationId}`);

  const trackedComponents = [];
  for (const component of bundle.config.components) {
    const variantGid = component.variant_id || component.default_variant_id;
    if (!variantGid) continue;

    const inventory = await getVariantInventory(variantGid, admin);
    trackedComponents.push({
      title: component.product_title,
      variantGid,
      quantityPerPack: component.quantity || 1,
      before: inventory.available,
    });
  }

  console.log("\n📊 Inventario antes del descuento:");
  for (const component of trackedComponents) {
    console.log(`   - ${component.title}: ${component.before}`);
  }

  try {
    await syncBundleInventory(bundleVariantGid, 1, locationId, bundle.config, admin);

    console.log("\n🔍 Verificando descuento...");
    let allGood = true;

    for (const component of trackedComponents) {
      const inventory = await getVariantInventory(component.variantGid, admin);
      const expected = component.before - component.quantityPerPack;
      const actual = inventory.available;

      const ok = actual === expected;
      if (!ok) allGood = false;

      console.log(
        `   - ${component.title}: esperado ${expected}, actual ${actual} ${ok ? "✅" : "❌"}`
      );
    }

    if (allGood) {
      console.log("\n✅ Verificación exitosa: comprar un pack descuenta los productos individuales correctamente");
    } else {
      console.log("\n❌ Verificación fallida: algunos componentes no se descontaron como se esperaba");
    }
  } finally {
    console.log("\n↩️ Restaurando inventario...");
    await restoreBundleInventory(bundleVariantGid, 1, locationId, bundle.config, admin);
    console.log("✅ Inventario restaurado");
  }
}

verifyPackDeduction().catch((error) => {
  console.error("❌ Error en verificación:", error.message);
  process.exit(1);
});
