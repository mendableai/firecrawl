import CacheableLookup from 'cacheable-lookup';

export const cacheableLookup = new CacheableLookup({
  // this is important to avoid querying local hostnames see https://github.com/szmarczak/cacheable-lookup readme
  ...((process.env.ENV !== "production" || process.env.SENTRY_ENVIRONMENT === "dev") ? {} : { lookup: false }),
});