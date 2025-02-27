import os
from firecrawl import FirecrawlApp
from groq import Groq
from dotenv import load_dotenv

# ANSI color codes for pretty terminal output
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
groq_api_key = os.getenv("GROQ_API_KEY")

# Initialize the FirecrawlApp and Groq client
app = FirecrawlApp(api_key=firecrawl_api_key)
groq_client = Groq(api_key=groq_api_key)

def scrape_website(url):
    """
    Scrape a website using Firecrawl.

    Args:
        url (str): The URL to scrape

    Returns:
        dict: The scraped data
    """
    try:
        print(f"{Colors.YELLOW}Scraping website: {url}{Colors.RESET}")
        scrape_result = app.scrape_url(url, params={'formats': ['markdown']})
        print(f"{Colors.GREEN}Website scraped successfully.{Colors.RESET}")
        return scrape_result
    except Exception as e:
        print(f"{Colors.RED}Error scraping website: {str(e)}{Colors.RESET}")
        return None

def summarize_content(content, model="deepseek-r1-distill-llama-70b"):
    """
    Summarize content using Groq's API.

    Args:
        content (str): The content to summarize
        model (str): The model to use for summarization

    Returns:
        str: The generated summary
    """
    try:
        print(f"{Colors.YELLOW}Generating summary using Groq's {model} model...{Colors.RESET}")

        prompt = f"""
        Please provide a concise summary of the following website content.
        The summary should:
        - Be around 3-5 paragraphs
        - Highlight the main purpose of the website
        - Include key features or offerings
        - Mention any unique selling points

        Content:
        {content}
        """

        completion = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that specializes in creating concise website summaries."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=1000
        )

        summary = completion.choices[0].message.content
        print(f"{Colors.GREEN}Summary generated successfully.{Colors.RESET}")
        return summary
    except Exception as e:
        print(f"{Colors.RED}Error generating summary: {str(e)}{Colors.RESET}")
        return None

def analyze_website_sentiment(content, model="deepseek-r1-distill-llama-70b"):
    """
    Analyze the sentiment and tone of the website content using Groq's API.

    Args:
        content (str): The content to analyze
        model (str): The model to use for analysis

    Returns:
        dict: The sentiment analysis result
    """
    try:
        print(f"{Colors.YELLOW}Analyzing website sentiment using Groq's {model} model...{Colors.RESET}")

        prompt = f"""
        Please analyze the sentiment and tone of the following website content.
        Return your analysis as a JSON object with the following fields:
        - sentiment: the overall sentiment (positive, neutral, negative)
        - tone_descriptors: an array of 3-5 adjectives describing the tone
        - formality_level: an estimate of how formal the language is (1-10 scale)
        - target_audience: your estimate of who the content is aimed at

        Content:
        {content}
        """

        completion = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that specializes in content and sentiment analysis."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=800
        )

        analysis_text = completion.choices[0].message.content
        print(f"{Colors.GREEN}Sentiment analysis completed.{Colors.RESET}")

        # Extract the JSON from the response
        try:
            import re
            import json
            json_match = re.search(r'({.*})', analysis_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                analysis = json.loads(json_str)
                return analysis
            return {"error": "Could not parse JSON from response"}
        except Exception as json_err:
            print(f"{Colors.RED}Error parsing JSON response: {str(json_err)}{Colors.RESET}")
            return {"error": "Could not parse JSON", "raw_response": analysis_text}
    except Exception as e:
        print(f"{Colors.RED}Error analyzing sentiment: {str(e)}{Colors.RESET}")
        return None

def extract_key_topics(content, model="deepseek-r1-distill-llama-70b"):
    """
    Extract key topics and concepts from the website content using Groq's API.

    Args:
        content (str): The content to analyze
        model (str): The model to use for extraction

    Returns:
        list: The extracted key topics
    """
    try:
        print(f"{Colors.YELLOW}Extracting key topics using Groq's {model} model...{Colors.RESET}")

        prompt = f"""
        Extract the 5-8 most important topics or concepts from the following website content.
        For each topic, provide:
        1. A short name (1-3 words)
        2. A brief description (10-15 words)

        Return your response as a simple list in the following format:
        1. [Topic name]: [Brief description]
        2. [Topic name]: [Brief description]

        Content:
        {content}
        """

        completion = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that specializes in extracting key topics from content."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=800
        )

        topics_text = completion.choices[0].message.content
        print(f"{Colors.GREEN}Key topics extracted successfully.{Colors.RESET}")
        return topics_text
    except Exception as e:
        print(f"{Colors.RED}Error extracting key topics: {str(e)}{Colors.RESET}")
        return None

def main():
    """
    Main function to run the website analysis.
    """
    # Get user input
    url = input(f"{Colors.BLUE}Enter the website URL to analyze: {Colors.RESET}")

    if not url.strip():
        print(f"{Colors.RED}No URL entered. Exiting.{Colors.RESET}")
        return

    # Add http:// prefix if not present
    if not url.startswith('http'):
        url = 'https://' + url

    # Scrape the website
    scrape_result = scrape_website(url)

    if not scrape_result or 'markdown' not in scrape_result:
        print(f"{Colors.RED}Failed to scrape website. Exiting.{Colors.RESET}")
        return

    content = scrape_result['markdown']

    # Ask user which analysis to perform
    print(f"\n{Colors.BLUE}Select an analysis option:{Colors.RESET}")
    print(f"1. Generate a concise summary of the website")
    print(f"2. Analyze the sentiment and tone of the website")
    print(f"3. Extract key topics from the website")
    print(f"4. Perform all analyses")

    option = input(f"{Colors.BLUE}Enter your choice (1-4): {Colors.RESET}")

    # Perform the selected analysis
    if option == '1' or option == '4':
        summary = summarize_content(content)
        if summary:
            print(f"\n{Colors.CYAN}Website Summary:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{summary}{Colors.RESET}")
            print("\n")

    if option == '2' or option == '4':
        sentiment = analyze_website_sentiment(content)
        if sentiment:
            print(f"\n{Colors.CYAN}Sentiment Analysis:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{sentiment}{Colors.RESET}")
            print("\n")

    if option == '3' or option == '4':
        topics = extract_key_topics(content)
        if topics:
            print(f"\n{Colors.CYAN}Key Topics:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{topics}{Colors.RESET}")
            print("\n")

    print(f"{Colors.GREEN}Analysis complete!{Colors.RESET}")

if __name__ == "__main__":
    main()
