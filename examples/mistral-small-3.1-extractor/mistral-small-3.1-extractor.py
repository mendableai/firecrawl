import os
import json
import time
import requests
from dotenv import load_dotenv
from serpapi.google_search import GoogleSearch
from mistralai import Mistral

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
mistral_client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
serp_api_key = os.getenv("SERP_API_KEY")


if not firecrawl_api_key:
    print(f"{Colors.RED}Warning: FIRECRAWL_API_KEY not found in environment variables{Colors.RESET}")

if not os.getenv("MISTRAL_API_KEY"):
    print(f"{Colors.RED}Warning: MISTRAL_API_KEY not found in environment variables{Colors.RESET}")

def search_google(query):
    """Search Google using SerpAPI and return top results."""
    print(f"{Colors.YELLOW}Searching Google for '{query}'...{Colors.RESET}")
    search = GoogleSearch({"q": query, "api_key": serp_api_key})
    return search.get_dict().get("organic_results", [])

def select_urls_with_mistral(company, objective, serp_results):
    """
    Use Mistral Small 3.1 to select URLs from SERP results with enhanced criteria.
    Returns a list of URLs with confidence scores and justifications.
    """
    try:
        serp_data = [{"title": r.get("title"), "link": r.get("link"), "snippet": r.get("snippet")} 
                     for r in serp_results if r.get("link")]

        prompt = (
            "Task: Select the MOST RELIABLE and RELEVANT URLs that contain VERIFIABLE information about the specified company.\n\n"
            "Instructions:\n"
            "1. Analyze the search results for information SPECIFICALLY about the requested objective\n"
            "2. Select ONLY official and highly reliable URLs that DIRECTLY address the requested information\n"
            "3. Prioritize in this exact order:\n"
            "   a. The company's official website sections that specifically address the requested information\n"
            "   b. Official company documents (annual reports, SEC filings, press releases) that contain verifiable data\n"
            "   c. Government databases or regulatory filings that contain verified information\n"
            "   d. Trusted industry databases with cited sources (e.g., Bloomberg, Reuters, industry associations)\n"
            "4. EXCLUDE any sources that:\n"
            "   a. Contain primarily opinions or analysis rather than facts\n"
            "   b. Are outdated (older than 1 year unless historical information is requested)\n"
            "   c. Are from general news sites without specific expertise in the topic\n"
            "   d. Do not cite their sources or methodology\n"
            "   e. Are social media links or user-generated content\n"
            "5. For each URL selected, provide a confidence score (1-10) and brief justification\n"
            "6. Limit selection to 3-5 of the MOST RELIABLE and RELEVANT sources only\n"
            "7. Return a JSON object with the following structure: {\"selected_urls\": [{\"url\": \"url1\", \"confidence\": 9, \"justification\": \"Official company annual report with audited figures\"}]}\n\n"
            f"Company: {company}\n"
            f"Information Needed: {objective}\n"
            f"Search Results: {json.dumps(serp_data, indent=2)}\n\n"
            "Response Format: {\"selected_urls\": [{\"url\": \"https://example.com\", \"confidence\": 9, \"justification\": \"Reason this is reliable\"}]}"
        )

        response = mistral_client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Clean the response text
        cleaned_response = response.choices[0].message.content.strip()
        if cleaned_response.startswith('```'):
            cleaned_response = cleaned_response.split('```')[1]
            if cleaned_response.startswith('json'):
                cleaned_response = cleaned_response[4:]
        cleaned_response = cleaned_response.strip()

        try:
            # Parse JSON response
            result = json.loads(cleaned_response)
            if isinstance(result, dict) and "selected_urls" in result:
                url_data = result["selected_urls"]
                # Extract just the URLs for compatibility with existing code
                urls = [item["url"] for item in url_data if "url" in item]
                
                # Print detailed information about selected URLs
                print(f"{Colors.CYAN}Selected URLs with confidence scores:{Colors.RESET}")
                for item in url_data:
                    if "url" in item and "confidence" in item and "justification" in item:
                        print(f"- {item['url']} (Confidence: {item['confidence']}/10)")
                        print(f"  Justification: {item['justification']}")
            else:
                # Fallback to text parsing
                urls = [line.strip() for line in cleaned_response.split('\n') 
                       if line.strip().startswith(('http://', 'https://'))]
        except json.JSONDecodeError:
            # Fallback to text parsing
            urls = [line.strip() for line in cleaned_response.split('\n') 
                   if line.strip().startswith(('http://', 'https://'))]

        # Clean up URLs
        cleaned_urls = [url.replace('/*', '').rstrip('/') for url in urls]
        cleaned_urls = [url for url in cleaned_urls if url]

        # Limit to top 5 URLs to ensure quality over quantity
        cleaned_urls = cleaned_urls[:5]

        if not cleaned_urls:
            print(f"{Colors.YELLOW}No valid URLs found in response.{Colors.RESET}")
            return []

        # Return the URLs for cross-verification
        return cleaned_urls

    except Exception as e:
        print(f"{Colors.RED}Error selecting URLs: {str(e)}{Colors.RESET}")
        return []

