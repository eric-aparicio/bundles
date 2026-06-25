import fetch from "node-fetch";
import { shopifyRateLimiter } from "./rateLimit.js";

let tokenCache = {
  token: null,
  expiresAt: null,
};

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt && now < tokenCache.expiresAt - 300000) {
    return tokenCache.token;
  }
  console.log("🔑 Obteniendo nuevo access token de Shopify...");
  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP_URL}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    }
  );
  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Error obteniendo token: ${JSON.stringify(data)}`);
  }
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + data.expires_in * 1000;
  console.log(`✅ Token obtenido, expira en ${Math.round(data.expires_in / 3600)}h`);
  return tokenCache.token;
}

export function createRestClient(shop, accessToken) {
  const baseUrl = `https://${shop}/admin/api/2024-10`;

  const getHeaders = async () => {
    const token = accessToken || await getAccessToken();
    return {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    };
  };

  const handleError = async (response, endpoint) => {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`REST API Error: ${response.status} ${response.statusText} [${endpoint}] ${body}`);
    }
  };

  return {
    get: async (endpoint) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers: await getHeaders(),
        });
        await handleError(response, endpoint);
        return await response.json();
      });
    },
    post: async (endpoint, body) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: await getHeaders(),
          body: JSON.stringify(body),
        });
        await handleError(response, endpoint);
        return await response.json();
      });
    },
    put: async (endpoint, body) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "PUT",
          headers: await getHeaders(),
          body: JSON.stringify(body),
        });
        await handleError(response, endpoint);
        return await response.json();
      });
    },
    delete: async (endpoint) => {
      return shopifyRateLimiter.throttle(async () => {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "DELETE",
          headers: await getHeaders(),
        });
        await handleError(response, endpoint);
        const text = await response.text();
        return text ? JSON.parse(text) : {};
      });
    },
  };
}

export { getAccessToken };
