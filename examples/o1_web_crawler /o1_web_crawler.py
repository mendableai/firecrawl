import os
from firecrawl import FirecrawlApp
import json
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

# Retrieve API keys from environment variables
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")

# Initialize the FirecrawlApp and OpenAI client
app = FirecrawlApp(api_key=firecrawl_api_key)
client = OpenAI(api_key=openai_api_key)

# Find the page that most likely contains the objective
def find_relevant_page_via_map(objective, url, app, client):
    try:
        print(f"Understood. The objective is: {objective}")
        print(f"Initiating search on the website: {url}")
        
        map_prompt = f"""
        The map function generates a list of URLs from a website and it accepts a search parameter. Based on the objective of: {objective}, come up with a 1-2 word search parameter that will help us find the information we need. Only respond with 1-2 words nothing else.
        """

        print("Analyzing objective to determine optimal search parameter...")
        completion = client.chat.completions.create(
            model="o1-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": map_prompt
                        }
                    ]
                }
            ]
        )

        map_search_parameter = completion.choices[0].message.content
        print(f"Optimal search parameter identified: {map_search_parameter}")

        print(f"Mapping website using the identified search parameter...")
        map_website = app.map_url(url, params={"search": map_search_parameter})
        print("Website mapping completed successfully.")
        print(f"Located {len(map_website)} relevant links.")
        return map_website
    except Exception as e:
        print(f"Error encountered during relevant page identification: {str(e)}")
        return None
    
# Scrape the top 3 pages and see if the objective is met, if so return in json format else return None
def find_objective_in_top_pages(map_website, objective, app, client):
    try:
        # Get top 3 links from the map result
        top_links = map_website[:3] if isinstance(map_website, list) else []
        print(f"Proceeding to analyze top {len(top_links)} links: {top_links}")
        
        for link in top_links:
            print(f"Initiating scrape of page: {link}")
            # Scrape the page
            scrape_result = app.scrape_url(link, params={'formats': ['markdown']})
            print("Page scraping completed successfully.")
     
            
            # Check if objective is met
            check_prompt = f"""
            Given the following scraped content and objective, determine if the objective is met with high confidence.
            If it is, extract the relevant information in a simple and concise JSON format. Use only the necessary fields and avoid nested structures if possible.
            If the objective is not met with high confidence, respond with 'Objective not met'.

            Objective: {objective}
            Scraped content: {scrape_result['markdown']}

            Remember:
            1. Only return JSON if you are highly confident the objective is fully met.
            2. Keep the JSON structure as simple and flat as possible.
            3. Do not include any explanations or markdown formatting in your response.
            """
            
            print("Analyzing scraped content to determine objective fulfillment...")
            completion = client.chat.completions.create(
            model="o1-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": check_prompt
                        }
                    ]
                }
                ]
            )
            
            result = completion.choices[0].message.content
            
            if result != "Objective not met":
                print("Objective potentially fulfilled. Relevant information identified.")
                try:
                    print(result)
                    return json.loads(result)
                except json.JSONDecodeError:
                    print("Error in parsing response. Proceeding to next page...")
            else:
                print("Objective not met on this page. Proceeding to next link...")
        
        print("All available pages analyzed. Objective not fulfilled in examined content.")
        return None
    except Exception as e:
        print(f"Error encountered during page analysis: {str(e)}")
        return None

# Main function to execute the process
def main():
    # Get user input
    url = input("Enter the website to crawl: ")
    objective = input("Enter your objective: ")
    
    print("Initiating web crawling process.")
    # Find the relevant page
    map_website = find_relevant_page_via_map(objective, url, app, client)
    
    if map_website:
        print("Relevant pages identified. Proceeding with detailed analysis...")
        # Find objective in top pages
        result = find_objective_in_top_pages(map_website, objective, app, client)
        
        if result:
            print("Objective successfully fulfilled. Extracted information:")
            print(json.dumps(result, indent=2))
        else:
            print("Unable to fulfill the objective with the available content.")
    else:
        print("No relevant pages identified. Consider refining the search parameters or trying a different website.")

if __name__ == "__main__":
    main()