def cross_verify_sources(urls, company, objective):
    """Use Mistral to cross-verify information across selected sources."""
    
    print(f"{Colors.YELLOW}Cross-verifying selected sources...{Colors.RESET}")
    
    verification_prompt = (
        f"Task: Evaluate the reliability and consistency of these sources for information about {company}.\n\n"
        f"Objective: {objective}\n\n"
        f"URLs to evaluate: {json.dumps(urls)}\n\n"
        "Instructions:\n"
        "1. For each URL, identify what makes it reliable or unreliable for the specific objective\n"
        "2. Assess whether these sources are likely to provide consistent or contradictory information\n"
        "3. Identify any potential biases in these sources (e.g., company's own website may present favorable information)\n"
        "4. Recommend the final set of URLs that, when used together, will provide the most accurate and complete information\n"
        "5. IMPORTANT: Only include URLs that are DIRECTLY relevant to the specific objective\n"
        "6. Exclude any URLs that contain primarily general information about the company not related to the objective\n"
        "7. Return a JSON object with: {\"verified_urls\": [\"url1\", \"url2\"], \"verification_notes\": \"explanation\"}\n"
    )
    
    try:
        response = mistral_client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {"role": "user", "content": verification_prompt}
            ]
        )
        
        # Clean the response text
        cleaned_response = response.choices[0].message.content.strip()
        if cleaned_response.startswith('```'):
            cleaned_response = cleaned_response.split('```')[1]
            if cleaned_response.startswith('json'):
                cleaned_response = cleaned_response[4:]
        cleaned_response = cleaned_response.strip()
        
        try:
            # Parse JSON response
            result = json.loads(cleaned_response)
            if isinstance(result, dict) and "verified_urls" in result:
                verified_urls = result["verified_urls"]
                verification_notes = result.get("verification_notes", "")
                
                print(f"{Colors.CYAN}Cross-verification complete:{Colors.RESET}")
                print(f"{Colors.CYAN}Notes: {verification_notes}{Colors.RESET}")
                print(f"{Colors.CYAN}Final verified URLs:{Colors.RESET}")
                for url in verified_urls:
                    print(f"- {url}")
                
                return verified_urls
            else:
                # If JSON parsing fails, return original URLs
                print(f"{Colors.YELLOW}Could not parse cross-verification result. Using original URLs.{Colors.RESET}")
                return urls
        except json.JSONDecodeError:
            # If JSON parsing fails, return original URLs
            print(f"{Colors.YELLOW}Could not parse cross-verification result. Using original URLs.{Colors.RESET}")
            return urls
            
    except Exception as e:
        print(f"{Colors.RED}Error during cross-verification: {str(e)}{Colors.RESET}")
        return urls  # Return original URLs if cross-verification fails

