import os
import json
import time
import requests
from dotenv import load_dotenv
from google import genai
from datetime import datetime

# ANSI color codes
class Colors:
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    RESET = '\033[0m'

# Emojis for different sections
class Emojis:
    GITHUB = "🐙"
    STATS = "📊"
    CALENDAR = "📅"
    SKILLS = "💻"
    STAR = "⭐"
    ROCKET = "🚀"
    CHART = "📈"
    BULB = "💡"
    WARNING = "⚠️"
    CHECK = "✅"
    FIRE = "🔥"
    BOOK = "📚"
    TOOLS = "🛠️"
    GRAPH = "📊"
    TARGET = "🎯"

# Load environment variables
load_dotenv()

# Initialize clients
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")

if not firecrawl_api_key:
    print(f"{Colors.RED}{Emojis.WARNING} Warning: FIRECRAWL_API_KEY not found in environment variables{Colors.RESET}")

def print_header(text, emoji, color=Colors.BLUE):
    """Print a formatted section header with emoji."""
    width = 70
    print("\n" + "═" * width)
    print(f"{color}{Colors.BOLD}{emoji}  {text.center(width-4)}  {emoji}{Colors.RESET}")
    print("═" * width + "\n")

def print_section(title, content, emoji):
    """Print a formatted section with title, content, and emoji."""
    print(f"\n{Colors.CYAN}{Colors.BOLD}{emoji} {title}{Colors.RESET}")
    print(f"{content}")

def poll_extraction_result(extraction_id, api_key, interval=2, max_attempts=15):
    """Poll Firecrawl API for extraction results with shorter intervals."""
    url = f"https://api.firecrawl.dev/v1/extract/{extraction_id}"
    headers = {'Authorization': f'Bearer {api_key}'}

    print(f"{Colors.YELLOW}Processing profile data...{Colors.RESET}")

    for attempt in range(max_attempts):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()

            if data.get('success') and data.get('data'):
                print(f"{Colors.GREEN}Data extracted successfully!{Colors.RESET}")
                return data['data']
            elif data.get('success'):
                if attempt % 3 == 0:  # Print progress less frequently
                    print(".", end="", flush=True)
                time.sleep(interval)
            else:
                print(f"\n{Colors.RED}API Error: {data.get('error', 'Unknown error')}{Colors.RESET}")
                return None

        except requests.exceptions.Timeout:
            print(f"\n{Colors.RED}Request timed out. Retrying...{Colors.RESET}")
            continue
        except Exception as e:
            print(f"\n{Colors.RED}Error polling results: {e}{Colors.RESET}")
            return None

    print(f"\n{Colors.RED}Extraction timed out after {max_attempts} attempts.{Colors.RESET}")
    return None

def extract_github_profile(username, api_key):
    """Extract GitHub profile data using Firecrawl with optimized settings."""
    if not api_key:
        print(f"{Colors.RED}Error: Firecrawl API key is missing{Colors.RESET}")
        return None

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }

    github_url = f"https://github.com/{username}"
    
    # Simplified prompt for faster extraction
    payload = {
        "urls": [github_url],
        "prompt": """Extract key GitHub profile data:
        - Basic profile information (company, location, bio)
        - Repository list and details
        - Contribution statistics
        - Recent activity
        - Social stats""",
        "enableWebSearch": False
    }

    try:
        print(f"{Colors.YELLOW}Starting extraction for: {username}{Colors.RESET}")
        response = requests.post(
            "https://api.firecrawl.dev/v1/extract",
            headers=headers,
            json=payload,
            timeout=15
        )

        if response.status_code != 200:
            print(f"{Colors.RED}API Error ({response.status_code}): {response.text}{Colors.RESET}")
            return None

        data = response.json()
        if not data.get('success'):
            print(f"{Colors.RED}API Error: {data.get('error', 'Unknown error')}{Colors.RESET}")
            return None

        extraction_id = data.get('id')
        if not extraction_id:
            print(f"{Colors.RED}No extraction ID received{Colors.RESET}")
            return None

        return poll_extraction_result(extraction_id, api_key)

    except requests.exceptions.Timeout:
        print(f"{Colors.RED}Initial request timed out{Colors.RESET}")
        return None
    except Exception as e:
        print(f"{Colors.RED}Extraction failed: {e}{Colors.RESET}")
        return None

