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
        print(f"Okay, the objective is: {objective}")
        print(f"I am going to search the website: {url}")
        
        map_prompt = f"""
        The map function generates a list of URLs from a website and it accepts a search parameter. Based on the objective of: {objective}, come up with a 1-2 word search parameter that will help us find the information we need. Only respond with 1-2 words nothing else.
        """

        print("I'm asking the AI to suggest a search parameter...")
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
        print(f"I think the search parameter should be: {map_search_parameter}")

        print(f"Now I'm going to map the website using this search parameter...")
        map_website = app.map_url(url, params=map_search_parameter)
        print("I've successfully mapped the website!")
        return map_website
    except Exception as e:
        print(f"Oops! An error occurred while finding the relevant page: {str(e)}")
        return None
    
# Scrape the top 3 pages and see if the objective is met, if so return in json format else return None
def find_objective_in_top_pages(map_website, objective, app, client):
    try:
        # Get top 3 links from the map result
        top_links = map_website['links'][:3]
        print(f"I'm going to check the top 3 links: {top_links}")
        
        for link in top_links:
            print(f"Now I'm scraping this page: {link}")
            # Scrape the page
            scrape_result = app.scrape_url(link, params={'formats': ['markdown']})
            print("I've successfully scraped the page!")
            
            # Check if objective is met
            check_prompt = f"""
            Given the following scraped content and objective, determine if the objective is met.
            If it is, extract the relevant information in JSON format.
            If not, respond with 'Objective not met'.

            Objective: {objective}
            Scraped content: {scrape_result['data']['markdown']}
            """
            
            print("I'm asking the AI to check if the objective is met...")
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
                print("Great news! I think I've found what we're looking for!")
                return json.loads(result)
            else:
                print("This page doesn't seem to have what we need. Moving to the next one...")
        
        print("I've checked all 3 pages, but couldn't find what we're looking for.")
        return None
    except Exception as e:
        print(f"Oh no! An error occurred while scraping top pages: {str(e)}")
        return None

# Main function to execute the process
def main():
    # Get user input
    url = input("Enter the website to crawl: ")
    objective = input("Enter your objective: ")
    
    print("Alright, let's get started!")
    # Find the relevant page
    map_website = find_relevant_page_via_map(objective, url, app, client)
    
    if map_website:
        print("Great! I've found some relevant pages. Now let's see if we can find what we're looking for...")
        # Find objective in top pages
        result = find_objective_in_top_pages(map_website, objective, app, client)
        
        if result:
            print("Success! I've found what you're looking for. Here's the extracted information:")
            print(json.dumps(result, indent=2))
        else:
            print("I'm sorry, but I couldn't find what you're looking for in the top 3 pages.")
    else:
        print("I'm afraid I couldn't find any relevant pages. Maybe we could try a different website or rephrase the objective?")

if __name__ == "__main__":
    main()
