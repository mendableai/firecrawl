import { Logger } from "winston";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/node";
import { MockState, saveMock } from "./mock";

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
  mock: MockState | null;
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
  requestId = crypto.randomUUID(),
  tryCount = 1,
  tryCooldown,
  mock,
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

  let response: {
    status: number;
    headers: Headers;
    body: string;
  };

  if (mock === null) {
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
            mock,
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

    response = {
      status: request.status,
      headers: request.headers,
      body: await request.text(), // NOTE: can this throw an exception?
    };
  } else {
    if (ignoreResponse === true) {
      return null as Output;
    }

    const makeRequestTypeId = (
      request: (typeof mock)["requests"][number]["options"],
    ) => {
      let trueUrl = (process.env.FIRE_ENGINE_BETA_URL && request.url.startsWith(process.env.FIRE_ENGINE_BETA_URL))
        ? request.url.replace(process.env.FIRE_ENGINE_BETA_URL, "<fire-engine>")
        : request.url;
      
      let out = trueUrl + ";" + request.method;
      if (
        process.env.FIRE_ENGINE_BETA_URL &&
        (trueUrl.startsWith("<fire-engine>")) &&
        request.method === "POST"
      ) {
        out += "f-e;" + request.body?.engine + ";" + request.body?.url;
      }
      return out;
    };

    const thisId = makeRequestTypeId(params);
    const matchingMocks = mock.requests
      .filter((x) => makeRequestTypeId(x.options) === thisId)
      .sort((a, b) => a.time - b.time);
    const nextI = mock.tracker[thisId] ?? 0;
    mock.tracker[thisId] = nextI + 1;

    if (!matchingMocks[nextI]) {
      throw new Error("Failed to mock request -- no mock targets found.");
    }

    response = {
      ...matchingMocks[nextI].result,
      headers: new Headers(matchingMocks[nextI].result.headers),
    };
  }

  if (response.status >= 300) {
    if (tryCount > 1) {
      logger.debug(
        "Request sent failure status, trying " + (tryCount - 1) + " more times",
        { params, response, requestId },
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
        mock,
      });
    } else {
      logger.debug("Request sent failure status", {
        params,
        response,
        requestId,
      });
      throw new Error("Request sent failure status", {
        cause: {
          params,
          response,
          requestId,
        },
      });
    }
  }

  if (mock === null) {
    await saveMock(
      {
        ...params,
        logger: undefined,
        schema: undefined,
        headers: undefined,
      },
      response,
    );
  }

  let data: Output;
  try {
    data = JSON.parse(response.body);
  } catch (error) {
    logger.debug("Request sent malformed JSON", {
      params,
      response,
      requestId,
    });
    throw new Error("Request sent malformed JSON", {
      cause: {
        params,
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
          response,
          requestId,
          error,
          schema,
        });
        throw new Error("Response does not match provided schema", {
          cause: {
            params,
            response,
            requestId,
            error,
            schema,
          },
        });
      } else {
        logger.debug("Parsing response with provided schema failed", {
          params,
          response,
          requestId,
          error,
          schema,
        });
        throw new Error("Parsing response with provided schema failed", {
          cause: {
            params,
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
