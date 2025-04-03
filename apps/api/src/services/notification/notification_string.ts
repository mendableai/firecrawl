import { NotificationType } from "../../types";

// depending on the notification type, return the appropriate string
export function getNotificationString(
  notificationType: NotificationType,
): string {
  switch (notificationType) {
    case NotificationType.APPROACHING_LIMIT:
      return "Approaching the limit (80%)";
    case NotificationType.LIMIT_REACHED:
      return "Limit reached (100%)";
    case NotificationType.RATE_LIMIT_REACHED:
      return "Rate limit reached";
    case NotificationType.AUTO_RECHARGE_SUCCESS:
      return "Auto-recharge successful";
    case NotificationType.AUTO_RECHARGE_FAILED:
      return "Auto-recharge failed";
    default:
      return "Unknown notification type";
  }
}
