import {
  capabilityTargetFor,
  jsonSchemaIsAbsentForTest as jsonSchemaIsAbsent,
  resolveApiMode,
  toolsAreAbsentForTest as toolsAreAbsent,
  __resetCapabilityCaches,
} from "../../lib/openai-structured-output.js";

/**
 * Capability classification decides whether a deployment is permanently
 * downgraded, so the cost of a false positive is high: one misread error
 * would strand a self-hoster on the weaker transport for the life of the
 * process. These cases pin both directions - a definitive "no such capability"
 * must be recognised, and an ordinary caller or operational mistake must not be.
 */

const STRICT_CASES: [number, string, boolean, string][] = [
  [
    400,
    '{"error":{"message":"json_schema is not supported"}}',
    true,
    "chat strict unsupported",
  ],
  [
    400,
    '{"error":{"message":"response_format json_schema not supported"}}',
    true,
    "chat names response_format",
  ],
  [
    400,
    '{"error":{"message":"text.format json_schema is not supported"}}',
    true,
    "responses strict unsupported",
  ],
  [
    400,
    '{"error":{"message":"structured outputs are not implemented"}}',
    true,
    "structured outputs not implemented",
  ],
  [
    404,
    '{"error":{"code":"route_not_found"}}',
    true,
    "structured route absent",
  ],
  [404, "Not Found", false, "ambiguous 404"],
  [405, "Method Not Allowed", true, "method absent"],
  [501, "Not Implemented", true, "not implemented"],
  [400, '{"error":{"message":"model is invalid"}}', false, "wrong model name"],
  [400, '{"error":{"message":"invalid api key"}}', false, "bad key"],
  [400, '{"error":{"message":"unknown model foo"}}', false, "unknown model"],
  [
    400,
    '{"error":{"message":"invalid_request_error: text is too long"}}',
    false,
    "text too long",
  ],
  [
    400,
    '{"error":{"message":"invalid response_format value"}}',
    false,
    "bad value mentions response_format",
  ],
  [
    400,
    '{"error":{"message":"unknown parameter"}}',
    false,
    "unknown parameter",
  ],
  [
    // A capability rejection that happens to use the word "invalid".
    400,
    '{"error":{"message":"Invalid parameter: response_format/json_schema is not supported"}}',
    true,
    "invalid-parameter wording, capability rejection",
  ],
  [
    400,
    '{"error":{"message":"Invalid parameter: max_tokens"}}',
    false,
    "invalid-parameter wording, real caller error",
  ],
  [
    400,
    '{"error":{"message":"Invalid parameter: response_format"}}',
    false,
    "names the field but no capability wording",
  ],
  [429, "rate limited", false, "rate limited"],
  [500, "boom", false, "server error"],
  [401, "unauthorized", false, "unauthorized"],
];

const TOOL_CASES: [number, string, boolean, string][] = [
  [
    400,
    '{"error":{"message":"tool calling is not supported"}}',
    true,
    "tool calling unsupported",
  ],
  [
    400,
    '{"error":{"message":"function calling not supported by this backend"}}',
    true,
    "function calling unsupported",
  ],
  [400, '{"error":{"message":"tools are disabled"}}', true, "tools disabled"],
  [
    404,
    '{"error":{"code":"route_not_found"}}',
    true,
    "structured route absent",
  ],
  [404, "Not Found", false, "ambiguous 404"],
  [
    400,
    '{"error":{"message":"invalid tool name"}}',
    false,
    "caller picked a bad tool name",
  ],
  [
    400,
    '{"error":{"message":"invalid function arguments"}}',
    false,
    "caller sent bad arguments",
  ],
  [400, '{"error":{"message":"rate limit exceeded"}}', false, "rate limited"],
  [500, "boom", false, "server error"],
  [401, "unauthorized", false, "unauthorized"],
];

describe("openai capability classification", () => {
  beforeEach(() => {
    vi.resetModules();
    __resetCapabilityCaches();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects Chat when ambiguous Responses 404 is a model error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "model `missing-model` not found",
              type: "invalid_request_error",
              code: "model_not_found",
            },
          }),
          { status: 404 },
        ),
      ),
    );

    await expect(
      resolveApiMode(capabilityTargetFor("missing-model", "http://backend/v1")),
    ).resolves.toBe("chat");
  });

  it("returns indeterminate when Chat verification is not a route answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const method = String(init?.method).toUpperCase();
        if (method === "POST" && String(_url).endsWith("/responses")) {
          return new Response(
            JSON.stringify({
              error: { message: "model not found", code: "model_not_found" },
            }),
            { status: 404 },
          );
        }
        return new Response("boom", { status: 500 });
      }),
    );

    await expect(
      resolveApiMode(capabilityTargetFor("missing-model", "http://backend/v1")),
    ).rejects.toMatchObject({ name: "OpenAiCapabilityIndeterminateError" });
  });

  it("selects Chat for an explicit Responses route 404", async () => {
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        if (first && String(init?.method).toUpperCase() === "POST") {
          first = false;
          return new Response(
            JSON.stringify({
              error: {
                message: "Unknown route: /responses",
                code: "route_not_found",
              },
            }),
            { status: 404 },
          );
        }
        return new Response(JSON.stringify({ id: "chat" }), { status: 200 });
      }),
    );

    await expect(
      resolveApiMode(capabilityTargetFor("model", "http://backend/v1")),
    ).resolves.toBe("chat");
  });
  it.each(STRICT_CASES)(
    "strict: HTTP %i %s -> %s",
    (status, body, want, label) => {
      expect({ label, got: jsonSchemaIsAbsent(status, body) }).toEqual({
        label,
        got: want,
      });
    },
  );

  it.each(TOOL_CASES)(
    "tools: HTTP %i %s -> %s",
    (status, body, want, label) => {
      expect({ label, got: toolsAreAbsent(status, body) }).toEqual({
        label,
        got: want,
      });
    },
  );
});
