/**
 * Bundle Database Service
 * Handles all bundle-related database operations
 */

import prisma from '../db.js';

/**
 * Get all bundles with components and product info
 */
export async function getAllBundles(filters = {}) {
  const { status, limit = 100, offset = 0 } = filters;
  
  const where = {};
  if (status) where.status = status;
  
  return await prisma.bundle.findMany({
    where,
    include: {
      product: true,
      components: {
        include: {
          product: true,
        },
      },
    },
    take: limit,
    skip: offset,
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Get bundle by ID
 */
export async function getBundleById(id) {
  return await prisma.bundle.findUnique({
    where: { id },
    include: {
      product: true,
      components: {
        include: {
          product: true,
        },
      },
    },
  });
}

/**
 * Get bundle by product ID
 */
export async function getBundleByProductId(productId) {
  return await prisma.bundle.findUnique({
    where: { productId },
    include: {
      product: true,
      components: {
        include: {
          product: true,
        },
      },
    },
  });
}

/**
 * Create new bundle
 */
export async function createBundle(productId, components, price) {
  // Create bundle with components in a transaction
  return await prisma.$transaction(async (tx) => {
    // Create bundle
    const bundle = await tx.bundle.create({
      data: {
        productId,
        price: String(price),
        status: 'active',
      },
    });
    
    // Prepare component data - use product_id from frontend
    const componentData = [];
    for (const c of components) {
      // Use product_id directly from frontend (already provided)
      const compProductId = c.product_id;
      
      if (!compProductId) {
        console.warn(`Component ${c.product_title} missing product_id, skipping`);
        continue;
      }
      
      componentData.push({
        bundleId: bundle.id,
        productId: compProductId,
        variantId: c.variant_id,
        productTitle: c.product_title,
        price: String(c.price || '0'),
        quantity: c.quantity || 1,
      });
    }
    
    if (componentData.length === 0) {
      throw new Error('No valid components to create bundle');
    }
    
    await tx.bundleComponent.createMany({
      data: componentData,
    });
    
    return bundle;
  });
}

/**
 * Update bundle
 */
export async function updateBundle(id, components, price) {
  return await prisma.$transaction(async (tx) => {
    // Update bundle
    const bundle = await tx.bundle.update({
      where: { id },
      data: {
        price: String(price),
        updatedAt: new Date(),
      },
    });
    
    // Delete old components
    await tx.bundleComponent.deleteMany({
      where: { bundleId: id },
    });
    
    // Prepare component data - use product_id from frontend
    const componentData = [];
    for (const c of components) {
      // Use product_id directly from frontend (already provided)
      const compProductId = c.product_id;
      
      if (!compProductId) {
        console.warn(`Component ${c.product_title} missing product_id, skipping`);
        continue;
      }
     
      componentData.push({
        bundleId: id,
        productId: compProductId,
        variantId: c.variant_id,
        productTitle: c.product_title,
        price: String(c.price || '0'),
        quantity: c.quantity || 1,
      });
    }
    
    await tx.bundleComponent.createMany({
      data: componentData,
    });
    
    return bundle;
  });
}

/**
 * Delete bundle by product ID
 */
export async function deleteBundle(productId) {
  return await prisma.bundle.delete({
    where: { productId },
  });
}

/**
 * Delete bundle by product ID
 */
export async function deleteBundleByProductId(productId) {
  const bundle = await prisma.bundle.findUnique({
    where: { productId },
  });
  
  if (bundle) {
    return await deleteBundle(bundle.id);
  }
  
  return null;
}

/**
 * Get bundles count
 */
export async function getBundlesCount(filters = {}) {
  const { status } = filters;
  
  const where = {};
  if (status) where.status = status;
  
  return await prisma.bundle.count({ where });
}

/**
 * Check if product is a bundle
 */
export async function isBundle(productId) {
  const bundle = await prisma.bundle.findUnique({
    where: { productId },
  });
  
  return !!bundle;
}

/**
 * Extract product ID from variant GID
 * Variant GID format: gid://shopify/ProductVariant/123456
 * We need to find the product that contains this variant
 */
async function extractProductIdFromVariant(variantGid) {
  try {
    // Extract variant numeric ID from GID
    const variantNumericId = variantGid.split('/').pop();
    
    // Query Shopify REST API to get variant info
    const { createRestClient } = await import('../shopify.js');
    const SHOP = process.env.SHOP;
    const ACCESS_TOKEN = await getAccessToken();
    const admin = createRestClient(SHOP, ACCESS_TOKEN);
    
    const variantResponse = await admin.get(`/variants/${variantNumericId}.json`);
    const productNumericId = variantResponse.variant.product_id;
    
    return `gid://shopify/Product/${productNumericId}`;
  } catch (error) {
    console.error(`Error extracting product ID from variant ${variantGid}:`, error.message);
    // Fallback: return null to skip this component
    return null;
  }
}

