from ..utils import HttpClient, handle_response_error
from ..types import ConcurrencyCheck, CreditUsage, TokenUsage


def get_concurrency(client: HttpClient) -> ConcurrencyCheck:
    resp = client.get("/v2/concurrency-check")
    if not resp.ok:
        handle_response_error(resp, "get concurrency")
    body = resp.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error"))
    data = body.get("data", body)
    return ConcurrencyCheck(
        concurrency=data.get("concurrency"),
        max_concurrency=data.get("maxConcurrency", data.get("max_concurrency")),
    )


def get_credit_usage(client: HttpClient) -> CreditUsage:
    resp = client.get("/v2/credit-usage")
    if not resp.ok:
        handle_response_error(resp, "get credit usage")
    body = resp.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error"))
    data = body.get("data", body)
    return CreditUsage(remaining_credits=data.get("remaining_credits"))


def get_token_usage(client: HttpClient) -> TokenUsage:
    resp = client.get("/v2/token-usage")
    if not resp.ok:
        handle_response_error(resp, "get token usage")
    body = resp.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error"))
    data = body.get("data", body)
    return TokenUsage(
        prompt_tokens=data.get("promptTokens", data.get("prompt_tokens", 0)),
        completion_tokens=data.get("completionTokens", data.get("completion_tokens", 0)),
        total_tokens=data.get("totalTokens", data.get("total_tokens", 0)),
        step=data.get("step"),
        model=data.get("model"),
    )

