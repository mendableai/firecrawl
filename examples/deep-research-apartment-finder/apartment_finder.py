#!/usr/bin/env python3

import os
import sys
import json
from typing import Dict, List, Any
import anthropic
from firecrawl import FirecrawlApp
from dotenv import load_dotenv

# Define colors for terminal output
class Colors:
    CYAN = '\033[96m'
    YELLOW = '\033[93m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    MAGENTA = '\033[95m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

# Load environment variables
load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

if not FIRECRAWL_API_KEY or not ANTHROPIC_API_KEY:
    print(f"{Colors.RED}Error: API keys not found. Please set FIRECRAWL_API_KEY and ANTHROPIC_API_KEY environment variables.{Colors.RESET}")
    print(f"{Colors.YELLOW}You can create a .env file with these variables or set them in your shell.{Colors.RESET}")
    sys.exit(1)

# Initialize clients
firecrawl = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

def get_user_preferences():
    """Get apartment search preferences from user input"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}=== Apartment Finder ==={Colors.RESET}")
    print(f"{Colors.CYAN}Please enter your apartment search preferences:{Colors.RESET}")
    
    # Get required inputs
    location = input(f"\n{Colors.YELLOW}Enter location (city or neighborhood): {Colors.RESET}")
    while not location.strip():
        location = input(f"{Colors.RED}Location cannot be empty. Please enter a location: {Colors.RESET}")
    
    budget = input(f"{Colors.YELLOW}Enter your maximum budget (e.g., $2000): {Colors.RESET}")
    while not budget.strip():
        budget = input(f"{Colors.RED}Budget cannot be empty. Please enter your maximum budget: {Colors.RESET}")
    if not budget.startswith('$'):
        budget = f"${budget}"
    
    # Get optional inputs with defaults
    bedrooms = input(f"{Colors.YELLOW}Enter number of bedrooms (default: 1): {Colors.RESET}") or "1"
    
    amenities = input(f"{Colors.YELLOW}Enter desired amenities, separated by commas (e.g., gym,pool,parking): {Colors.RESET}") or ""
    
    return {
        "location": location.strip(),
        "budget": budget.strip(),
        "bedrooms": bedrooms.strip(),
        "amenities": amenities.strip()
    }

def build_search_query(user_prefs):
    amenities_str = f" with {user_prefs['amenities'].replace(',', ', ')}" if user_prefs['amenities'] else ""
    return f"{user_prefs['bedrooms']} bedroom apartments for rent in {user_prefs['location']} under {user_prefs['budget']}{amenities_str}"

def research_apartments(query: str) -> Dict[str, Any]:
    """Use Firecrawl's deep research to find apartment listings"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}🔍 INITIATING DEEP RESEARCH 🔍{Colors.RESET}")
    print(f"{Colors.BLUE}Researching apartments with query: '{query}'{Colors.RESET}")
    print(f"{Colors.BLUE}This may take a few minutes...{Colors.RESET}\n")
    
    # Define research parameters
    params = {
        "maxDepth": 3,  # Number of research iterations
        "timeLimit": 180,  # Time limit in seconds
        "maxUrls": 20  # Maximum URLs to analyze
    }
    
    # Start research with real-time updates
    def on_activity(activity):
        activity_type = activity['type']
        message = activity['message']
        
        if activity_type == 'info':
            color = Colors.CYAN
        elif activity_type == 'search':
            color = Colors.BLUE
        elif activity_type == 'scrape':
            color = Colors.MAGENTA
        elif activity_type == 'analyze':
            color = Colors.GREEN
        else:
            color = Colors.RESET
            
        print(f"[{color}{activity_type}{Colors.RESET}] {message}")
    
    # Run deep research
    results = firecrawl.deep_research(
        query=query,
        params=params,
        on_activity=on_activity
    )
    
    return results

def analyze_with_claude(research_results: Dict[str, Any], user_prefs: Dict[str, str]) -> List[Dict[str, Any]]:
    """Use Claude to analyze apartment data and extract top options"""
    print(f"\n{Colors.BOLD}{Colors.MAGENTA}🧠 ANALYZING RESULTS WITH CLAUDE 3.7 🧠{Colors.RESET}")
    
    # Extract relevant information from sources
    sources_text = "\n\n".join([
        f"Source {i+1}:\n{source.get('content', '')}"
        for i, source in enumerate(research_results['data']['sources'][:15])  # Limit to first 15 sources
    ])
    
    # Add the final analysis as an additional source
    final_analysis = research_results['data'].get('finalAnalysis', '')
    if final_analysis:
        sources_text += f"\n\nFinal Analysis:\n{final_analysis}"
    
    # Prepare system prompt with better handling for limited data
    system_prompt = """
    You are an expert apartment finder assistant. Your task is to analyze text about apartments and find the top apartment options that best match the user's preferences.
    
    If you find specific apartment listings with details, extract and organize them into exactly 3 options.
    
    For each listing you can identify, extract:
    1. Price (monthly rent)
    2. Location (specific neighborhood, address if available)
    3. Key features (bedrooms, bathrooms, square footage, type of building)
    4. Amenities (both in-unit and building amenities)
    5. Pros and cons (at least 3 of each)
    
    If you cannot find 3 complete listings with all details, do your best with the information available. You can:
    - Create fewer than 3 listings if that's all you can find
    - Extrapolate missing information based on similar listings or market trends
    - For missing specific details, use general information about the area
    
    You MUST format your response as a JSON array of objects. Each object should have these exact fields: 
    - title (string)
    - price (string)
    - location (string)
    - features (array of strings)
    - amenities (array of strings)
    - pros (array of strings)
    - cons (array of strings)
    
    If you absolutely cannot find any apartment listings with enough details, return an array with a single object containing general information about apartments in the area, with "No specific listings found" as the title.
    
    Example JSON structure:
    [
      {
        "title": "Luxury 2BR in Downtown",
        "price": "$2,500/month",
        "location": "123 Main St, Downtown",
        "features": ["2 bedrooms", "2 bathrooms", "950 sq ft"],
        "amenities": ["In-unit laundry", "Parking garage", "Fitness center"],
        "pros": ["Great location", "Modern appliances", "Pet friendly"],
        "cons": ["Street noise", "Small kitchen", "Limited storage"]
      }
    ]
    
    Return ONLY the JSON array, nothing else.
    """
    
    # Create the user message
    user_message = f"""
    I'm looking for {user_prefs['bedrooms']} bedroom apartments in {user_prefs['location']} with a budget of {user_prefs['budget']}.
    
    Additional preferences: {user_prefs.get('amenities', 'None specified')}
    
    Please analyze the following information and find apartment options that match my criteria:
    
    {sources_text}
    """
    
    # Call Claude API
    response = claude.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=4000,
        temperature=0,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}]
    )
    
    # Extract and parse JSON from response with better error handling
    try:
        content = response.content[0].text
        
        # Clean the content - strip markdown formatting or text before/after JSON
        content = content.strip()
        if content.startswith('```json'):
            content = content[7:]
        if content.endswith('```'):
            content = content[:-3]
        content = content.strip()
        
        # Look for JSON array in the response
        if content.startswith('[') and content.endswith(']'):
            return json.loads(content)
        
        # Try to find JSON brackets if not properly formatted
        json_start = content.find('[')
        json_end = content.rfind(']') + 1
        if json_start >= 0 and json_end > json_start:
            json_str = content[json_start:json_end]
            return json.loads(json_str)
        
        # If we can't find JSON, create a fallback response
        print(f"{Colors.YELLOW}Could not find valid JSON in Claude's response, creating fallback response{Colors.RESET}")
        return [{
            "title": "No specific listings found",
            "price": f"Target: {user_prefs['budget']}",
            "location": user_prefs['location'],
            "features": [f"{user_prefs['bedrooms']} bedroom(s)"],
            "amenities": user_prefs['amenities'].split(',') if user_prefs['amenities'] else ["Not specified"],
            "pros": ["Information is based on general market research", "Consider visiting apartment listing websites directly", "Contact local real estate agents for current availability"],
            "cons": ["No specific listings were found in the research", "Prices and availability may vary", "Additional research recommended"]
        }]
    except Exception as e:
        print(f"{Colors.RED}Error parsing Claude's response: {e}{Colors.RESET}")
        print(f"{Colors.YELLOW}Creating fallback response{Colors.RESET}")
        return [{
            "title": "Error analyzing apartment listings",
            "price": f"Target: {user_prefs['budget']}",
            "location": user_prefs['location'],
            "features": [f"{user_prefs['bedrooms']} bedroom(s)"],
            "amenities": user_prefs['amenities'].split(',') if user_prefs['amenities'] else ["Not specified"],
            "pros": ["Try refining your search criteria", "Consider searching specific apartment websites", "Contact local real estate agents"],
            "cons": ["Search encountered technical difficulties", "Results may not be accurate", "Consider trying again later"]
        }]

