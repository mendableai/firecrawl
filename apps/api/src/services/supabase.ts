import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Logger } from "../lib/logger";

// SupabaseService class initializes the Supabase client conditionally based on environment variables.
class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceToken = process.env.SUPABASE_SERVICE_TOKEN;
    // Only initialize the Supabase client if both URL and Service Token are provided.
    if (process.env.USE_DB_AUTHENTICATION === "false") {
      // Warn the user that Authentication is disabled by setting the client to null
      Logger.warn(
        "Authentication is disabled. Supabase client will not be initialized."
      );
      this.client = null;
    } else if (!supabaseUrl || !supabaseServiceToken) {
      Logger.error(
        "Supabase environment variables aren't configured correctly. Supabase client will not be initialized. Fix ENV configuration or disable DB authentication with USE_DB_AUTHENTICATION env variable"
      );
    } else {
      this.client = createClient(supabaseUrl, supabaseServiceToken);
    }
  }

  // Provides access to the initialized Supabase client, if available.
  getClient(): SupabaseClient | null {
    return this.client;
  }
}

// Using a Proxy to handle dynamic access to the Supabase client or service methods.
// This approach ensures that if Supabase is not configured, any attempt to use it will result in a clear error.
export const supabase_service: SupabaseClient = new Proxy(
  new SupabaseService(),
  {
    get: function (target, prop, receiver) {
      if (process.env.USE_DB_AUTHENTICATION === "false") {
        Logger.debug(
          "Attempted to access Supabase client when it's not configured."
        );
      }
      const client = target.getClient();
      // If the Supabase client is not initialized, intercept property access to provide meaningful error feedback.
      if (client === null) {
        Logger.error(
          "Attempted to access Supabase client when it's not configured."
        );
        return () => {
          throw new Error("Supabase client is not configured.");
        };
      }
      // Direct access to SupabaseService properties takes precedence.
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      // Otherwise, delegate access to the Supabase client.
      return Reflect.get(client, prop, receiver);
    },
  }
) as unknown as SupabaseClient;
