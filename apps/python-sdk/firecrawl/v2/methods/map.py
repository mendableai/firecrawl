"""
Mapping functionality for Firecrawl v2 API.
"""

from typing import Optional, Dict, Any
from ..types import MapOptions, MapResponse, MapData, LinkResult
from ..utils import HttpClient, handle_response_error


def _prepare_map_request(url: str, options: Optional[MapOptions] = None) -> Dict[str, Any]:
    if not url or not url.strip():
        raise ValueError("URL cannot be empty")

    payload: Dict[str, Any] = {"url": url.strip()}

    if options is not None:
        # Transform ignoreSitemap and sitemapOnly to the new unified sitemap parameter
        # sitemap: "only" | "include" | "skip" (default include)
        sitemap: str = "include"
        if options.sitemap_only:
            sitemap = "only"
        elif options.ignore_sitemap:
            sitemap = "skip"

        data: Dict[str, Any] = {}
        data["sitemap"] = sitemap

        if options.search is not None:
            data["search"] = options.search
        if options.include_subdomains is not None:
            data["includeSubdomains"] = options.include_subdomains
        if options.limit is not None:
            data["limit"] = options.limit
        payload.update(data)

    return payload


def map(client: HttpClient, url: str, options: Optional[MapOptions] = None) -> MapResponse:
    """
    Map a URL and return a list of links with optional titles/descriptions.
    """
    request_data = _prepare_map_request(url, options)

    response = client.post("/v2/map", request_data)

    if not response.ok:
        handle_response_error(response, "map")

    body = response.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error occurred"))

    data = body.get("data", {})
    result_links: list[LinkResult] = []
    for item in data.get("links", []):
        if isinstance(item, dict):
            result_links.append(
                LinkResult(
                    url=item.get("url", ""),
                    title=item.get("title"),
                    description=item.get("description"),
                )
            )
        elif isinstance(item, str):
            result_links.append(LinkResult(url=item))

    return MapResponse(success=True, data=MapData(links=result_links))

