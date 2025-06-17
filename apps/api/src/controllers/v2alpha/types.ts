import { ErrorResponse } from "../v1/types";

export type MapDocument = {
  url: string;
  title?: string;
  description?: string;
};

export type MapResponse =
  | ErrorResponse
  | {
      success: true;
      docs: MapDocument[];
    };