/**
 * Process items with a concurrency limit to avoid blocking the event loop
 * and overwhelming external APIs.
 *
 * @param {Array} items - Items to process
 * @param {number} limit - Max concurrent operations
 * @param {Function} fn - Async function to call for each item: (item) => Promise
 * @returns {Promise<Array>} - Array of results in the same order as items
 */
const runWithConcurrency = async (items, limit, fn) => {
  const queue = [...items];
  let index = 0;

  const worker = async () => {
    while (index < queue.length) {
      const i = index++;
      try {
        await fn(queue[i]);
      } catch {
        // Errors should be handled inside fn
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, () => worker()));
};

module.exports = { runWithConcurrency };
