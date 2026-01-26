/**
 * Product Database Service
 * Handles all product-related database operations
 */

import prisma from '../db.js';

/**
 * Get all products with optional filters
 */
export async function getAllProducts(filters = {}) {
  const { status, search, limit = 100, offset = 0 } = filters;
  
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { shopifyId: { contains: search } },
    ];
  }
  
  return await prisma.product.findMany({
    where,
    take: limit,
    skip: offset,
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Get product by ID (GID format)
 */
export async function getProductById(id) {
  return await prisma.product.findUnique({
    where: { id },
  });
}

/**
 * Get product by Shopify numeric ID
 */
export async function getProductByShopifyId(shopifyId) {
  return await prisma.product.findUnique({
    where: { shopifyId: String(shopifyId) },
  });
}

/**
 * Create or update product from Shopify data
 */
export async function upsertProduct(shopifyProduct) {
  const id = shopifyProduct.id; // GID format
  const shopifyId = extractNumericId(shopifyProduct.id);
  
  return await prisma.product.upsert({
    where: { id },
    create: {
      id,
      shopifyId,
      title: shopifyProduct.title,
      imageUrl: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src,
      status: shopifyProduct.status || 'draft',
      productType: shopifyProduct.product_type,
      variants: shopifyProduct.variants || [],
    },
    update: {
      title: shopifyProduct.title,
      imageUrl: shopifyProduct.image?.src || shopifyProduct.images?.[0]?.src,
      status: shopifyProduct.status || 'draft',
      productType: shopifyProduct.product_type,
      variants: shopifyProduct.variants || [],
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete product
 */
export async function deleteProduct(id) {
  return await prisma.product.delete({
    where: { id },
  });
}

/**
 * Bulk upsert products (for initial sync)
 */
export async function bulkUpsertProducts(shopifyProducts) {
  const results = [];
  
  for (const product of shopifyProducts) {
    try {
      const result = await upsertProduct(product);
      results.push({ success: true, id: result.id });
    } catch (error) {
      results.push({ success: false, id: product.id, error: error.message });
    }
  }
  
  return results;
}

/**
 * Extract numeric ID from GID
 */
function extractNumericId(gid) {
  if (!gid.includes('gid://')) return gid;
  return gid.split('/').pop();
}

/**
 * Get products count
 */
export async function getProductsCount(filters = {}) {
  const { status, search } = filters;
  
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { shopifyId: { contains: search } },
    ];
  }
  
  return await prisma.product.count({ where });
}
