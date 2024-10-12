import os
from firecrawl import FirecrawlApp
from swarm import Agent
from swarm.repl import run_demo_loop
import dotenv
from openai import OpenAI

dotenv.load_dotenv()

# Initialize FirecrawlApp and OpenAI
app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def scrape_website(url):
    """Scrape a website using Firecrawl."""
    scrape_status = app.scrape_url(
        url,
        params={'formats': ['markdown']}
    )
    return scrape_status

def generate_completion(role, task, content):
    """Generate a completion using OpenAI."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"You are a {role}. {task}"},
            {"role": "user", "content": content}
        ]
    )
    return response.choices[0].message.content

def analyze_website_content(content):
    """Analyze the scraped website content using OpenAI."""
    analysis = generate_completion(
        "marketing analyst",
        "Analyze the following website content and provide key insights for marketing strategy.",
        content
    )
    return {"analysis": analysis}

def generate_copy(brief):
    """Generate marketing copy based on a brief using OpenAI."""
    copy = generate_completion(
        "copywriter",
        "Create compelling marketing copy based on the following brief.",
        brief
    )
    return {"copy": copy}

def create_campaign_idea(target_audience, goals):
    """Create a campaign idea based on target audience and goals using OpenAI."""
    campaign_idea = generate_completion(
        "marketing strategist",
        "Create an innovative campaign idea based on the target audience and goals provided.",
        f"Target Audience: {target_audience}\nGoals: {goals}"
    )
    return {"campaign_idea": campaign_idea}

def handoff_to_copywriter():
    """Hand off the campaign idea to the copywriter agent."""
    return copywriter_agent

def handoff_to_analyst():
    """Hand off the website content to the analyst agent."""
    return analyst_agent

def handoff_to_campaign_idea():
    """Hand off the target audience and goals to the campaign idea agent."""
    return campaign_idea_agent

def handoff_to_website_scraper():
    """Hand off the url to the website scraper agent."""
    return website_scraper_agent

user_interface_agent = Agent(
    name="User Interface Agent",
    instructions="You are a user interface agent that handles all interactions with the user. You need to always start with a URL that the user wants to create a marketing strategy for. Ask clarification questions if needed. Be concise.",
    functions=[handoff_to_website_scraper],
)

website_scraper_agent = Agent(
    name="Website Scraper Agent",
    instructions="You are a website scraper agent specialized in scraping website content.",
    functions=[scrape_website, handoff_to_analyst],
)

analyst_agent = Agent(
    name="Analyst Agent",
    instructions="You are an analyst agent that examines website content and provides insights for marketing strategies. Be concise.",
    functions=[analyze_website_content, handoff_to_campaign_idea],
)

campaign_idea_agent = Agent(
    name="Campaign Idea Agent",
    instructions="You are a campaign idea agent that creates innovative marketing campaign ideas based on website content and target audience. Be concise.",
    functions=[create_campaign_idea, handoff_to_copywriter],
)

copywriter_agent = Agent(
    name="Copywriter Agent",
    instructions="You are a copywriter agent specialized in creating compelling marketing copy based on website content and campaign ideas. Be concise.",
    functions=[generate_copy],
)

if __name__ == "__main__":
    # Run the demo loop with the user interface agent
    run_demo_loop(user_interface_agent, stream=True)