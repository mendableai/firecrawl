import { isEnterpriseTeamCreatedAfterRateLimitChange } from "../subscription/enterprise-check";

export async function shouldSendConcurrencyLimitNotification(
  team_id: string,
): Promise<boolean> {
  const isEnterprise =
    await isEnterpriseTeamCreatedAfterRateLimitChange(team_id);
  return !isEnterprise;
}
