import fetch from "node-fetch";
import { shopifyRateLimiter } from "./rateLimit.js";

/**
 * Simple REST client for Shopify Admin API with Rate Limiting
 */
export function createRestClient(shop, accessToken) {
  const baseUrl = `https://${shop}/admin/api/2024-10`;
  
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": accessToken,
  };
  
  return {
    get: async (endpoint) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers,
        });
        
        if (!response.ok) {
          throw new Error(`REST API Error: ${response.statusText}`);
        }
        
        return await response.json();
      });
    },
    
    post: async (endpoint, body) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        
        if (!response.ok) {
          throw new Error(`REST API Error: ${response.statusText}`);
        }
        
        return await response.json();
      });
    },
    
    put: async (endpoint, body) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(body),
        });
        
        if (!response.ok) {
          throw new Error(`REST API Error: ${response.statusText}`);
        }
        
        return await response.json();
      });
    },
    
    delete: async (endpoint) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "DELETE",
          headers,
        });
        
        if (!response.ok) {
          throw new Error(`REST API Error: ${response.statusText}`);
        }
        
        // DELETE usually returns 200 with empty body or just status
        const text = await response.text();
        return text ? JSON.parse(text) : {};
      });
    },
  };
}
