import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI
import re

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
openai_api_key = os.getenv("OPENAI_API_KEY")

# Initialize the OpenAI client
client = OpenAI(api_key=openai_api_key)

# Step 1: Get objective and URL
def get_objective_and_url():
    url = input(f"{Colors.BLUE}Enter the website to crawl: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")
    return objective, url

# Function to get top N pages from a URL using Firecrawl Map API
def get_top_pages(url, search_term, num_pages=3):
    try:
        print(f"{Colors.YELLOW}Mapping website using the Firecrawl Map API...{Colors.RESET}")
        api_url = "https://api.firecrawl.dev/v1/map"
        payload = {
            "url": url,
            "search": search_term,
        }
        headers = {
            "Authorization": f"Bearer {firecrawl_api_key}",
            "Content-Type": "application/json"
        }
        response = requests.post(api_url, json=payload, headers=headers)
        if response.status_code == 200:
            map_result = response.json()
           
            if map_result.get('success'):
                links = map_result.get('links', [])
                top_pages = links[:num_pages]
                print(f"{Colors.GREEN}Found {len(links)} links. Using top {num_pages} pages.{Colors.RESET}")
                for i, page in enumerate(top_pages, 1):
                    print(f"{Colors.CYAN}URL {i}: {page}{Colors.RESET}")
                return top_pages
            else:
                print(f"{Colors.RED}Error: Map API request was not successful{Colors.RESET}")
                return []
        else:
            print(f"{Colors.RED}Error: Received status code {response.status_code} from Map API{Colors.RESET}")
            return []
    except Exception as e:
        print(f"{Colors.RED}Error encountered during mapping: {str(e)}{Colors.RESET}")
        return []

# Step 2: Visit a page and get HTML
def visit_page_and_get_html(url, actions):
    try:
        if actions:
            print(f"{Colors.YELLOW}Scraping page: {url} with actions:{Colors.RESET}")
            for action in actions:
                print(f"  - {action}")
        else:
            print(f"{Colors.YELLOW}Scraping page: {url}{Colors.RESET}")
        
        payload = {
            "url": url,
            "formats": ["html"],
            "actions": actions
        }
        headers = {
            "Authorization": f"Bearer {firecrawl_api_key}",
            "Content-Type": "application/json"
        }

        response = requests.post("https://api.firecrawl.dev/v1/scrape", json=payload, headers=headers)
        
        if response.status_code == 200:
            scrape_result = response.json()   
            html_content = scrape_result["data"]["html"]
            if len(actions) > 0:
                print("html_content: ", scrape_result)
            print(f"{Colors.GREEN}Page scraping completed successfully.{Colors.RESET}")
            
            return html_content
        else:
            print(f"{Colors.RED}Error: Received status code {response.status_code}{Colors.RESET}")
            return None
    except Exception as e:
        print(f"{Colors.RED}Error encountered during page scraping: {str(e)}{Colors.RESET}")
        return None

# Step 3: Process the page to fulfill the objective or decide next action
def process_page(html_content, objective):
    try:
        process_prompt = f"""
You are an AI assistant helping to achieve the following objective: '{objective}'.
Given the HTML content of a web page, determine if the objective is met.

Instructions:
1. If the objective is met, respond in JSON format as follows:
{{
  "status": "Objective met",
  "data": {{ ... extracted information ... }}
}}

2. If the objective is not met, analyze the HTML content to decide the best next action to get closer to the objective. Provide the action(s) needed to navigate to the next page or interact with the page. Respond in JSON format as follows:
{{
  "status": "Objective not met",
  "actions": [{{ ... actions to perform ... }}]
}}

3. The actions should be in the format accepted by the 'actions' parameter of the 'scrape_url' function in Firecrawl. Available actions include:
   - {{"type": "wait", "milliseconds": <number>}}
     Example: {{"type": "wait", "milliseconds": 2000}}
   - {{"type": "click", "selector": "<CSS selector>"}}
     Example: {{"type": "click", "selector": "#load-more-button"}}
   - {{"type": "write", "text": "<text to write>", "selector": "<CSS selector>"}}
     Example: {{"type": "write", "text": "Hello, world!", "selector": "#search-input"}}
   - {{"type": "press", "key": "<key to press>"}}
     Example: {{"type": "press", "key": "Enter"}}
   - {{"type": "scroll", "direction": "<up or down>", "amount": <number>}}
     Example: {{"type": "scroll", "direction": "down", "amount": 500}}

4. Do not include any explanations or additional text outside of the JSON response.

HTML Content:
{html_content[:20000]}
"""

        completion = client.chat.completions.create(
            model="o1-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": process_prompt
                        }
                    ]
                }
            ]
        )

        response = completion.choices[0].message.content.strip()

        # Remove any JSON code blocks from the response
        response = re.sub(r'```json\s*(.*?)\s*```', r'\1', response, flags=re.DOTALL)
        
        # Parse the response as JSON
        try:
            result = json.loads(response)
            status = result.get('status')
            if status == 'Objective met':
                data = result.get('data')
                return {'result': data}
            elif status == 'Objective not met':
                actions = result.get('actions')
                return {'actions': actions}
            else:
                print(f"{Colors.RED}Unexpected status in response: {status}{Colors.RESET}")
                return {}
        except json.JSONDecodeError:
            print(f"{Colors.RED}Error parsing assistant's response as JSON.{Colors.RESET}")
            print(f"{Colors.RED}Response was: {response}{Colors.RESET}")
            return {}
    except Exception as e:
        print(f"{Colors.RED}Error encountered during processing of the page: {str(e)}{Colors.RESET}")
        return {}

