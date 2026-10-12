import { captureOncePerDay } from "./daily-capture";
import type {
  KeylessPromptReason,
  KeylessSignupSurface,
} from "./keyless-signup-link";

export const KEYLESS_PROMPT_SHOWN_EVENT = "keyless_prompt_shown";

type KeylessPromptShown = {
  /** keylessTeamUuid of the caller: the user_onboarding.keyless_team_id join key. */
  keylessTeamId: string;
  surface: KeylessSignupSurface;
  reason: KeylessPromptReason;
  httpStatus: number;
  /** True when the prompt carried a /k/<token> link, false for the fallback link. */
  tokenLink: boolean;
};

export function keylessPromptDedupeKey(
  prompt: Pick<KeylessPromptShown, "keylessTeamId" | "surface" | "reason">,
  now: Date = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  return `keyless_prompt_shown:${day}:${prompt.keylessTeamId}:${prompt.surface}:${prompt.reason}`;
}

/**
 * Emit `keyless_prompt_shown` at most once per (keyless team, surface, reason)
 * per UTC day. Fire-and-forget, never throws.
 */
export function trackKeylessPromptShown(prompt: KeylessPromptShown): void {
  captureOncePerDay({
    dedupeKey: keylessPromptDedupeKey(prompt),
    event: KEYLESS_PROMPT_SHOWN_EVENT,
    distinctId: prompt.keylessTeamId,
    properties: {
      keyless_team_id: prompt.keylessTeamId,
      surface: prompt.surface,
      reason: prompt.reason,
      http_status: prompt.httpStatus,
      link_type: prompt.tokenLink ? "token" : "fallback",
      // Keyless identities are per IP: do not create a person for each one.
      $process_person_profile: false,
    },
    module: "keyless-prompt-analytics",
  });
}
