// import Redis from "ioredis";
import { ServerRateLimiter, } from "./rate-limiter";

const redisRateLimitClient = ServerRateLimiter.getRedisClient();

// Listen to 'error' events to the Redis connection
redisRateLimitClient.on("error", (error) => {
  try {
    if (error.message === "ECONNRESET") {
      console.log("Connection to Redis Session Store timed out.");
    } else if (error.message === "ECONNREFUSED") {
      console.log("Connection to Redis Session Store refused!");
    } else console.log(error);
  } catch (error) {}
});

// Listen to 'reconnecting' event to Redis
redisRateLimitClient.on("reconnecting", (err) => {
  try {
    if (redisRateLimitClient.status === "reconnecting")
      console.log("Reconnecting to Redis Session Store...");
    else console.log("Error reconnecting to Redis Session Store.");
  } catch (error) {}
});

// Listen to the 'connect' event to Redis
redisRateLimitClient.on("connect", (err) => {
  try {
    if (!err) console.log("Connected to Redis Session Store!");
  } catch (error) {}
});

/**
 * Set a value in Redis with an optional expiration time.
 * @param {string} key The key under which to store the value.
 * @param {string} value The value to store.
 * @param {number} [expire] Optional expiration time in seconds.
 */
const setValue = async (key: string, value: string, expire?: number) => {
  if (expire) {
    await redisRateLimitClient.set(key, value, "EX", expire);
  } else {
    await redisRateLimitClient.set(key, value);
  }
};

/**
 * Get a value from Redis.
 * @param {string} key The key of the value to retrieve.
 * @returns {Promise<string|null>} The value, if found, otherwise null.
 */
const getValue = async (key: string): Promise<string | null> => {
  const value = await redisRateLimitClient.get(key);
  return value;
};

/**
 * Delete a key from Redis.
 * @param {string} key The key to delete.
 */
const deleteKey = async (key: string) => {
  await redisRateLimitClient.del(key);
};

export { setValue, getValue, deleteKey };
