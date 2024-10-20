import csv
import json
import os

from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from openai import OpenAI
from serpapi import GoogleSearch
from swarm import Agent
from swarm.repl import run_demo_loop

load_dotenv()

# Initialize FirecrawlApp and OpenAI
app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def search_google(query, objective):
    """Search Google using SerpAPI."""
    print(f"Parameters: query={query}, objective={objective}")
    search = GoogleSearch({"q": query, "api_key": os.getenv("SERP_API_KEY")})
    results = search.get_dict().get("organic_results", [])
    return {"objective": objective, "results": results}

def scrape_url(url, objective):
    """Scrape a website using Firecrawl."""
    print(f"Parameters: url={url}, objective={objective}")
    scrape_status = app.scrape_url(
        url,
        params={'formats': ['markdown']}
    )
    return {"objective": objective, "results": scrape_status}

def crawl_url(url, objective):
    """Crawl a website using Firecrawl."""
    print(f"Parameters: url={url}, objective={objective}")
    # If using a crawled url set, pass the ID in the function call below
    # scrape_status = app.check_crawl_status("c99c9598-5a21-46d3-bced-3444a8b1942d")
    # scrape_status['results'] = scrape_status['data']
    scrape_status = app.crawl_url(
        url,
        params={'limit': 10, 'scrapeOptions': {'formats': ['markdown']}}
    )
    return {"objective": objective, "results": scrape_status}

def analyze_website_content(content, objective):
    """Analyze the scraped website content using OpenAI."""
    print(f"Parameters: content={content[:50]}..., objective={objective}")
    analysis = generate_completion(
        "website data extractor",
        f"Analyze the following website content and extract a JSON object based on the objective. Do not write the ```json and ``` to denote a JSON when returning a response",
        "Objective: " + objective + "\nContent: " + content
    )
    return {"objective": objective, "results": json.loads(analysis)}

def generate_completion(role, task, content):
    """Generate a completion using OpenAI."""
    print(f"Parameters: role={role}, task={task[:50]}..., content={content[:50]}...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"You are a {role}. {task}"},
            {"role": "user", "content": content}
        ]
    )
    return response.choices[0].message.content

def read_websites_from_csv(file_path):
    """Read websites from a CSV file."""
    websites = []
    with open(file_path, mode='r') as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            websites.append(row['website'])
    return websites

def write_results_to_json(results, file_path):
    """Write results to a JSON file."""
    with open(file_path, mode='w', encoding='utf-8') as file:
        json.dump(json.loads(results), file, ensure_ascii=False)

def handoff_to_search_google():
    """Hand off the search query to the search google agent."""
    return google_search_agent

def handoff_to_map_url():
    """Hand off the url to the map url agent."""
    return crawl_website_agent

def handoff_to_analyst():
    """Hand off the website content to the analyst agent."""
    return analyst_agent

def handoff_to_writer():
    """Hand off the results to the writer agent."""
    return writer_agent

user_interface_agent = Agent(
    name="User Interface Agent",
    instructions="You are a user interface agent that handles all interactions with the user. You need to always start with reading a CSV, then perform web data extraction objective that the user wants to achieve by searching the web, crawling the website URL, and extracting the content from a specific page. Be concise.",
    functions=[read_websites_from_csv, handoff_to_search_google],
)

google_search_agent = Agent(
    name="Google Search Agent",
    instructions="You are a google search agent specialized in searching the web. Only search for the website not any specific page. When you are done, you must hand off to the crawl agent.",
    functions=[search_google, handoff_to_map_url],
)

crawl_website_agent = Agent(
    name="Crawl Website Agent",
    instructions="You are a crawl url agent specialized in crawling the web pages. When you are done, you must hand off the results to the analyst agent.",
    functions=[crawl_url, handoff_to_analyst],
)

analyst_agent = Agent(
    name="Analyst Agent",
    instructions="You are an analyst agent that examines website content and returns a JSON object. When you are done, you must hand off the results to the writer agent.",
    functions=[analyze_website_content, handoff_to_writer],
)

writer_agent = Agent(
    name="Writer Agent",
    instructions="You are a writer agent that writes the final results to a JSON file.",
    functions=[write_results_to_json],
)

if __name__ == "__main__":
    # Run the demo loop with the user interface agent
    run_demo_loop(user_interface_agent, stream=True)
