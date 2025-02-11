import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
import google.generativeai as genai

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

# Retrieve API keys from environment variables
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
gemini_api_key = os.getenv("GEMINI_API_KEY")

# Initialize the FirecrawlApp and Gemini client
app = FirecrawlApp(api_key=firecrawl_api_key)
genai.configure(api_key=gemini_api_key)  # Configure Gemini API

def find_relevant_page_via_map(objective, url, app):
    try:
        print(f"{Colors.CYAN}Understood. The objective is: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Initiating search on the website: {url}{Colors.RESET}")
        
        map_prompt = f"""
        Based on the objective of: {objective}, provide a 1-2 word search parameter that will help find the information.
        Respond with ONLY 1-2 words, no other text or formatting.
        """

        print(f"{Colors.YELLOW}Analyzing objective to determine optimal search parameter...{Colors.RESET}")
        model = genai.GenerativeModel('gemini-pro')  # Use gemini-pro instead of gemini-2.0-flash
        response = model.generate_content(map_prompt)

        map_search_parameter = response.text.strip()
        print(f"{Colors.GREEN}Optimal search parameter identified: {map_search_parameter}{Colors.RESET}")

        print(f"{Colors.YELLOW}Mapping website using the identified search parameter...{Colors.RESET}")
        map_website = app.map_url(url, params={"search": map_search_parameter})
        
        print(f"{Colors.MAGENTA}Debug - Map response structure: {json.dumps(map_website, indent=2)}{Colors.RESET}")
        print(f"{Colors.GREEN}Website mapping completed successfully.{Colors.RESET}")
        
        if isinstance(map_website, dict):
            links = map_website.get('urls', []) or map_website.get('links', [])
        elif isinstance(map_website, str):
            try:
                parsed = json.loads(map_website)
                links = parsed.get('urls', []) or parsed.get('links', [])
            except json.JSONDecodeError:
                links = []
        else:
            links = map_website if isinstance(map_website, list) else []

        if not links:
            print(f"{Colors.RED}No links found in map response.{Colors.RESET}")
            return None

        rank_prompt = f"""RESPOND ONLY WITH JSON. 
        Analyze these URLs and rank the top 3 most relevant ones for finding information about: {objective}

        Return ONLY a JSON array in this exact format - no other text or explanation:
        [
            {{
                "url": "http://example.com",
                "relevance_score": 95,
                "reason": "Main about page with company information"
            }},
            {{
                "url": "http://example2.com",
                "relevance_score": 85,
                "reason": "Team page with details"
            }},
            {{
                "url": "http://example3.com",
                "relevance_score": 75,
                "reason": "Blog post about company"
            }}
        ]

        URLs to analyze:
        {json.dumps(links, indent=2)}"""

        print(f"{Colors.YELLOW}Ranking URLs by relevance to objective...{Colors.RESET}")
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(rank_prompt)

        print(f"{Colors.MAGENTA}Debug - Raw Gemini response:{Colors.RESET}")
        print(response.text)
        
        try:
            response_text = response.text.strip()
            print(f"{Colors.MAGENTA}Debug - Cleaned response:{Colors.RESET}")
            print(response_text)
            
            if '[' in response_text and ']' in response_text:
                start_idx = response_text.find('[')
                end_idx = response_text.rfind(']') + 1
                json_str = response_text[start_idx:end_idx]
                
                print(f"{Colors.MAGENTA}Debug - Extracted JSON string:{Colors.RESET}")
                print(json_str)
                
                ranked_results = json.loads(json_str)
            else:
                print(f"{Colors.RED}No JSON array found in response{Colors.RESET}")
                return None

            links = [result["url"] for result in ranked_results]
            
            print(f"{Colors.CYAN}Top 3 ranked URLs:{Colors.RESET}")
            for result in ranked_results:
                print(f"{Colors.GREEN}URL: {result['url']}{Colors.RESET}")
                print(f"{Colors.YELLOW}Relevance Score: {result['relevance_score']}{Colors.RESET}")
                print(f"{Colors.BLUE}Reason: {result['reason']}{Colors.RESET}")
                print("---")

            if not links:
                print(f"{Colors.RED}No relevant links identified.{Colors.RESET}")
                return None

        except json.JSONDecodeError as e:
            print(f"{Colors.RED}Error parsing ranked results: {str(e)}{Colors.RESET}")
            print(f"{Colors.RED}Failed JSON string: {response_text}{Colors.RESET}")
            return None
        except Exception as e:
            print(f"{Colors.RED}Unexpected error: {str(e)}{Colors.RESET}")
            return None
            
        print(f"{Colors.GREEN}Located {len(links)} relevant links.{Colors.RESET}")
        return links
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during relevant page identification: {str(e)}{Colors.RESET}")
        return None

