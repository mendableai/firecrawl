import { Logger } from "winston";
import { z, ZodError } from "zod";
import { v4 as uuid } from "uuid";
import * as Sentry from "@sentry/node";

export type RobustFetchParams<Schema extends z.Schema<any>> = {
  url: string;
  logger: Logger;
  method: "GET" | "POST" | "DELETE" | "PUT";
  body?: any;
  headers?: Record<string, string>;
  schema?: Schema;
  dontParseResponse?: boolean;
  ignoreResponse?: boolean;
  ignoreFailure?: boolean;
  requestId?: string;
  tryCount?: number;
  tryCooldown?: number;
};

export async function robustFetch<
  Schema extends z.Schema<any>,
  Output = z.infer<Schema>,
>({
  url,
  logger,
  method = "GET",
  body,
  headers,
  schema,
  ignoreResponse = false,
  ignoreFailure = false,
  requestId = uuid(),
  tryCount = 1,
  tryCooldown,
}: RobustFetchParams<Schema>): Promise<Output> {
  const params = {
    url,
    logger,
    method,
    body,
    headers,
    schema,
    ignoreResponse,
    ignoreFailure,
    tryCount,
    tryCooldown,
  };

  let request: Response;
  try {
    request = await fetch(url, {
      method,
      headers: {
        ...(body instanceof FormData
          ? {}
          : body !== undefined
            ? {
                "Content-Type": "application/json",
              }
            : {}),
        ...(headers !== undefined ? headers : {}),
      },
      ...(body instanceof FormData
        ? {
            body,
          }
        : body !== undefined
          ? {
              body: JSON.stringify(body),
            }
          : {}),
    });
  } catch (error) {
    if (!ignoreFailure) {
      Sentry.captureException(error);
      if (tryCount > 1) {
        logger.debug(
          "Request failed, trying " + (tryCount - 1) + " more times",
          { params, error, requestId },
        );
        return await robustFetch({
          ...params,
          requestId,
          tryCount: tryCount - 1,
        });
      } else {
        logger.debug("Request failed", { params, error, requestId });
        throw new Error("Request failed", {
          cause: {
            params,
            requestId,
            error,
          },
        });
      }
    } else {
      return null as Output;
    }
  }

  if (ignoreResponse === true) {
    return null as Output;
  }

  const response = {
    status: request.status,
    headers: request.headers,
    body: await request.text(), // NOTE: can this throw an exception?
  };

  if (request.status >= 300) {
    if (tryCount > 1) {
      logger.debug(
        "Request sent failure status, trying " + (tryCount - 1) + " more times",
        { params, request, response, requestId },
      );
      if (tryCooldown !== undefined) {
        await new Promise((resolve) =>
          setTimeout(() => resolve(null), tryCooldown),
        );
      }
      return await robustFetch({
        ...params,
        requestId,
        tryCount: tryCount - 1,
      });
    } else {
      logger.debug("Request sent failure status", {
        params,
        request,
        response,
        requestId,
      });
      throw new Error("Request sent failure status", {
        cause: {
          params,
          request,
          response,
          requestId,
        },
      });
    }
  }

  let data: Output;
  try {
    data = JSON.parse(response.body);
  } catch (error) {
    logger.debug("Request sent malformed JSON", {
      params,
      request,
      response,
      requestId,
    });
    throw new Error("Request sent malformed JSON", {
      cause: {
        params,
        request,
        response,
        requestId,
      },
    });
  }

  if (schema) {
    try {
      data = schema.parse(data);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.debug("Response does not match provided schema", {
          params,
          request,
          response,
          requestId,
          error,
          schema,
        });
        throw new Error("Response does not match provided schema", {
          cause: {
            params,
            request,
            response,
            requestId,
            error,
            schema,
          },
        });
      } else {
        logger.debug("Parsing response with provided schema failed", {
          params,
          request,
          response,
          requestId,
          error,
          schema,
        });
        throw new Error("Parsing response with provided schema failed", {
          cause: {
            params,
            request,
            response,
            requestId,
            error,
            schema,
          },
        });
      }
    }
  }

  return data;
}
