import { checkTeamCredits } from "../services/billing/credit_billing";
import { Logger } from "./logger";

type checkCreditsResponse = {
  status: number;
  error: string | null;
}

export const checkCredits = async (team_id: string): Promise<checkCreditsResponse> => {
  try {
    const {
      success: creditsCheckSuccess,
      message: creditsCheckMessage
    } = await checkTeamCredits(team_id, 1);
    if (!creditsCheckSuccess) {
      return {
        status: 402,
        error: "Insufficient credits"
      };
    }
  } catch (error) {
    Logger.error(error);
    return {
      status: 500,
      error: "Error checking team credits. Please contact hello@firecrawl.com for help."
    };
  }
  return {
    status: 200,
    error: null
  }
};