def display_results(apartments: List[Dict[str, Any]]):
    """Display the top apartment options in a readable format"""
    if not apartments:
        print(f"{Colors.RED}No suitable apartments found that match your criteria.{Colors.RESET}")
        return
    
    print(f"\n{Colors.BOLD}{'=' * 80}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.GREEN}🏠 TOP {len(apartments)} APARTMENT OPTIONS 🏠{Colors.RESET}".center(80))
    print(f"{Colors.BOLD}{'=' * 80}{Colors.RESET}")
    
    for i, apt in enumerate(apartments):
        print(f"\n{Colors.BOLD}{Colors.CYAN}🔑 OPTION {i+1}: {apt.get('title', 'Apartment')}{Colors.RESET}")
        print(f"{Colors.YELLOW}💰 Price: {apt.get('price', 'N/A')}{Colors.RESET}")
        print(f"{Colors.YELLOW}📍 Location: {apt.get('location', 'N/A')}{Colors.RESET}")
        
        print(f"\n{Colors.MAGENTA}📋 Features:{Colors.RESET}")
        for feature in apt.get('features', []):
            print(f"  {Colors.BLUE}•{Colors.RESET} {feature}")
        
        print(f"\n{Colors.MAGENTA}✨ Amenities:{Colors.RESET}")
        for amenity in apt.get('amenities', []):
            print(f"  {Colors.BLUE}•{Colors.RESET} {amenity}")
        
        print(f"\n{Colors.GREEN}👍 Pros:{Colors.RESET}")
        for pro in apt.get('pros', []):
            print(f"  {Colors.BLUE}•{Colors.RESET} {pro}")
        
        print(f"\n{Colors.RED}👎 Cons:{Colors.RESET}")
        for con in apt.get('cons', []):
            print(f"  {Colors.BLUE}•{Colors.RESET} {con}")
        
        print(f"\n{Colors.CYAN}{'-' * 80}{Colors.RESET}")

def main():
    # Get user preferences through interactive input
    user_prefs = get_user_preferences()
    
    # Print summary of search criteria
    print(f"\n{Colors.BOLD}{Colors.CYAN}=== Search Criteria ==={Colors.RESET}")
    print(f"{Colors.BLUE}Location: {Colors.YELLOW}{user_prefs['location']}{Colors.RESET}")
    print(f"{Colors.BLUE}Budget: {Colors.YELLOW}{user_prefs['budget']}{Colors.RESET}")
    print(f"{Colors.BLUE}Bedrooms: {Colors.YELLOW}{user_prefs['bedrooms']}{Colors.RESET}")
    print(f"{Colors.BLUE}Amenities: {Colors.YELLOW}{user_prefs['amenities'] or 'None specified'}{Colors.RESET}")
    
    # Build search query
    query = build_search_query(user_prefs)
    
    # Run research
    research_results = research_apartments(query)
    
    # Analyze with Claude
    top_apartments = analyze_with_claude(research_results, user_prefs)
    
    # Display results
    display_results(top_apartments)

if __name__ == "__main__":
    main() 