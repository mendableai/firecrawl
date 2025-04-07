import os
import json
import time
import requests
from dotenv import load_dotenv
from serpapi.google_search import GoogleSearch
from together import Together

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
together_api_key = os.getenv("TOGETHER_API_KEY")
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
serp_api_key = os.getenv("SERP_API_KEY")

if not together_api_key:
    print(f"{Colors.RED}Warning: TOGETHER_API_KEY not found in environment variables{Colors.RESET}")
if not firecrawl_api_key:
    print(f"{Colors.RED}Warning: FIRECRAWL_API_KEY not found in environment variables{Colors.RESET}")

# Initialize Together AI client
together_client = Together(api_key=together_api_key)

def search_google(query):
    """Search Google using SerpAPI and return top results."""
    print(f"{Colors.YELLOW}Searching Google for '{query}'...{Colors.RESET}")
    search = GoogleSearch({"q": query, "api_key": serp_api_key})
    results = search.get_dict().get("organic_results", [])
    print(f"{Colors.CYAN}Found {len(results)} search results{Colors.RESET}")
    return results

def select_urls_with_llama(company, objective, serp_results):
    """
    Use Llama 4 Maverick to select URLs from SERP results.
    Returns a list of URLs.
    """
    try:
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                     for r in serp_results if r.get("link")]
        
        print(f"{Colors.CYAN}Processing {len(serp_data)} valid search results{Colors.RESET}")

        prompt = (
            "You are a URL selection assistant. Your task is to analyze search results and select relevant URLs.\n\n"
            "IMPORTANT: You must respond ONLY with a JSON object containing selected URLs. Do not include any explanation or additional text.\n\n"
            "Instructions:\n"
            "1. Analyze the search results for information about the specified company\n"
            "2. Select URLs that are most likely to contain the requested information\n"
            "3. Return EXACTLY in this format: {\"selected_urls\": [\"url1\", \"url2\"]}\n"
            "4. Do not include social media links\n"
            "5. DO NOT include any explanation or analysis in your response\n"
            "6. ONLY output the JSON object\n\n"
            f"Company: {company}\n"
            f"Information Needed: {objective}\n"
            f"Search Results: {json.dumps(serp_data, indent=2)}\n\n"
            "YOUR RESPONSE MUST BE ONLY THE JSON OBJECT. NO OTHER TEXT."
        )
        
        try:
            print(f"{Colors.YELLOW}Asking Llama to analyze URLs...{Colors.RESET}")
            response = together_client.chat.completions.create(
                model="meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1  # Lower temperature for more focused responses
            )
            cleaned_response = response.choices[0].message.content.strip()
            print(f"{Colors.MAGENTA}Llama response: {cleaned_response}{Colors.RESET}")

            # Clean the response text
            if cleaned_response.startswith('```'):
                cleaned_response = cleaned_response.split('```')[1]
                if cleaned_response.startswith('json'):
                    cleaned_response = cleaned_response[4:]
            cleaned_response = cleaned_response.strip()

            # Try to find JSON object in the response
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}') + 1
            if json_start != -1 and json_end != -1:
                cleaned_response = cleaned_response[json_start:json_end]

            try:
                # Parse JSON response
                result = json.loads(cleaned_response)
                if isinstance(result, dict) and "selected_urls" in result:
                    urls = result["selected_urls"]
                else:
                    print(f"{Colors.YELLOW}Response not in expected format. Falling back to text parsing...{Colors.RESET}")
                    # Fallback to text parsing
                    urls = [line.strip() for line in cleaned_response.split('\n') 
                           if line.strip().startswith(('http://', 'https://'))]
            except json.JSONDecodeError:
                print(f"{Colors.YELLOW}Could not parse JSON response. Falling back to text parsing...{Colors.RESET}")
                # Fallback to text parsing
                urls = [line.strip() for line in cleaned_response.split('\n') 
                       if line.strip().startswith(('http://', 'https://'))]

            # Clean up URLs
            cleaned_urls = [url.replace('/*', '').rstrip('/') for url in urls]
            cleaned_urls = [url for url in cleaned_urls if url]

            if not cleaned_urls:
                print(f"{Colors.YELLOW}No valid URLs found in response.{Colors.RESET}")
                return []

            print(f"{Colors.CYAN}Selected URLs for extraction:{Colors.RESET}")
            for url in cleaned_urls:
                print(f"- {url}")

            return cleaned_urls

        except Exception as e:
            print(f"{Colors.RED}Error with Together AI API call: {str(e)}{Colors.RESET}")
            return []

    except Exception as e:
        print(f"{Colors.RED}Error selecting URLs: {str(e)}{Colors.RESET}")
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

def poll_firecrawl_result(extraction_id, api_key, interval=10, max_attempts=60):
    """Poll Firecrawl API to get the extraction result."""
    url = f"https://api.firecrawl.dev/v1/extract/{extraction_id}"
    headers = {
        'Authorization': f'Bearer {api_key}'
    }

    print(f"{Colors.YELLOW}Waiting for extraction to complete...{Colors.RESET}")
    
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
                if attempt % 6 == 0:  
                    print(f"{Colors.YELLOW}Still processing... (attempt {attempt}/{max_attempts}){Colors.RESET}")
                time.sleep(interval)
            else:
                print(f"{Colors.RED}API Error: {data.get('error', 'No error message provided')}{Colors.RESET}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"{Colors.RED}Request error: {str(e)}{Colors.RESET}")
            return None
        except json.JSONDecodeError as e:
            print(f"{Colors.RED}JSON parsing error: {str(e)}{Colors.RESET}")
            return None
        except Exception as e:
            print(f"{Colors.RED}Unexpected error: {str(e)}{Colors.RESET}")
            return None

    print(f"{Colors.RED}Max polling attempts reached. Extraction did not complete in time.{Colors.RESET}")
    return None

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    serp_results = search_google(f"{company}")
    if not serp_results:
        print(f"{Colors.RED}No search results found.{Colors.RESET}")
        return
    
    selected_urls = select_urls_with_llama(company, objective, serp_results)
    
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