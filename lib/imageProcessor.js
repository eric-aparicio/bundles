/**
 * Image Processing for Bundles
 * Generates composite images from component products
 */

import https from 'https';
import http from 'http';

/**
 * Download image from URL
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Get images from component variants
 * @param {Array} components - Bundle components with variant_ids
 * @param {Object} admin - REST API client
 * @returns {Promise<Array>} Array of image URLs
 */
export async function getComponentImages(components, admin) {
  const images = [];
  const seenProducts = new Set(); // Avoid duplicates

  for (const component of components) {
    try {
      // Extract numeric variant ID
      const variantId = component.variant_id.includes('gid://')
        ? component.variant_id.split('/').pop()
        : component.variant_id;

      // Get variant to find product ID
      const variantResponse = await admin.get(`/variants/${variantId}.json`);
      const productId = variantResponse.variant.product_id;

      // Skip if we already got this product's image
      if (seenProducts.has(productId)) continue;
      seenProducts.add(productId);

      // Get product details with images
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit protection
      const productResponse = await admin.get(`/products/${productId}.json`);
      const product = productResponse.product;

      // Get first available image
      const imageUrl = product.image?.src || product.images?.[0]?.src;
      
      if (imageUrl) {
        images.push({
          url: imageUrl,
          productTitle: product.title
        });
      }

      // Limit to 4 images for composition
      if (images.length >= 4) break;
    } catch (error) {
      console.error(`Error fetching image for component ${component.variant_id}:`, error.message);
      continue;
    }
  }

  return images;
}

/**
 * Create a grid layout URL for Shopify image service
 * Uses Shopify's CDN to create a simple 2x2 grid
 * @param {Array} imageUrls - Array of image URLs (max 4)
 * @returns {string} First image URL (Shopify will be responsible for gallery)
 */
export function createImageGridUrl(imageUrls) {
  // For now, just return the first image
  // Shopify will handle multiple images in the product gallery
  return imageUrls[0]?.url || null;
}

/**
 * Get all image URLs from components for product gallery
 * @param {Array} components - Bundle components
 * @param {Object} admin - REST API client
 * @returns {Promise<Array>} Array of image objects for Shopify
 */
export async function getBundleImageGallery(components, admin) {
  const componentImages = await getComponentImages(components, admin);
  
  // Return images in Shopify format
  return componentImages.map(img => ({
    src: img.url,
    alt: `Componente: ${img.productTitle}`
  }));
}
