import dotenv from "dotenv";
import { createRestClient } from "../lib/shopify.js";
import { getBundleConfig } from "../lib/bundles.js";

dotenv.config();

const KNOWN_PACK_IDS = [
  "9952307282262",
  "9952256229718",
  "9952290603350",
  "9831824851286",
];

async function checkKnownPacks() {
  const admin = createRestClient(process.env.SHOP, process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);

  for (const productId of KNOWN_PACK_IDS) {
    const config = await getBundleConfig(productId, admin);
    const isBundle = config && config.is_bundle === true;
    const componentsCount = isBundle && Array.isArray(config.components) ? config.components.length : 0;
    console.log(`${productId} | ${isBundle ? "BUNDLE" : "NO_BUNDLE"} | components: ${componentsCount}`);
  }
}

checkKnownPacks().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