def analyze_with_gemini(profile_data, username):
    """Use Gemini to analyze GitHub profile data with focus on comprehensive insights."""
    prompt = f"""
    Analyze this GitHub profile and provide detailed insights from the available data.
    Focus on concrete information and metrics.
    
    Structure your response in these sections:
    1. Professional Background
    - Current company/organization (if available)
    - Role/position (if available)
    - Professional website or blog links
    - Location (if available)

    2. Activity Analysis
    - Total repositories and forks
    - Most active repositories (top 3)
    - Contribution frequency
    - Recent activity trends
    - Streak information

    3. Technical Portfolio
    - Primary programming languages
    - Most used technologies/frameworks
    - Top contributed repositories
    - Notable project themes

    4. Community Engagement
    - Followers and following count
    - Public contributions
    - Pull requests and issues
    - Project collaborations

    Rules:
    - Include only verifiable information from the profile
    - List specific repository names and their purposes
    - Include contribution statistics where available
    - Focus on recent activity (last 6 months)
    - Skip sections only if completely unavailable
    
    Profile Data: {json.dumps(profile_data, indent=2)}
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        
        # Clean up response
        analysis = response.text.strip()
        analysis_lines = [line for line in analysis.split('\n') 
                         if not any(word in line.lower() 
                                  for word in ['undetermined', 'unknown', 'limited', 
                                             'not available', 'needs', 'requires', 'unclear'])]
        cleaned_analysis = '\n'.join(line for line in analysis_lines if line.strip())
        
        return format_report(cleaned_analysis, username)

    except Exception as e:
        print(f"{Colors.RED}Analysis failed: {e}{Colors.RESET}")
        return None

def format_report(raw_analysis, username):
    """Format the analysis into a clean, professional report."""
    report = f"""
{Colors.BOLD}GitHub Profile Analysis: {username}{Colors.RESET}
{Colors.CYAN}{'─' * 40}{Colors.RESET}\n"""

    sections = raw_analysis.split('\n')
    current_section = None

    for line in sections:
        line = line.strip()
        if not line:
            continue

        if any(section in line for section in ["Professional Background", "Activity Analysis", 
                                             "Technical Portfolio", "Community Engagement"]):
            report += f"\n{Colors.BOLD}{Colors.BLUE}{line}{Colors.RESET}\n"
        elif line.startswith('-'):
            report += f"• {line[1:].strip()}\n"
        elif line and not line.startswith(('#', '•')):
            report += f"  {line}\n"

    return report

def save_report(report, username):
    """Save the report to a file."""
    filename = f"github_analysis_{username}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            # Strip ANSI color codes when saving to file
            clean_report = report
            for color in vars(Colors).values():
                if isinstance(color, str) and color.startswith('\033'):
                    clean_report = clean_report.replace(color, '')
            f.write(clean_report)
        return filename
    except Exception as e:
        print(f"{Colors.RED}{Emojis.WARNING} Error saving report: {e}{Colors.RESET}")
        return None

def main():
    username = input(f"{Colors.GREEN}GitHub username: {Colors.RESET}").strip()

    if not username:
        print(f"{Colors.RED}Please provide a valid username.{Colors.RESET}")
        return

    print("Analyzing profile...")
    profile_data = extract_github_profile(username, firecrawl_api_key)
    
    if not profile_data:
        print(f"{Colors.RED}Profile analysis failed.{Colors.RESET}")
        return

    report = analyze_with_gemini(profile_data, username)

    if report:
        print(report)
    else:
        print(f"{Colors.RED}Could not generate insights.{Colors.RESET}")

if __name__ == "__main__":
    main()