import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
from openai import OpenAI

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
openrouter_api_key = os.getenv("OPENROUTER_API_KEY")

# Initialize the FirecrawlApp and OpenRouter client
app = FirecrawlApp(api_key=firecrawl_api_key)
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=openrouter_api_key
)

def main():
    try:
        # Test the model availability first
        test_response = client.chat.completions.create(
            model="deepseek/deepseek-chat-v3-0324:free",
            messages=[{"role": "user", "content": "test"}]
        )
    except Exception as e:
        print(f"{Colors.RED}Error: Could not connect to the language model. Please try again later.{Colors.RESET}")
        print(f"{Colors.RED}Details: {str(e)}{Colors.RESET}")
        return

    url = input(f"{Colors.BLUE}Enter the website to crawl: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")
    
    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    
    relevant_pages = find_relevant_page_via_map(objective, url, app, client)
    
    if not relevant_pages:
        print(f"{Colors.RED}No relevant pages found. Exiting...{Colors.RESET}")
        return
    
    result = find_objective_in_top_pages(relevant_pages, objective, app, client)
    
    if result:
        print(f"{Colors.GREEN}Objective successfully found! Extracted information:{Colors.RESET}")
        print(json.dumps(result, indent=2))
    else:
        print(f"{Colors.RED}Objective could not be fulfilled.{Colors.RESET}")

def find_relevant_page_via_map(objective, url, app, client):
    try:
        print(f"{Colors.CYAN}Understood. Objective: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Searching website: {url}{Colors.RESET}")
        
        map_prompt = f"""
        The map function generates a list of URLs from a website and it accepts a search parameter. Based on the objective of: {objective}, come up with a 1-2 word search parameter that will help us find the information we need. Only respond with 1-2 words nothing else.
        """

       
        response = client.chat.completions.create(
            model="deepseek/deepseek-chat-v3-0324:free",
            messages=[{"role": "user", "content": map_prompt}]
        )
        map_search_parameter = response.choices[0].message.content.strip()

        print(f"{Colors.GREEN}Optimal search parameter identified: {map_search_parameter}{Colors.RESET}")

        map_website = app.map_url(url, params={"search": map_search_parameter})
        print(f"{Colors.GREEN}Website mapping completed successfully.{Colors.RESET}")
        
        links = map_website.get('urls', []) or map_website.get('links', [])
        
        if not links:
            print(f"{Colors.RED}No links found in map response.{Colors.RESET}")
            return None

        return links
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered: {str(e)}{Colors.RESET}")
        return None

def find_objective_in_top_pages(pages, objective, app, client):
    try:
        for link in pages[:3]:
            print(f"{Colors.YELLOW}Scraping page: {link}{Colors.RESET}")
            scrape_result = app.scrape_url(link, params={'formats': ['markdown']})
            
            check_prompt = f"""
            Given the following scraped content and objective, determine if the objective is met.
            If it is, extract the relevant information in a simple JSON format. 
            If the objective is not met, respond with exactly 'Objective not met'.

            The JSON format should be:
            {{
                "found": true,
                "data": {{
                    // extracted information here
                }}
            }}

            Important: Do not wrap the JSON in markdown code blocks. Just return the raw JSON.

            Objective: {objective}
            Scraped content: {scrape_result['markdown']}
            """
        
            # Using OpenRouter's API to analyze the content
            response = client.chat.completions.create(
                model="deepseek/deepseek-chat-v3-0324:free",
                messages=[{
                    "role": "system",
                    "content": "You are a helpful assistant that extracts information from web pages. Always respond in valid JSON format when information is found. Do not wrap the JSON in markdown code blocks."
                }, {
                    "role": "user",
                    "content": check_prompt
                }]
            )
            result = response.choices[0].message.content.strip()
            
            print(f"{Colors.CYAN}Model response: {result}{Colors.RESET}")  # Debug output
            
            if result == "Objective not met":
                print(f"{Colors.YELLOW}Objective not met in this page, continuing search...{Colors.RESET}")
                continue
            
            try:
                # Clean up the response if it's wrapped in code blocks
                if result.startswith('```'):
                    result = result.split('```')[1]
                    if result.startswith('json'):
                        result = result[4:]
                result = result.strip()
                
                parsed_result = json.loads(result)
                if isinstance(parsed_result, dict) and parsed_result.get('found'):
                    return parsed_result.get('data')
                else:
                    print(f"{Colors.YELLOW}Invalid response format, continuing search...{Colors.RESET}")
            except json.JSONDecodeError as e:
                print(f"{Colors.RED}Error parsing JSON response: {str(e)}{Colors.RESET}")
                print(f"{Colors.RED}Raw response: {result}{Colors.RESET}")
                continue
        
        return None
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered: {str(e)}{Colors.RESET}")
        return None

if __name__ == "__main__":
    main()