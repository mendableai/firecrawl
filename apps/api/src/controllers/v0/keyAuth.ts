import { AuthResponse, RateLimiterMode } from "../../types";

import { Request, Response } from "express";
import { authenticateUser } from "../auth";

export const keyAuthController = async (req: Request, res: Response) => {
  try {
    // make sure to authenticate user first, Bearer <token>
    const auth = await authenticateUser(req, res);
    if (!auth.success) {
      return res.status(auth.status).json({ error: auth.error });
    }

    // if success, return success: true
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
