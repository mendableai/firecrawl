import { Request, Response } from "express";
import { RequestWithAuth } from "./types";

export async function protectedDataController(
  req: RequestWithAuth<{}, Response, any>,
  res: Response<any>,
) {
  res.json({
    request: {
      headers: req.headers,
      body: req.body,
    },
    success: true,
    data: {
      created_at: new Date().toISOString(),
      person: {
        name: "John Doe",
        age: 30,
        email: "john.doe@example.com",
      },
      company: {
        name: "Example Inc.",
        industry: "Technology",
      },
    },
  });
}