def extract_company_info(urls, prompt, company, api_key):
    """Use requests to call Firecrawl's extract endpoint with selected URLs."""
    print(f"{Colors.YELLOW}Extracting structured data from the provided URLs using Firecrawl...{Colors.RESET}")
    
    # Enhanced prompt for better data quality
    enhanced_prompt = (
        f"Extract accurate and verified information about {company}. "
        f"Specifically focus on: {prompt}. "
        f"IMPORTANT INSTRUCTIONS:\n"
        f"1. Only include information that is EXPLICITLY stated in the source material\n"
        f"2. Do NOT include any speculative information\n"
        f"3. If information conflicts between sources, prioritize information from the company's official website\n"
        f"4. For each piece of information, cite the specific source URL\n"
        f"5. Assign a confidence score (1-10) to each piece of information based on source reliability\n"
        f"6. ONLY include information that is DIRECTLY relevant to the specific request\n"
        f"7. EXCLUDE any tangential or general information about the company not related to the specific request\n"
        f"8. Format the response as a structured JSON with clear categories related to the request\n"
        f"9. For each data point, include both the information and its source in this format: {{\"value\": \"information\", \"source\": \"url\", \"confidence\": 8}}\n"
        f"10. If multiple sources confirm the same information, cite all sources and increase the confidence score\n"
        f"11. If you cannot find specific information requested, explicitly state that it was not found in the sources rather than providing general information"
    )
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    
    payload = {
        "urls": urls,
        "prompt": enhanced_prompt,
        "enableWebSearch": False  # Changed to False to rely only on verified URLs
    }
    
    try:
        # Print the payload for debugging
        print(f"{Colors.YELLOW}Request payload:{Colors.RESET}")
        print(json.dumps(payload, indent=2))
        
        response = requests.post(
            "https://api.firecrawl.dev/v1/extract",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        # Print detailed response for debugging
        print(f"{Colors.YELLOW}Response status code: {response.status_code}{Colors.RESET}")
        print(f"{Colors.YELLOW}Response headers: {response.headers}{Colors.RESET}")
        
        data = response.json()
        print(f"{Colors.YELLOW}Response body:{Colors.RESET}")
        print(json.dumps(data, indent=2))
        
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

def poll_firecrawl_result(extraction_id, api_key, interval=5, max_attempts=60):
    """Poll Firecrawl API to get the extraction result."""
    url = f"https://api.firecrawl.dev/v1/extract/{extraction_id}"
    headers = {
        'Authorization': f'Bearer {api_key}'
    }

    print(f"{Colors.YELLOW}Waiting for extraction to complete...{Colors.RESET}")
    
    # Show a simple progress indicator instead of "still processing" messages
    print(f"{Colors.YELLOW}[", end="", flush=True)
    
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()

            if data.get('success') and data.get('data'):
                print(f"]{Colors.RESET}")  # Close the progress indicator
                print(f"{Colors.GREEN}Data successfully extracted:{Colors.RESET}")
                
                # Validate and clean the extracted data
                validated_data = validate_extracted_data(data['data'])
                print(json.dumps(validated_data, indent=2))
                return validated_data
            elif data.get('success') and not data.get('data'):
                # Show a simple progress indicator
                print(f"{Colors.YELLOW}.", end="", flush=True)
                time.sleep(interval)
            else:
                print(f"]{Colors.RESET}")  # Close the progress indicator
                print(f"{Colors.RED}API Error: {data.get('error', 'No error message provided')}{Colors.RESET}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"]{Colors.RESET}")  # Close the progress indicator
            print(f"{Colors.RED}Request error: {str(e)}{Colors.RESET}")
            return None
        except json.JSONDecodeError as e:
            print(f"]{Colors.RESET}")  # Close the progress indicator
            print(f"{Colors.RED}JSON parsing error: {str(e)}{Colors.RESET}")
            return None
        except Exception as e:
            print(f"]{Colors.RESET}")  # Close the progress indicator
            print(f"{Colors.RED}Unexpected error: {str(e)}{Colors.RESET}")
            return None

    print(f"]{Colors.RESET}")  # Close the progress indicator
    print(f"{Colors.RED}Max polling attempts reached. Extraction did not complete in time.{Colors.RESET}")
    return None

def validate_extracted_data(data):
    """Validate and clean the extracted data to reduce misinformation."""
    if not data or not isinstance(data, dict):
        return data
    
    # Look for confidence scores or source information if available
    validated_data = {}
    
    for key, value in data.items():
        # Skip entries that indicate uncertainty
        if isinstance(value, str) and any(term in value.lower() for term in ["unknown", "unclear", "not specified", "not found", "couldn't find"]):
            continue
            
        # Keep entries with clear information
        validated_data[key] = value
    
    return validated_data

def main():
    company = input(f"{Colors.BLUE}Enter the company name: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter what information you want about the company: {Colors.RESET}")
    
    # Add more specific search terms for better results
    search_query = f"{company} {objective}"
    # print(f"{Colors.YELLOW}Searching Google for '{search_query}'...{Colors.RESET}")
    serp_results = search_google(search_query)
    
    if not serp_results:
        # Fallback to just company name
        print(f"{Colors.YELLOW}No results found. Trying broader search...{Colors.RESET}")
        serp_results = search_google(company)
        
    if not serp_results:
        print(f"{Colors.RED}No search results found.{Colors.RESET}")
        return
    
    # Select URLs with Mistral
    selected_urls = select_urls_with_mistral(company, objective, serp_results)
    
    if not selected_urls:
        print(f"{Colors.RED}No URLs were selected.{Colors.RESET}")
        return
    
    # Cross-verify the selected sources
    verified_urls = cross_verify_sources(selected_urls, company, objective)
    
    if not verified_urls:
        print(f"{Colors.YELLOW}No URLs were verified. Using original selected URLs.{Colors.RESET}")
        verified_urls = selected_urls
    
    data = extract_company_info(verified_urls, objective, company, firecrawl_api_key)
    
    if data:
        print(f"{Colors.GREEN}Extraction completed successfully.{Colors.RESET}")
    else:
        print(f"{Colors.RED}Failed to extract the requested information. Try refining your prompt or choosing a different company.{Colors.RESET}")

if __name__ == "__main__":
    main()