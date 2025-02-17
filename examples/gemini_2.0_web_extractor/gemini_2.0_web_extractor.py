import os
os.environ['GRPC_POLL_STRATEGY'] = 'poll'  
import json
import time
import requests
import re
from dotenv import load_dotenv
from serpapi.google_search import GoogleSearch
import google.generativeai as genai
import warnings

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
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.0-flash')
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
serp_api_key = os.getenv("SERP_API_KEY")

warnings.filterwarnings("ignore", category=UserWarning, module="grpc._cython.cygrpc")

def search_google(query):
    """Search Google using SerpAPI and return top results."""
    print(f"{Colors.YELLOW}Searching Google for '{query}'...{Colors.RESET}")
    search = GoogleSearch({"q": query, "api_key": serp_api_key})
    return search.get_dict().get("organic_results", [])

def select_urls_with_gemini(company, objective, serp_results):
    """Silent URL selection with Gemini"""
    try:
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                    for r in serp_results if r.get("link")]

        prompt = f"""Return JSON with 'selected_urls' array containing URLs from:
        Company: {company}
        Objective: {objective}
        Results: {json.dumps(serp_data)}
        Rules: Use exact URLs, add /* for site search, exclude social media"""
        
        response = model.generate_content(prompt)
        json_match = re.search(r'\{[\s\S]*"selected_urls"[\s\S]*\}', response.text)
        urls = json.loads(json_match.group()).get("selected_urls", []) if json_match else []
        
        return [url.strip('"').rstrip('/') for url in urls 
               if url.startswith(('http://', 'https://')) 
               and not any(s in url for s in ['twitter','linkedin','facebook'])]

    except Exception:
        return []

def extract_company_info(urls, prompt, company, api_key):
    """Silent extraction workflow"""
    try:
        response = requests.post(
            "https://api.firecrawl.dev/v1/extract",
            headers={'Authorization': f'Bearer {api_key}'},
            json={
                "urls": urls,
                "prompt": f"{prompt} for {company}",
                "enableWebSearch": True
            },
            timeout=30
        )
        return poll_firecrawl_result(response.json().get('id'), api_key)
    except Exception:
        return None

def poll_firecrawl_result(extraction_id, api_key, interval=3, max_attempts=10):
    headers = {'Authorization': f'Bearer {api_key}'}
    url = f"https://api.firecrawl.dev/v1/extract/{extraction_id}"
    
    for _ in range(max_attempts):
        try:
            data = requests.get(url, headers=headers, timeout=15).json()
            if data.get('status') == 'completed':
                return data.get('data')
            time.sleep(interval)
        except Exception:
            return None
    return None

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    serp_results = search_google(f"{company}")
    if not serp_results:
        print(f"{Colors.RED}No search results found{Colors.RESET}")
        return
    
    selected_urls = select_urls_with_gemini(company, objective, serp_results)
    
    if not selected_urls:
        print(f"{Colors.RED}Aborting: No URLs selected{Colors.RESET}")
        return
    
    print(f"{Colors.CYAN}Starting extraction for {len(selected_urls)} URLs{Colors.RESET}")
    data = extract_company_info(selected_urls, objective, company, firecrawl_api_key)
    
    if data:
        print(f"{Colors.GREEN}Final extracted data:{Colors.RESET}")
        print(json.dumps(data, indent=2))
    else:
        print(f"{Colors.RED}Extraction failed{Colors.RESET}")

if __name__ == "__main__":
    main()