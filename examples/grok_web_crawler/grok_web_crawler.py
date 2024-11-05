import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
import requests

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
grok_api_key = os.getenv("GROK_API_KEY")

# Initialize the FirecrawlApp
app = FirecrawlApp(api_key=firecrawl_api_key)

# Function to make Grok API calls
def grok_completion(prompt):
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {grok_api_key}"
    }
    data = {
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "model": "grok-beta",
        "stream": False,
        "temperature": 0
    }
    response = requests.post(url, headers=headers, json=data)
    return response.json()['choices'][0]['message']['content']

# Find the page that most likely contains the objective
def find_relevant_page_via_map(objective, url, app):
    try:
        print(f"{Colors.CYAN}Understood. The objective is: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Initiating search on the website: {url}{Colors.RESET}")
        
        map_prompt = f"""
        The map function generates a list of URLs from a website and it accepts a search parameter. Based on the objective of: {objective}, come up with a 1-2 word search parameter that will help us find the information we need. Only respond with 1-2 words nothing else.
        """

        print(f"{Colors.YELLOW}Analyzing objective to determine optimal search parameter...{Colors.RESET}")
        map_search_parameter = grok_completion(map_prompt)
        print(f"{Colors.GREEN}Optimal search parameter identified: {map_search_parameter}{Colors.RESET}")

        print(f"{Colors.YELLOW}Mapping website using the identified search parameter...{Colors.RESET}")
        print(f"{Colors.MAGENTA}{map_search_parameter}{Colors.RESET}")
        map_website = app.map_url(url, params={"search": map_search_parameter})
        print(f"{Colors.GREEN}Website mapping completed successfully.{Colors.RESET}")
        print(f"{Colors.GREEN}Located {len(map_website['links'])} relevant links.{Colors.RESET}")
        print(f"{Colors.MAGENTA}{map_website}{Colors.RESET}")
        return map_website["links"]
    except Exception as e:
        print(f"{Colors.RED}Error encountered during relevant page identification: {str(e)}{Colors.RESET}")
        return None
    
# Scrape the top 3 pages and see if the objective is met, if so return in json format else return None
def find_objective_in_top_pages(map_website, objective, app):
    try:
        print(f"{Colors.MAGENTA}{map_website}{Colors.RESET}")
        # Get top 3 links from the map result
        top_links = map_website[:3] if isinstance(map_website, list) else []
        print(f"{Colors.CYAN}Proceeding to analyze top {len(top_links)} links: {top_links}{Colors.RESET}")
        
        for link in top_links:
            print(f"{Colors.YELLOW}Initiating scrape of page: {link}{Colors.RESET}")
            # Scrape the page
            scrape_result = app.scrape_url(link, params={'formats': ['markdown']})
            print(f"{Colors.GREEN}Page scraping completed successfully.{Colors.RESET}")
     
            
            # Check if objective is met
            check_prompt = f"""
            Given the following scraped content and objective, determine if the objective is met.
            If it is, extract the relevant information in a simple and concise JSON format. Use only the necessary fields and avoid nested structures if possible.
            If the objective is not met with confidence, respond with 'Objective not met'.

            Objective: {objective}
            Scraped content: {scrape_result['markdown']}

            Remember:
            1. Only return JSON if you are confident the objective is fully met.
            2. Keep the JSON structure as simple and flat as possible.
            3. Do not include any explanations or markdown formatting in your response.
            """
        
            result = grok_completion(check_prompt)
            print(f"{Colors.MAGENTA}{result}{Colors.RESET}")
            if result != "Objective not met":
                print(f"{Colors.GREEN}Objective potentially fulfilled. Relevant information identified.{Colors.RESET}")
                try:
                    result = result.replace("```json", "").replace("```", "")
                    return json.loads(result)
                except json.JSONDecodeError:
                    print(f"{Colors.RED}Error in parsing response. Proceeding to next page...{Colors.RESET}")
            else:
                print(f"{Colors.YELLOW}Objective not met on this page. Proceeding to next link...{Colors.RESET}")
        
        print(f"{Colors.RED}All available pages analyzed. Objective not fulfilled in examined content.{Colors.RESET}")
        return None
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during page analysis: {str(e)}{Colors.RESET}")
        return None

# Main function to execute the process
def main():
    # Get user input
    url = input(f"{Colors.BLUE}Enter the website to crawl: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")
    
    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    # Find the relevant page
    map_website = find_relevant_page_via_map(objective, url, app)
    
    if map_website:
        print(f"{Colors.GREEN}Relevant pages identified. Proceeding with detailed analysis...{Colors.RESET}")
        # Find objective in top pages
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
