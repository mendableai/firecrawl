import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI
from serpapi import GoogleSearch
from firecrawl import FirecrawlApp

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

def select_urls_with_r1(company, objective, serp_results):
    """
    Use R1 to select the most relevant URLs from SERP results for the given company and objective.
    Returns a JSON object with a "selected_urls" property that is an array of strings.
    """
    try:
        # Prepare the data for R1
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                     for r in serp_results if r.get("link")]

        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {
                    "role": "system",
                    "content": "You select URLs from the SERP results relevant to the company and objective."
                },
                {
                    "role": "user",
                    "content": (
                        f"Company: {company}\n"
                        f"Objective: {objective}\n"
                        f"SERP Results: {json.dumps(serp_data)}\n\n"
                        "Return a JSON object with a property 'selected_urls' that contains an array "
                        "of URLs most likely to help meet the objective. If you think the data might not be on the homepage, add a /* to the end of the URL. Do not return any social media links. For example: {\"selected_urls\": [\"https://example.com\", \"https://example2.com\"]}"
                    )
                }
            ],
        )

        # The response is guaranteed to follow the specified JSON schema
        result = json.loads(response.choices[0].message.content)
        urls = result.get("selected_urls", [])
        return urls

    except Exception as e:
        print(f"{Colors.RED}Error selecting URLs with R1: {e}{Colors.RESET}")
        return []



def extract_company_info(urls, prompt, company, api_key):
    """Use requests to call Firecrawl's extract endpoint with selected URLs."""
    print(f"{Colors.YELLOW}Extracting structured data from the provided URLs using Firecrawl's /extract endpoint...{Colors.RESET}")
    app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
    try:
        extract_prompt = prompt + " for " + company
        response = app.extract(urls, {"prompt": extract_prompt, "enableWebSearch": True})
        print(response)
        return response
    except Exception as e:
        print(f"{Colors.RED}Failed to extract data: {e}{Colors.RESET}")
        return None

def deduplicate_with_r1(data, company, objective):
    """Use R1 to deduplicate and consolidate extracted information."""
    print(f"{Colors.YELLOW}Deduplicating and consolidating information using R1...{Colors.RESET}")
    
    try:
        # Ensure data is valid JSON before sending
        if not data:
            return {}
            
        response = client.chat.completions.create(
            model="deepseek-reasoner",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at consolidating information and removing duplicates. Analyze the extracted data and provide a clean, consolidated response."
                },
                {
                    "role": "user",
                    "content": (
                        f"Company: {company}\n"
                        f"Objective: {objective}\n"
                        f"Extracted Data: {json.dumps(data, indent=2)}\n\n"
                        "Please analyze this data and:\n"
                        "1. Remove any duplicate information\n"
                        "2. Consolidate similar points\n"
                        "3. Format the response as a clean JSON object\n"
                        "4. Ensure all information is relevant to the objective\n"
                        "Return only the JSON response."
                    )
                }
            ],
        )
        
        # Handle empty or invalid responses
        response_text = response.choices[0].message.content.strip()
        if not response_text:
            return {}
            
        try:
            consolidated_data = json.loads(response_text)
            return consolidated_data
        except json.JSONDecodeError:
            # If JSON parsing fails, try to extract JSON from the response
            # Look for content between curly braces
            start = response_text.find('{')
            end = response_text.rfind('}')
            if start >= 0 and end >= 0:
                json_str = response_text[start:end+1]
                return json.loads(json_str)
            return {}
        
    except Exception as e:
        print(f"{Colors.RED}Error deduplicating data with R1: {e}{Colors.RESET}")
        return data

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    serp_results = search_google(f"{company}")
    if not serp_results:
        print(f"{Colors.RED}No search results found.{Colors.RESET}")
        return
    
    # Ask R1 to select URLs
    selected_urls = select_urls_with_r1(company, objective, serp_results)
    
    if not selected_urls:
        print(f"{Colors.RED}R1 did not return any URLs.{Colors.RESET}")
        return
    
    print(f"{Colors.CYAN}Selected URLs for extraction by R1:{Colors.RESET}")
    for url in selected_urls:
        print(f"- {url}")

    data = extract_company_info(selected_urls, objective, company, firecrawl_api_key)
    
    if data and data.get('success') and data.get('data'):
        # Deduplicate and consolidate the extracted data
        consolidated_data = deduplicate_with_r1(data['data'], company, objective)
        
        print(f"\n{Colors.GREEN}Consolidated and deduplicated data:{Colors.RESET}")
        print(json.dumps(consolidated_data, indent=2))
    else:
        print(f"{Colors.RED}Failed to extract the requested information. Try refining your prompt or choosing a different company.{Colors.RESET}")

if __name__ == "__main__":
    main()