# Function to determine search term based on the objective
def determine_search_term(objective):
    try:
        prompt = f"""
Based on the following objective: '{objective}', provide a 1-2 word search term that would help find relevant pages on the website. Only respond with the search term and nothing else.
"""
        completion = client.chat.completions.create(
            model="o1-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        )
        search_term = completion.choices[0].message.content.strip()
        print(f"{Colors.GREEN}Determined search term: {search_term}{Colors.RESET}")
        return search_term
    except Exception as e:
        print(f"{Colors.RED}Error determining search term: {str(e)}{Colors.RESET}")
        return ""

# Main function
def main():
    objective, url = get_objective_and_url()

    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")

    # Determine search term based on objective
    search_term = determine_search_term(objective)
    if not search_term:
        print(f"{Colors.RED}Could not determine a search term based on the objective.{Colors.RESET}")
        return

    # Get the top 3 pages using Firecrawl Map API
    top_pages = get_top_pages(url, search_term, num_pages=3)
    if not top_pages:
        print(f"{Colors.RED}No pages found to process.{Colors.RESET}")
        return

    for page_url in top_pages:
        print(f"{Colors.CYAN}Processing page: {page_url}{Colors.RESET}")

        # Step 2: Visit page and get HTML
        html_content = visit_page_and_get_html(page_url, actions=[])
        if not html_content:
            print(f"{Colors.RED}Failed to retrieve content from {page_url}{Colors.RESET}")
            continue

        # Step 3: Process HTML and objective
        action_result = process_page(html_content, objective)
        if action_result.get('result'):
            print(f"{Colors.GREEN}Objective met. Extracted information:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{json.dumps(action_result['result'], indent=2)}{Colors.RESET}")
            return
        elif action_result.get('actions'):
            print(f"{Colors.YELLOW}Objective not met yet. Suggested actions:{Colors.RESET}")
            for action in action_result['actions']:
                print(f"{Colors.MAGENTA}- {action}{Colors.RESET}")
            actions = action_result['actions']
            # Visit the page again with the actions
            html_content = visit_page_and_get_html(page_url, actions)
            if not html_content:
                print(f"{Colors.RED}Failed to retrieve content from {page_url} with actions{Colors.RESET}")
                continue
            # Process the new HTML
            action_result = process_page(html_content, objective)
            if action_result.get('result'):
                print(f"{Colors.GREEN}Objective met after performing actions. Extracted information:{Colors.RESET}")
                print(f"{Colors.MAGENTA}{json.dumps(action_result['result'], indent=2)}{Colors.RESET}")
                return
            else:
                print(f"{Colors.RED}Objective still not met after performing actions on {page_url}{Colors.RESET}")
                continue
        else:
            print(f"{Colors.RED}No actions suggested. Unable to proceed with {page_url}.{Colors.RESET}")
            continue

    # If we reach here, the objective was not met on any of the pages
    print(f"{Colors.RED}Objective not fulfilled after processing top 3 pages.{Colors.RESET}")

if __name__ == "__main__":
    main()
