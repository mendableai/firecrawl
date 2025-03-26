import os
from firecrawl import FirecrawlApp
import json
import re
import requests
from requests.exceptions import RequestException
from dotenv import load_dotenv
import google.genai as genai
# Load environment variables
load_dotenv()

# Retrieve API keys from environment variables
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
gemini_api_key = os.getenv("GEMINI_API_KEY")

# Initialize the FirecrawlApp and Gemini client
app = FirecrawlApp(api_key=firecrawl_api_key)
client = genai.Client(api_key=gemini_api_key)  # Create Gemini client
model_name = "gemini-2.5-pro-exp-03-25"
types = genai.types

# ANSI color codes


class Colors:
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    BLUE = '\033[94m'
    RESET = '\033[0m'


def pdf_size_in_mb(data: bytes) -> float:
    """Utility function to estimate PDF size in MB from raw bytes."""
    return len(data) / (1024 * 1024)


def gemini_extract_pdf_content(pdf_url, objective):
    """
    Downloads a PDF from pdf_url, then calls Gemini to extract text.
    Returns a string with the extracted text only.
    """
    try:
        pdf_data = requests.get(pdf_url, timeout=15).content
        size_mb = pdf_size_in_mb(pdf_data)
        if size_mb > 15:
            print(
                f"{Colors.YELLOW}Warning: PDF size is {size_mb} MB. Skipping PDF extraction.{Colors.RESET}")
            return ""

        prompt = f"""
        The objective is: {objective}.
        From this PDF, extract only the text that helps address this objective.
        If it contains no relevant info, return an empty string.
        """
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(
                    data=pdf_data, mime_type="application/pdf"),
                prompt
            ]
        )
        return response.text.strip()
    except Exception as e:
        print(f"Error using Gemini to process PDF '{pdf_url}': {str(e)}")
        return ""


def gemini_extract_image_data(image_url):
    """
    Downloads an image from image_url, then calls Gemini to:
      1) Summarize what's in the image
    Returns a string with the summary.
    """
    try:
        print(f"Gemini IMAGE extraction from: {image_url}")
        image_data = requests.get(image_url, timeout=15).content
        # 1) Summarize
        resp_summary = client.models.generate_content([
            "Describe the contents of this image in a short paragraph.",
            types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
        ])
        summary_text = resp_summary.text.strip()

        return f"**Image Summary**:\n{summary_text}"
    except Exception as e:
        print(f"Error using Gemini to process Image '{image_url}': {str(e)}")
        return ""


def extract_urls_from_markdown(markdown_text):
    """
    Simple regex-based approach to extract potential URLs from a markdown string.
    We look for http(s)://someurl up until a space or parenthesis or quote, etc.
    """
    pattern = r'(https?://[^\s\'")]+)'
    found = re.findall(pattern, markdown_text)
    return list(set(found))  # unique them


def detect_mime_type(url, timeout=8):
    """
    Attempt a HEAD request to detect the Content-Type. Return 'pdf', 'image' or None if undetermined.
    Also validates image extensions for supported formats.
    """
    try:
        resp = requests.head(url, timeout=timeout, allow_redirects=True)
        ctype = resp.headers.get('Content-Type', '').lower()
        exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']

        if 'pdf' in ctype:
            return 'pdf'
        elif ctype.startswith('image/') and any(url.lower().endswith(ext) for ext in exts):
            return 'image'
        else:
            return None
    except RequestException as e:
        print(f"Warning: HEAD request failed for {url}. Error: {e}")
        return None


