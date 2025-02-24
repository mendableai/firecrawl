import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
import anthropic

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
claude_api_key = os.getenv("ANTHROPIC_API_KEY")

# Initialize the FirecrawlApp and Claude client
app = FirecrawlApp(api_key=firecrawl_api_key)
client = anthropic.Anthropic(api_key=claude_api_key)

# Find the page that most likely contains the objective
def find_relevant_page_via_map(objective, url, app, client):
    try:
        print(f"{Colors.CYAN}Understood. The objective is: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Initiating search on the website: {url}{Colors.RESET}")
        
        map_prompt = f"""
        The map function generates a list of URLs from a website and it accepts a search parameter. Based on the objective of: {objective}, come up with a 1-2 word search parameter that will help us find the information we need. Only respond with 1-2 words nothing else.
        """

        print(f"{Colors.YELLOW}Analyzing objective to determine optimal search parameter...{Colors.RESET}")
        completion = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": map_prompt
                }
            ]
        )

        map_search_parameter = completion.content[0].text
        print(f"{Colors.GREEN}Optimal search parameter identified: {map_search_parameter}{Colors.RESET}")

        print(f"{Colors.YELLOW}Mapping website using the identified search parameter...{Colors.RESET}")
        map_website = app.map_url(url, params={"search": map_search_parameter})
        
        # Debug print to see the response structure
        print(f"{Colors.MAGENTA}Debug - Map response structure: {json.dumps(map_website, indent=2)}{Colors.RESET}")
        
        print(f"{Colors.GREEN}Website mapping completed successfully.{Colors.RESET}")
        
        # Handle the response based on its structure
        if isinstance(map_website, dict):
            # Assuming the links are in a 'urls' or similar key
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

        rank_prompt = f"""
        Given this list of URLs and the objective: {objective}
        Analyze each URL and rank the top 3 most relevant ones that are most likely to contain the information we need.
        Return your response as a JSON array with exactly 3 objects, each containing:
        - "url": the full URL
        - "relevance_score": number between 0-100 indicating relevance to objective
        - "reason": brief explanation of why this URL is relevant

        Example output:
        [
            {{
                "url": "https://example.com/about",
                "relevance_score": 95,
                "reason": "Main about page containing company information"
            }},
            {{
                "url": "https://example.com/team",
                "relevance_score": 80,
                "reason": "Team page with leadership details"
            }},
            {{
                "url": "https://example.com/contact",
                "relevance_score": 70,
                "reason": "Contact page with location information"
            }}
        ]

        URLs to analyze:
        {json.dumps(links, indent=2)}
        """

        print(f"{Colors.YELLOW}Ranking URLs by relevance to objective...{Colors.RESET}")
        completion = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=1000,
            messages=[
                {
                    "role": "user", 
                    "content": rank_prompt
                }
            ]
        )

        # Debug print to see Claude's raw response
        print(f"{Colors.MAGENTA}Debug - Claude's raw response:{Colors.RESET}")
        print(f"{Colors.MAGENTA}{completion.content[0].text}{Colors.RESET}")

        try:
            # Try to clean the response by stripping any potential markdown or extra whitespace
            cleaned_response = completion.content[0].text.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response.split("```json")[1]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response.rsplit("```", 1)[0]
            cleaned_response = cleaned_response.strip()
            
            ranked_results = json.loads(cleaned_response)
            
            # Validate the structure of the results
            if not isinstance(ranked_results, list):
                raise ValueError("Response is not a list")
            
            for result in ranked_results:
                if not all(key in result for key in ["url", "relevance_score", "reason"]):
                    raise ValueError("Response items missing required fields")
            
            links = [result["url"] for result in ranked_results]
            
            # Print detailed ranking info
            print(f"{Colors.CYAN}Top 3 ranked URLs:{Colors.RESET}")
            for result in ranked_results:
                print(f"{Colors.GREEN}URL: {result['url']}{Colors.RESET}")
                print(f"{Colors.YELLOW}Relevance Score: {result['relevance_score']}{Colors.RESET}")
                print(f"{Colors.BLUE}Reason: {result['reason']}{Colors.RESET}")
                print("---")

            if not links:
                print(f"{Colors.RED}No relevant links identified.{Colors.RESET}")
                return None

        except (json.JSONDecodeError, KeyError) as e:
            print(f"{Colors.RED}Error parsing ranked results: {str(e)}{Colors.RESET}")
            return None
            
        print(f"{Colors.GREEN}Located {len(links)} relevant links.{Colors.RESET}")
        return links
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during relevant page identification: {str(e)}{Colors.RESET}")
        return None
    
# Scrape the top 3 pages and see if the objective is met, if so return in json format else return None
def find_objective_in_top_pages(map_website, objective, app, client):
    try:
        # Get top 3 links from the map result
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
            Given the following scraped content and objective, determine if the objective is met.
            If it is, extract the relevant information in a simple and concise JSON format. Use only the necessary fields and avoid nested structures if possible.
            If the objective is not met with confidence, respond with exactly 'Objective not met'.

            Objective: {objective}
            Scraped content: {scrape_result['markdown']}

            Remember:
            1. Only return JSON if you are confident the objective is fully met.
            2. Keep the JSON structure as simple and flat as possible.
            3. If returning JSON, ensure it's valid JSON format without any markdown formatting.
            4. If objective is not met, respond only with 'Objective not met'.
            """
        
            completion = client.messages.create(
                model="claude-3-7-sonnet-20250219",
                max_tokens=1500,
                messages=[{"role": "user", "content": check_prompt}]
            )
            
            result = completion.content[0].text.strip()
            
            # Clean up the response if it contains markdown formatting
            if result.startswith("```json"):
                result = result.split("```json")[1]
            if result.endswith("```"):
                result = result.rsplit("```", 1)[0]
            result = result.strip()
            
            if result == "Objective not met":
                print(f"{Colors.YELLOW}Objective not met on this page. Proceeding to next link...{Colors.RESET}")
                continue
                
            try:
                json_result = json.loads(result)
                print(f"{Colors.GREEN}Objective fulfilled. Relevant information found.{Colors.RESET}")
                return json_result
            except json.JSONDecodeError as e:
                print(f"{Colors.RED}Error parsing JSON response: {str(e)}{Colors.RESET}")
                print(f"{Colors.MAGENTA}Raw response: {result}{Colors.RESET}")
                continue

        print(f"{Colors.RED}All available pages analyzed. Objective not fulfilled in examined content.{Colors.RESET}")
        return None
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during page analysis: {str(e)}{Colors.RESET}")
        return None

# Main function to execute the process
def main():
    # Get user input
    url = input(f"{Colors.BLUE}Enter the website to crawl : {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")
    
    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    # Find the relevant page
    map_website = find_relevant_page_via_map(objective, url, app, client)
    
    if map_website:
        print(f"{Colors.GREEN}Relevant pages identified. Proceeding with detailed analysis using Claude 3.7...{Colors.RESET}")
        # Find objective in top pages
        result = find_objective_in_top_pages(map_website, objective, app, client)
        
        if result:
            print(f"{Colors.GREEN}Objective successfully fulfilled. Extracted information :{Colors.RESET}")
            print(f"{Colors.MAGENTA}{json.dumps(result, indent=2)}{Colors.RESET}")
        else:
            print(f"{Colors.RED}Unable to fulfill the objective with the available content.{Colors.RESET}")
    else:
        print(f"{Colors.RED}No relevant pages identified. Consider refining the search parameters or trying a different website.{Colors.RESET}")

if __name__ == "__main__":
    main()