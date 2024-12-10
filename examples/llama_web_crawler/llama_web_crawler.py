import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
from together import Together
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

together_api_key = os.getenv("TOGETHER_API_KEY")

# Initialize the FirecrawlApp and OpenAI client
app = FirecrawlApp(api_key=firecrawl_api_key)
client = Together(api_key=together_api_key)




# Find the page that most likely contains the objective
def find_relevant_page_via_optimization(objective, url, client):
    try:
        print(f"{Colors.CYAN}Understood. The objective is: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Initiating search on the website: {url}{Colors.RESET}")
        
        optimization_prompt = f"""
        Based on the objective of {objective} on the website {url}, refine the objective to be more specific and actionable in one sentence. Provide a concise and clear version of the objective. Only respond with the refined objective sentence and nothing else. Dont include the website url in the objective. It must be 5 words maximum.
        """

        print(f"{Colors.YELLOW}Optimizing objective for specificity...{Colors.RESET}")
        completion = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[
                {
                    "role": "user",
                    "content": optimization_prompt 
                }
            ]
        )

        optimized_objective = completion.choices[0].message.content
        print(f"{Colors.GREEN}Optimized objective identified: {optimized_objective}{Colors.RESET}")

        # Assuming further steps would involve using the optimized objective
        # to perform specific actions or searches on the website.
        return optimized_objective
    except Exception as e:
        print(f"{Colors.RED}Error encountered during objective optimization: {str(e)}{Colors.RESET}")
        return None
# Scrape the page and see if the objective is met, if so return in json format else return None
def find_objective_in_page(url, objective, app, client):
    try:
        # Append '/*' to the entered URL if there is no slash at the end, otherwise append '*'
        target_url = url 

        print(f"{Colors.CYAN}Proceeding to analyze the URL: {target_url}{Colors.RESET}")
        
        # Prepare the request payload
        payload = {
            "urls": [target_url],
            "prompt": f"Extract information related to the objective: {objective}"
        }
        
        # Make the POST request to the Firecrawl extract API
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {app.api_key}'
        }
        
        response = requests.post("https://api.firecrawl.dev/v1/extract", headers=headers, json=payload)
        
        if response.status_code == 200:
            result = response.json()
            if result:
                print(f"{Colors.GREEN}Objective potentially fulfilled. Relevant information identified.{Colors.RESET}")
                return result
            else:
                print(f"{Colors.YELLOW}Objective not met on this page. Proceeding to next steps...{Colors.RESET}")
        else:
            print(f"{Colors.RED}Error in API response: {response.status_code} - {response.text}{Colors.RESET}")
        
        print(f"{Colors.RED}Page analyzed. Objective not fulfilled in examined content.{Colors.RESET}")
        return None
    
    except Exception as e:
        print(f"{Colors.RED}Error encountered during page analysis: {str(e)}{Colors.RESET}")
        return None

# Main function to execute the process
def main():
    # Get user input
    url = input(f"{Colors.BLUE}Enter the website to crawl: {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}").strip()
    
    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    optimized_objective = find_relevant_page_via_optimization(objective, url, client).strip()
    
    
    # Find objective in the page
    result = find_objective_in_page(url, optimized_objective, app, client)
    if result:
        print(f"{Colors.GREEN}Objective successfully fulfilled. Extracted information:{Colors.RESET}")
        print(f"{Colors.MAGENTA}{json.dumps(result, indent=2)}{Colors.RESET}")
    else:
        print(f"{Colors.RED}Unable to fulfill the objective with the available content.{Colors.RESET}")

if __name__ == "__main__":
    main()