def find_relevant_page_via_map(objective, url, app):
    try:
        print(f"{Colors.CYAN}Understood. The objective is: {objective}{Colors.RESET}")
        print(f"{Colors.CYAN}Initiating search on the website: {url}{Colors.RESET}")

        map_prompt = f"""
        Based on the objective of: {objective}, provide a 1-2 word search parameter that will help find the information.
        Respond with ONLY 1-2 words, no other text or formatting.
        """

        print(
            f"{Colors.YELLOW}Analyzing objective to determine optimal search parameter...{Colors.RESET}")

        response = client.models.generate_content(
            model=model_name,
            contents=[map_prompt]
        )

        map_search_parameter = response.text.strip()
        print(
            f"{Colors.GREEN}Optimal search parameter identified: {map_search_parameter}{Colors.RESET}")

        print(
            f"{Colors.YELLOW}Mapping website using the identified search parameter...{Colors.RESET}")
        map_website = app.map_url(url, params={"search": map_search_parameter})

        print(f"{Colors.MAGENTA}Debug - Map response structure: {json.dumps(map_website, indent=2)}{Colors.RESET}")
        print(f"{Colors.GREEN}Website mapping completed successfully.{Colors.RESET}")

        if isinstance(map_website, dict):
            links = map_website.get('urls', []) or map_website.get('links', [])
        elif isinstance(map_website, str):
            try:
                parsed = json.loads(map_website)
                links = parsed.get('urls', []) or parsed.get('links', [])
            except json.JSONDecodeError:
                links = []
        else:
            links = map_website if isinstance(map_website, list) else []

        if not links:
            print(f"{Colors.RED}No links found in map response.{Colors.RESET}")
            return None

        rank_prompt = f"""RESPOND ONLY WITH JSON. 
        Analyze these URLs and rank the top 3 most relevant ones for finding information about: {objective}

        Return ONLY a JSON array in this exact format - no other text or explanation:
        [
            {{
                "url": "http://example.com",
                "relevance_score": 95,
                "reason": "Main about page with company information"
            }},
            {{
                "url": "http://example2.com",
                "relevance_score": 85,
                "reason": "Team page with details"
            }},
            {{
                "url": "http://example3.com",
                "relevance_score": 75,
                "reason": "Blog post about company"
            }}
        ]

        URLs to analyze:
        {json.dumps(links, indent=2)}"""

        print(f"{Colors.YELLOW}Ranking URLs by relevance to objective...{Colors.RESET}")
        response = client.models.generate_content(
            model=model_name,
            contents=[rank_prompt]
        )

        print(f"{Colors.MAGENTA}Debug - Raw Gemini response:{Colors.RESET}")
        print(response.text)

        try:
            response_text = response.text.strip()
            print(f"{Colors.MAGENTA}Debug - Cleaned response:{Colors.RESET}")
            print(response_text)

            if '[' in response_text and ']' in response_text:
                start_idx = response_text.find('[')
                end_idx = response_text.rfind(']') + 1
                json_str = response_text[start_idx:end_idx]

                print(
                    f"{Colors.MAGENTA}Debug - Extracted JSON string:{Colors.RESET}")
                print(json_str)

                ranked_results = json.loads(json_str)
            else:
                print(f"{Colors.RED}No JSON array found in response{Colors.RESET}")
                return None

            links = [result["url"] for result in ranked_results]

            print(f"{Colors.CYAN}Top 3 ranked URLs:{Colors.RESET}")
            for result in ranked_results:
                print(f"{Colors.GREEN}URL: {result['url']}{Colors.RESET}")
                print(
                    f"{Colors.YELLOW}Relevance Score: {result['relevance_score']}{Colors.RESET}")
                print(f"{Colors.BLUE}Reason: {result['reason']}{Colors.RESET}")
                print("---")

            if not links:
                print(f"{Colors.RED}No relevant links identified.{Colors.RESET}")
                return None

        except json.JSONDecodeError as e:
            print(f"{Colors.RED}Error parsing ranked results: {str(e)}{Colors.RESET}")
            print(f"{Colors.RED}Failed JSON string: {response_text}{Colors.RESET}")
            return None
        except Exception as e:
            print(f"{Colors.RED}Unexpected error: {str(e)}{Colors.RESET}")
            return None

        print(f"{Colors.GREEN}Located {len(links)} relevant links.{Colors.RESET}")
        return links

    except Exception as e:
        print(
            f"{Colors.RED}Error encountered during relevant page identification: {str(e)}{Colors.RESET}")
        return None


