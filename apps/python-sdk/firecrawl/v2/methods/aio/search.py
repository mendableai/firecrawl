from typing import Dict, Any
from ...types import SearchRequest, SearchData, SearchResult, Document
from ...utils.http_client_async import AsyncHttpClient
from ...utils.error_handler import handle_response_error
from ...utils.validation import prepare_scrape_options, validate_scrape_options


def _prepare_search_request(request: SearchRequest) -> Dict[str, Any]:
    data = request.model_dump(exclude_none=True)
    if request.ignore_invalid_urls is not None:
        data["ignoreInvalidURLs"] = request.ignore_invalid_urls
        data.pop("ignore_invalid_urls", None)
    if request.scrape_options is not None:
        validate_scrape_options(request.scrape_options)
        scrape_data = prepare_scrape_options(request.scrape_options)
        if scrape_data:
            data["scrapeOptions"] = scrape_data
        data.pop("scrape_options", None)
    return data


async def search(client: AsyncHttpClient, request: SearchRequest) -> SearchData:
    payload = _prepare_search_request(request)
    response = await client.post("/v2/search", payload)
    if response.status_code >= 400:
        handle_response_error(response, "search")
    body = response.json()
    if not body.get("success"):
        raise Exception(body.get("error", "Unknown error occurred"))

    data = body.get("data", {})
    search_data = SearchData()
    for source_type, source_documents in data.items():
        if isinstance(source_documents, list):
            results = []
            for doc_data in source_documents:
                if isinstance(doc_data, dict):
                    if request.scrape_options is not None and any(
                        key in doc_data for key in ['markdown', 'html', 'rawHtml', 'links', 'summary', 'screenshot', 'changeTracking']
                    ):
                        normalized = dict(doc_data)
                        if 'rawHtml' in normalized and 'raw_html' not in normalized:
                            normalized['raw_html'] = normalized.pop('rawHtml')
                        if 'changeTracking' in normalized and 'change_tracking' not in normalized:
                            normalized['change_tracking'] = normalized.pop('changeTracking')
                        results.append(Document(**normalized))
                    else:
                        results.append(SearchResult(
                            url=doc_data.get('url', ''),
                            title=doc_data.get('title'),
                            description=doc_data.get('description')
                        ))
                elif isinstance(doc_data, str):
                    results.append(SearchResult(url=doc_data))
            if hasattr(search_data, source_type):
                setattr(search_data, source_type, results)
    return search_data

