/**
 * GraphQL Service for Shopify Admin API
 * Handles bulk operations using GraphQL instead of REST
 */

import fetch from 'node-fetch';

/**
 * GraphQL Admin API Client
 */
export class GraphQLClient {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = '2024-10';
    this.endpoint = `https://${shop}/admin/api/${this.apiVersion}/graphql.json`;
  }

  /**
   * Execute GraphQL query
   */
  async query(queryString, variables = {}) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: JSON.stringify({
        query: queryString,
        variables,
      }),
    });

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  /**
   * Fetch all products with metafields (with pagination)
   */
  async getAllProducts(limit = 250) {
    const query = `
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              status
              productType
              images(first: 1) {
                edges {
                  node {
                    src: url
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
              metafields(namespace: "custom", first: 10) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;

    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    
    while (hasNextPage) {
      const data = await this.query(query, { first: limit, after: cursor });
      const products = this.transformProducts(data.products);
      allProducts = allProducts.concat(products);
      
      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
      
      if (hasNextPage) {
        console.log(`   Fetched ${allProducts.length} products, fetching more...`);
      }
    }
    
    return allProducts;
  }

  /**
   * Transform GraphQL product response to our format
   */
  transformProducts(productsResponse) {
    return productsResponse.edges.map(edge => {
      const node = edge.node;
      
      return {
        id: node.id,
        title: node.title,
        status: node.status?.toLowerCase() || 'draft',
        product_type: node.productType,
        image: {
          src: node.images?.edges?.[0]?.node?.src,
        },
        images: node.images?.edges?.map(e => ({ src: e.node.src })) || [],
        variants: node.variants?.edges?.map(e => ({
          id: e.node.id,
          title: e.node.title,
          price: e.node.price,
          sku: e.node.sku,
          inventory_quantity: e.node.inventoryQuantity || 0,
        })) || [],
        metafields: node.metafields?.edges?.map(e => ({
          key: e.node.key,
          value: e.node.value,
        })) || [],
      };
    });
  }

  /**
   * Get bundle metafield from product metafields
   */
  getBundleConfig(metafields) {
    const bundleField = metafields.find(m => m.key === 'bundle_config');
    if (!bundleField) return null;

    try {
      return JSON.parse(bundleField.value);
    } catch (e) {
      console.error('Error parsing bundle config:', e);
      return null;
    }
  }
}

/**
 * Create GraphQL client
 */
export function createGraphQLClient(shop, accessToken) {
  return new GraphQLClient(shop, accessToken);
}
