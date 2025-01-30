import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI
from firecrawl import FirecrawlApp
from serpapi.google_search import GoogleSearch

# ANSI color codes
class Colors:
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

# Load environment variables
load_dotenv()

# Initialize clients
client = OpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")

def search_google(query):
    """Search Google using SerpAPI and return top results."""
    print(f"{Colors.YELLOW}Searching Google for '{query}'...{Colors.RESET}")
    search = GoogleSearch({"q": query, "api_key": os.getenv("SERP_API_KEY")})
    return search.get_dict().get("organic_results", [])

def select_urls_with_deepseek(company, objective, serp_results):
    """
    Use Deepseek R1 to select the most relevant URLs from SERP results for the given company and objective.
    Returns a list of selected URLs.
    """
    try:
        # Prepare the data for Deepseek
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                     for r in serp_results if r.get("link")]

        system_prompt = """You are an expert at selecting the most relevant URLs for company research. 
        Analyze the search results and select URLs that are most likely to contain the requested information.
        Exclude social media links. Add /* to URLs where the entire site should be crawled.
        Return only a JSON object with the 'selected_urls' array."""

        response = client.chat.completions.create(
            model="deepseek-reasoner",# Update with actual Deepseek model identifier
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": (
                        f"Company: {company}\n"
                        f"Objective: {objective}\n"
                        f"Search Results: {json.dumps(serp_data)}\n\n"
                        "Select the most relevant URLs and return them in this format: "
                        "{\"selected_urls\": [\"https://example.com\", \"https://example2.com/*\"]}"
                    )
                }
            ],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        # Parse the JSON response
        result = json.loads(response.choices[0].message.content)
        urls = result.get("selected_urls", [])
        return urls

    except Exception as e:
        print(f"{Colors.RED}Error selecting URLs with Deepseek: {e}{Colors.RESET}")
        return []

def extract_company_info(urls, prompt, company, api_key):
    """Use requests to call Firecrawl's extract endpoint with selected URLs."""
    print(f"{Colors.YELLOW}Extracting structured data from the provided URLs using Firecrawl...{Colors.RESET}")
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    
    payload = {
        "urls": urls,
        "prompt": prompt + " for " + company
    }
    
    try:
        response = requests.post(
            "https://api.firecrawl.dev/v1/extract",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        print(f"{Colors.RED}Failed to extract data: {e}{Colors.RESET}")
        return None

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    serp_results = search_google(f"{company}")
    if not serp_results:
        print(f"{Colors.RED}No search results found.{Colors.RESET}")
        return
    
    # Ask Deepseek to select URLs
    selected_urls = select_urls_with_deepseek(company, objective, serp_results)
    
    if not selected_urls:
        print(f"{Colors.RED}Deepseek did not return any URLs.{Colors.RESET}")
        return
    
    print(f"{Colors.CYAN}Selected URLs for extraction by Deepseek:{Colors.RESET}")
    for url in selected_urls:
        print(f"- {url}")

    data = extract_company_info(selected_urls, objective, company, firecrawl_api_key)
    
    if data and data.get('success') and data.get('data'):
        print(f"{Colors.GREEN}Data successfully extracted:{Colors.RESET}")
        print(json.dumps(data['data'], indent=2))
    else:
        print(f"{Colors.RED}Failed to extract the requested information. Try refining your prompt or choosing a different company.{Colors.RESET}")

if __name__ == "__main__":
    main()