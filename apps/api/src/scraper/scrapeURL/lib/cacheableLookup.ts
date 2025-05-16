import CacheableLookup from 'cacheable-lookup';

export const cacheableLookup = new CacheableLookup({});

if (process.env.ENV === "production" && process.env.SENTRY_ENVIRONMENT === "dev") {
    console.log(cacheableLookup.servers);
    cacheableLookup.servers.push("100.100.100.100");
}