def find_objective_in_top_pages(map_website, objective, app):
    try:
        if not map_website:
            print(f"{Colors.RED}No links found to analyze.{Colors.RESET}")
            return None

        top_links = map_website[:3]
        print(
            f"{Colors.CYAN}Proceeding to analyze top {len(top_links)} links: {top_links}{Colors.RESET}")

        for link in top_links:
            print(f"{Colors.YELLOW}Initiating scrape of page: {link}{Colors.RESET}")
            scrape_result = app.scrape_url(
                link, params={'formats': ['markdown']})
            print(
                f"{Colors.GREEN}Page scraping completed successfully.{Colors.RESET}")

            # Now detect any PDF or image URLs in the Markdown text
            page_markdown = scrape_result.get('markdown', '')
            if not page_markdown:
                print(
                    f"{Colors.RED}No markdown returned for {link}, skipping...{Colors.RESET}")
                continue

            found_urls = extract_urls_from_markdown(page_markdown)
            pdf_image_append = ""

            for sub_url in found_urls:
                mime_type_short = detect_mime_type(sub_url)
                if mime_type_short == 'pdf':
                    print(
                        f"{Colors.YELLOW} Detected PDF: {sub_url}. Extracting content...{Colors.RESET}")
                    pdf_content = gemini_extract_pdf_content(sub_url)
                    if pdf_content:
                        pdf_image_append += f"\n\n---\n[PDF from {sub_url}]:\n{pdf_content}"
                elif mime_type_short == 'image':
                    print(
                        f"{Colors.YELLOW} Detected Image: {sub_url}. Extracting content...{Colors.RESET}")
                    image_content = gemini_extract_image_data(sub_url)
                    if image_content:
                        pdf_image_append += f"\n\n---\n[Image from {sub_url}]:\n{image_content}"

            # Append extracted PDF/image text to the main markdown for the page
            if pdf_image_append:
                scrape_result[
                    'markdown'] += f"\n\n---\n**Additional Gemini Extraction:**\n{pdf_image_append}\n"

            check_prompt = f"""
            Analyze this content to find: {objective}
            If found, return ONLY a JSON object with information related to the objective. If not found, respond EXACTLY with: Objective not met
            
            Content to analyze:
            {scrape_result['markdown']}
            
            Remember:
            - Return valid JSON if information is found
            - Return EXACTLY "Objective not met" if not found
            - No other text or explanations
            """

            response = client.models.generate_content(
                model=model_name,
                contents=[check_prompt]
            )

            result = response.text.strip()

            print(f"{Colors.MAGENTA}Debug - Check response:{Colors.RESET}")
            print(result)

            if result != "Objective not met":
                print(
                    f"{Colors.GREEN}Objective potentially fulfilled. Relevant information identified.{Colors.RESET}")
                try:
                    if '{' in result and '}' in result:
                        start_idx = result.find('{')
                        end_idx = result.rfind('}') + 1
                        json_str = result[start_idx:end_idx]
                        return json.loads(json_str)
                    else:
                        print(
                            f"{Colors.RED}No JSON object found in response{Colors.RESET}")
                except json.JSONDecodeError:
                    print(
                        f"{Colors.RED}Error in parsing response. Proceeding to next page...{Colors.RESET}")
            else:
                print(
                    f"{Colors.YELLOW}Objective not met on this page. Proceeding to next link...{Colors.RESET}")

        print(f"{Colors.RED}All available pages analyzed. Objective not fulfilled in examined content.{Colors.RESET}")
        return None

    except Exception as e:
        print(
            f"{Colors.RED}Error encountered during page analysis: {str(e)}{Colors.RESET}")
        return None


def main():
    url = input(f"{Colors.BLUE}Enter the website to crawl : {Colors.RESET}")
    objective = input(f"{Colors.BLUE}Enter your objective: {Colors.RESET}")

    print(f"{Colors.YELLOW}Initiating web crawling process...{Colors.RESET}")
    map_website = find_relevant_page_via_map(objective, url, app)

    if map_website:
        print(f"{Colors.GREEN}Relevant pages identified. Proceeding with detailed analysis using gemini-pro...{Colors.RESET}")
        result = find_objective_in_top_pages(map_website, objective, app)

        if result:
            print(
                f"{Colors.GREEN}Objective successfully fulfilled. Extracted information:{Colors.RESET}")
            print(f"{Colors.MAGENTA}{json.dumps(result, indent=2)}{Colors.RESET}")
        else:
            print(
                f"{Colors.RED}Unable to fulfill the objective with the available content.{Colors.RESET}")
    else:
        print(f"{Colors.RED}No relevant pages identified. Consider refining the search parameters or trying a different website.{Colors.RESET}")


if __name__ == "__main__":
    main()