def find_objective_in_top_pages(map_website, objective, app):
    try:
        if not map_website:
            print(f"{Colors.RED}No links found to analyze.{Colors.RESET}")
            return None
            
        top_links = map_website[:3]
        print(f"{Colors.CYAN}Proceeding to analyze top {len(top_links)} links: {top_links}{Colors.RESET}")
        
        for link in top_links:
            print(f"{Colors.YELLOW}Initiating scrape of page: {link}{Colors.RESET}")
            scrape_result = app.scrape_url(link, params={'formats': ['markdown']})
            print(f"{Colors.GREEN}Page scraping completed successfully.{Colors.RESET}")
     
            check_prompt = f"""
            Analyze this content to find: {objective}
            If found, return ONLY a JSON object with information related to the objective. If not found, respond EXACTLY with: Objective not met
            
            Content to analyze: {scrape_result['markdown']}
            
            Remember:
            - Return valid JSON if information is found
            - Return EXACTLY "Objective not met" if not found
            - No other text or explanations
            """
        
            response = genai.GenerativeModel('gemini-pro').generate_content(check_prompt)
            
            result = response.text.strip()
            
            print(f"{Colors.MAGENTA}Debug - Check response:{Colors.RESET}")
            print(result)
            
            if result != "Objective not met":
                print(f"{Colors.GREEN}Objective potentially fulfilled. Relevant information identified.{Colors.RESET}")
                try:
                    if '{' in result and '}' in result:
                        start_idx = result.find('{')
                        end_idx = result.rfind('}') + 1
                        json_str = result[start_idx:end_idx]
                        return json.loads(json_str)
                    else:
                        print(f"{Colors.RED}No JSON object found in response{Colors.RESET}")
                except json.JSONDecodeError:
                    print(f"{Colors.RED}Error in parsing response. Proceeding to next page...{Colors.RESET}")
            else:
                print(f"{Colors.YELLOW}Objective not met on this page. Proceeding to next link...{Colors.RESET}")
        
        print(f"{Colors.RED}All available pages analyzed. Objective not fulfilled in examined content.{Colors.RESET}")
        return None
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during page analysis: {str(e)}{Colors.RESET}")
        return None

def main():
    url = input(f"{Colors.BLUE}Enter the website to crawl : {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")
    
    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    map_website = find_relevant_page_via_map(objective, url, app)
    
    if map_website:
        print(f"{Colors.GREEN}Relevant pages identified. Proceeding with detailed analysis using gemini-pro...{Colors.RESET}")
        result = find_objective_in_top_pages(map_website, objective, app)
        
        if result:
            print(f"{Colors.GREEN}Objective successfully fulfilled. Extracted information:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{json.dumps(result, indent=2)}{Colors.RESET}")
        else:
            print(f"{Colors.RED}Unable to fulfill the objective with the available content.{Colors.RESET}")
    else:
        print(f"{Colors.RED}No relevant pages identified. Consider refining the search parameters or trying a different website.{Colors.RESET}")

if __name__ == "__main__":
    main()