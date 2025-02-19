import os
import json
import time
import requests
from dotenv import load_dotenv
from serpapi.google_search import GoogleSearch
from google import genai

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
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
serp_api_key = os.getenv("SERP_API_KEY")

# Add this debug print (remember to remove it before committing)
if not firecrawl_api_key:
    print(f"{Colors.RED}Warning: FIRECRAWL_API_KEY not found in environment variables{Colors.RESET}")

def search_google(query):
    """Search Google using SerpAPI and return top results."""
    print(f"{Colors.YELLOW}Searching Google for '{query}'...{Colors.RESET}")
    search = GoogleSearch({"q": query, "api_key": serp_api_key})
    results = search.get_dict().get("organic_results", [])
    
    print(f"{Colors.CYAN}Found {len(results)} search results{Colors.RESET}")
    if results:
        print("First result:", results[0])
    return results

def select_urls_with_r1(company, objective, serp_results):
    """
    Use Gemini 2.0 Flash to select URLs from SERP results.
    Returns a list of URLs.
    """
    try:
        print(f"{Colors.CYAN}Processing {len(serp_results)} search results...{Colors.RESET}")
        
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                     for r in serp_results if r.get("link")]
        
        print(f"{Colors.CYAN}Prepared {len(serp_data)} valid results for processing{Colors.RESET}")

        prompt = (
            "You are a URL selector that always responds with valid JSON. "
            f"Company: {company}\n"
            f"Objective: {objective}\n"
            f"SERP Results: {json.dumps(serp_data)}\n\n"
            "Return a JSON object with a property 'selected_urls' that contains an array "
            "of URLs most likely to help meet the objective. Add a /* to the end of the URL if you think it should search all of the pages in the site. "
            "Do not return any social media links. For example: {\"selected_urls\": [\"https://example.com\", \"https://example2.com\"]}"
        )

        print(f"{Colors.CYAN}Calling Gemini API...{Colors.RESET}")
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )

        print(f"{Colors.CYAN}Gemini response: {response.text}{Colors.RESET}")

        try:
            # Remove the markdown code block markers if they exist
            cleaned_response = response.text.replace('```json\n', '').replace('\n```', '')
            result = json.loads(cleaned_response)
            
            if isinstance(result, dict) and "selected_urls" in result:
                urls = result["selected_urls"]
            else:
                urls = []
        except json.JSONDecodeError as e:
            print(f"{Colors.RED}JSON parsing error: {e}{Colors.RESET}")
            urls = []

        if not urls:
            print(f"{Colors.YELLOW}No valid URLs found.{Colors.RESET}")
            return []

        print(f"{Colors.CYAN}Selected URLs for extraction:{Colors.RESET}")
        for url in urls:
            print(f"- {url}")

        return urls

    except Exception as e:
        print(f"{Colors.RED}Error selecting URLs: {e}{Colors.RESET}")
        return []

def extract_company_info(urls, prompt, company, api_key):
    if not api_key:
        print(f"{Colors.RED}Error: Firecrawl API key is missing or invalid{Colors.RESET}")
        return None
        
    print(f"{Colors.YELLOW}Using API key: {api_key[:8]}...{Colors.RESET}")  # Only show first 8 chars for security
    """Use requests to call Firecrawl's extract endpoint with selected URLs."""
    print(f"{Colors.YELLOW}Extracting structured data from the provided URLs using Firecrawl...{Colors.RESET}")
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    
    payload = {
        "urls": urls,
        "prompt": prompt + " for " + company,
        "enableWebSearch": True
    }
    
    try:
        response = requests.post(
            "https://api.firecrawl.dev/v1/extract",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        data = response.json()
        
        if not data.get('success'):
            print(f"{Colors.RED}API returned error: {data.get('error', 'No error message')}{Colors.RESET}")
            return None
        
        extraction_id = data.get('id')
        if not extraction_id:
            print(f"{Colors.RED}No extraction ID found in response.{Colors.RESET}")
            return None

        return poll_firecrawl_result(extraction_id, api_key)

    except requests.exceptions.RequestException as e:
        print(f"{Colors.RED}Request failed: {e}{Colors.RESET}")
        return None
    except json.JSONDecodeError as e:
        print(f"{Colors.RED}Failed to parse response: {e}{Colors.RESET}")
        return None
    except Exception as e:
        print(f"{Colors.RED}Failed to extract data: {e}{Colors.RESET}")
        return None

def poll_firecrawl_result(extraction_id, api_key, interval=5, max_attempts=36):
    """Poll Firecrawl API to get the extraction result."""
    url = f"https://api.firecrawl.dev/v1/extract/{extraction_id}"
    headers = {
        'Authorization': f'Bearer {api_key}'
    }

    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()

            if data.get('success') and data.get('data'):
                print(f"{Colors.GREEN}Data successfully extracted:{Colors.RESET}")
                print(json.dumps(data['data'], indent=2))
                return data['data']
            elif data.get('success') and not data.get('data'):
                time.sleep(interval)
            else:
                print(f"{Colors.RED}API Error: {data.get('error', 'No error message provided')}{Colors.RESET}")
                return None

        except requests.exceptions.RequestException:
            return None
        except json.JSONDecodeError:
            return None
        except Exception:
            return None

    print(f"{Colors.RED}Max polling attempts reached. Extraction did not complete in time.{Colors.RESET}")
    return None

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    # Make the search query more specific
    serp_results = search_google(f"{company} company pricing website")
    if not serp_results:
        print(f"{Colors.RED}No search results found.{Colors.RESET}")
        return
    
    # Use Gemini 2.0 Flash for URL selection
    selected_urls = select_urls_with_r1(company, objective, serp_results)
    
    if not selected_urls:
        print(f"{Colors.RED}No URLs were selected.{Colors.RESET}")
        return
    
    data = extract_company_info(selected_urls, objective, company, firecrawl_api_key)
    
    if data:
        print(f"{Colors.GREEN}Extraction completed successfully.{Colors.RESET}")
    else:
        print(f"{Colors.RED}Failed to extract the requested information. Try refining your prompt or choosing a different company.{Colors.RESET}")

if __name__ == "__main__":
    main()
