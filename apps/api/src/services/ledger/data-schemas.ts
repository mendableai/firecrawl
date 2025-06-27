/**
 * This file defines the data schemas for events tracked in the ledger system.
 * These interfaces represent the structure of the 'data' JSONB column in ledger.tracks.
 */

/**
 * Common properties shared across all events
 */
export interface BaseEventData {
    user_id?: string; // User ID if available
    team_id?: string; // Team ID if available
  }
  
  /**
   * Domain checked event data
   * Tracks when a user checks if a domain is blocked
   */
  export interface DomainCheckedEventData extends BaseEventData {
    domain_name: string; // The domain that was checked
    is_blocked: boolean; // Whether the domain is blocked
  }
  
  /**
   * Subscription purchased event data
   * Tracks when a user purchases a subscription
   */
  export interface SubscriptionPurchasedEventData extends BaseEventData {
    price_id: string; // The price ID for the subscription
    subscription_id: string; // The subscription ID
    amount?: number; // The amount paid
    currency?: string; // The currency used for payment
  }
  
  /**
   * Subscription upgraded event data
   * Tracks when a user upgrades their subscription
   */
  export interface SubscriptionUpgradedEventData extends BaseEventData {
    old_price_id: string; // The previous price ID
    new_price_id: string; // The new price ID
    subscription_id: string; // The subscription ID
    old_amount?: number; // Previous amount
    new_amount?: number; // New amount
  }
  
  /**
   * Subscription downgraded event data
   * Tracks when a user downgrades their subscription
   */
  export interface SubscriptionDowngradedEventData extends BaseEventData {
    old_price_id: string; // The previous price ID
    new_price_id: string; // The new price ID
    subscription_id: string; // The subscription ID
    old_amount?: number; // Previous amount
    new_amount?: number; // New amount
  }
  
  /**
   * Subscription cancelled event data
   * Tracks when a user cancels their subscription
   */
  export interface SubscriptionCancelledEventData extends BaseEventData {
    subscription_id: string; // The subscription ID
    price_id: string; // The price ID for the subscription
    reason?: string; // Cancellation reason if provided
    effective_date: string; // When the cancellation takes effect
  }
  
  /**
   * Billing information changed event data
   * Tracks when a user updates their billing information
   */
  export interface BillingChangedEventData extends BaseEventData {
    payment_method_type?: string; // The type of payment method
  }
  
  /**
   * Concurrent browser limit reached event data
   * Tracks when a user reaches the concurrent browser limit
   */
  export interface ConcurrentBrowserLimitReachedEventData extends BaseEventData {
    team_id: string; // The team ID
  }
  /**
   * Map of event definition slugs to their data types
   */
  export interface EventDataMap {
    "domain-checked": DomainCheckedEventData;
    "subscription-purchased": SubscriptionPurchasedEventData;
    "subscription-upgraded": SubscriptionUpgradedEventData;
    "subscription-downgraded": SubscriptionDowngradedEventData;
    "subscription-cancelled": SubscriptionCancelledEventData;
    "billing-changed": BillingChangedEventData;
    "concurrent-browser-limit-reached": ConcurrentBrowserLimitReachedEventData;
  }
  
  /**
   * Event definition slugs
   */
  export type EventDefinitionSlug = keyof EventDataMap;
  
  /**
   * Helper type to extract the data type for a specific event
   */
  export type EventData<T extends EventDefinitionSlug> = EventDataMap[T];
  
  /**
   * Creates a properly typed event data object with current timestamp
   */
  export function createEventData<T extends EventDefinitionSlug>(
    eventType: T,
    data: EventDataMap[T],
  ): EventDataMap[T] {
    return {
      ...data,
    } as EventDataMap[T];
  }
  