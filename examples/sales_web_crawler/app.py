import csv
import json
import os
import uuid

from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from openai import OpenAI
from serpapi import GoogleSearch
from tqdm import tqdm

load_dotenv()

# Initialize FirecrawlApp and OpenAI
app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def search_google(query, objective):
    """Search Google using SerpAPI."""
    # print(f"Parameters: query={query}, objective={objective}")
    search = GoogleSearch({"q": query, "api_key": os.getenv("SERP_API_KEY")})
    results = search.get_dict().get("organic_results", [])
    return {"objective": objective, "results": results}

def scrape_url(url, objective):
    """Scrape a website using Firecrawl."""
    # print(f"Parameters: url={url}, objective={objective}")
    scrape_status = app.scrape_url(
        url,
        params={'formats': ['markdown']}
    )
    return {"objective": objective, "results": scrape_status}

def crawl_url(url, objective):
    """Crawl a website using Firecrawl."""
    # print(f"Parameters: url={url}, objective={objective}")
    # If using a crawled url set, pass the ID in the function call below
    # scrape_status = app.check_crawl_status("c99c9598-5a21-46d3-bced-3444a8b1942d")
    # scrape_status['results'] = scrape_status['data']
    scrape_status = app.crawl_url(
        url,
        params={'limit': 5, 'scrapeOptions': {'formats': ['markdown']}}
    )
    return {"objective": objective, "results": scrape_status}

def analyze_website_content(content, objective):
    """Analyze the scraped website content using OpenAI."""
    # print(f"Parameters: content={content[:50]}..., objective={objective}")
    analysis = generate_completion(
        "website data extractor",
        f"Analyze the following website content and extract a JSON object based on the objective. Do not write the ```json and ``` to denote a JSON when returning a response",
        "Objective: " + objective + "\nContent: " + content
    )
    return {"objective": objective, "results": analysis}

def generate_completion(role, task, content):
    """Generate a completion using OpenAI."""
    # print(f"Parameters: role={role}, task={task[:50]}..., content={content[:50]}...")
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
    with open(file_path, mode='w') as file:
        json.dump(results, file, indent=4)

def process_websites(file_path):
    """Process websites from a CSV file and write results to a new JSON file."""
    results = []
    websites = read_websites_from_csv(file_path)
    for website in websites:
        search_results = search_google(website, "Search website")
        if search_results['results']:
            top_result = search_results['results'][0]
            url = top_result['link']
            unique_filename = f'output_{uuid.uuid4()}.json'
            crawl_results = crawl_url(url, "Crawl website")
            if crawl_results['results']:
                for each_result in tqdm(crawl_results['results']['data'], desc="Analyzing crawl results"):
                    analysis_results = analyze_website_content(each_result['markdown'], "Extract emails, names, and titles of the people and companies found.")
                    try:
                        result = json.loads(analysis_results['results'])
                        if result:
                            results.append(result)
                            write_results_to_json(results, unique_filename)
                    except:
                        continue

if __name__ == "__main__":
    # Process websites from the CSV file
    process_websites('websites.csv')
