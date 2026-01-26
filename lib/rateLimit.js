/**
 * Rate Limiter for Shopify REST API
 * Shopify allows 2 requests per second (burst: 40)
 * We'll be conservative: 4 requests/second with queue
 */

export class RateLimiter {
  constructor(requestsPerSecond = 4) {
    this.queue = [];
    this.lastRequestTime = 0;
    this.minTimeBetweenRequests = 1000 / requestsPerSecond; // 250ms for 4 req/sec
    this.processing = false;
  }

  async throttle(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // Wait if we haven't waited long enough
      if (timeSinceLastRequest < this.minInterval) {
        await new Promise(resolve => 
          setTimeout(resolve, this.minInterval - timeSinceLastRequest)
        );
      }
      
      const { fn, resolve, reject } = this.queue.shift();
      
      try {
        this.lastRequestTime = Date.now();
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
}

// Single instance shared across all requests
const shopifyRateLimiter = new RateLimiter(4); // Increased to 4 req/sec

export { shopifyRateLimiter };
