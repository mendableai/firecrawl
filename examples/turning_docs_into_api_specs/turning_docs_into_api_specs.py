# %%
import os
import datetime
import time
from firecrawl import FirecrawlApp
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Retrieve API keys from environment variables
google_api_key = os.getenv("GOOGLE_API_KEY")
firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")

# Configure the Google Generative AI module with the API key
genai.configure(api_key=google_api_key)
model = genai.GenerativeModel("gemini-1.5-pro-001")

# Set the docs URL
docs_url = "https://docs.firecrawl.dev/api-reference"

# Initialize the FirecrawlApp with your API key
app = FirecrawlApp(api_key=firecrawl_api_key)

# %%
# Crawl all pages on docs
crawl_result = app.crawl_url(docs_url)
print(f"Total pages crawled: {len(crawl_result['data'])}")

# %%
# Define the prompt instructions for generating OpenAPI specs
prompt_instructions = """
Given the following API documentation content, generate an OpenAPI 3.0 specification in JSON format ONLY if you are 100% confident and clear about all details. Focus on extracting the main endpoints, their HTTP methods, parameters, request bodies, and responses. The specification should follow OpenAPI 3.0 structure and conventions. Include only the 200 response for each endpoint. Limit all descriptions to 5 words or less.

If there is ANY uncertainty, lack of complete information, or if you are not 100% confident about ANY part of the specification, return an empty JSON object {{}}.

Do not make anything up. Only include information that is explicitly provided in the documentation. If any detail is unclear or missing, do not attempt to fill it in.

API Documentation Content:
{{content}}

Generate the OpenAPI 3.0 specification in JSON format ONLY if you are 100% confident about every single detail. Include only the JSON object, no additional text, and ensure it has no errors in the JSON format so it can be parsed. Remember to include only the 200 response for each endpoint and keep all descriptions to 5 words maximum.

Once again, if there is ANY doubt, uncertainty, or lack of complete information, return an empty JSON object {{}}.

To reiterate: accuracy is paramount. Do not make anything up. If you are not 100% clear or confident about the entire OpenAPI spec, return an empty JSON object {{}}.
"""

# %%
# Initialize a list to store all API specs
all_api_specs = []

# Process each page in crawl_result
for index, page in enumerate(crawl_result['data']):
    if 'markdown' in page:
        # Update prompt_instructions with the current page's content
        current_prompt = prompt_instructions.replace("{content}", page['markdown'])
        try:
            # Query the model
            response = model.generate_content([current_prompt])
            response_dict = response.to_dict()
            response_text = response_dict['candidates'][0]['content']['parts'][0]['text']
            
            # Remove the ```json code wrap if present
            response_text = response_text.strip().removeprefix('```json').removesuffix('```').strip()
            
            # Parse JSON
            json_data = json.loads(response_text)
            
            # Add non-empty API specs to the list
            if json_data != {}:
                all_api_specs.append(json_data)
                print(f"API specification generated for page {index}")
            else:
                print(f"No API specification found for page {index}")
            
        except json.JSONDecodeError:
            print(f"Error parsing JSON response for page {index}")
        except Exception as e:
            print(f"An error occurred for page {index}: {str(e)}")

# Print the total number of API specs collected
print(f"Total API specifications collected: {len(all_api_specs)}")

# %%
# Combine all API specs and keep the most filled out spec for each path and method
combined_spec = {
    "openapi": "3.0.0",
    "info": {
        "title": f"{docs_url} API Specification",
        "version": "1.0.0"
    },
    "paths": {},
    "components": {
        "schemas": {}
    }
}

# Helper function to count properties in an object
def count_properties(obj):
    if isinstance(obj, dict):
        return sum(count_properties(v) for v in obj.values()) + len(obj)
    elif isinstance(obj, list):
        return sum(count_properties(item) for item in obj)
    else:
        return 1

# Combine specs, keeping the most detailed version of each path and schema
for spec in all_api_specs:
    # Combine paths
    if "paths" in spec:
        for path, methods in spec["paths"].items():
            if path not in combined_spec["paths"]:
                combined_spec["paths"][path] = {}
            for method, details in methods.items():
                if method not in combined_spec["paths"][path] or count_properties(details) > count_properties(combined_spec["paths"][path][method]):
                    combined_spec["paths"][path][method] = details

    # Combine schemas
    if "components" in spec and "schemas" in spec["components"]:
        for schema_name, schema in spec["components"]["schemas"].items():
            if schema_name not in combined_spec["components"]["schemas"] or count_properties(schema) > count_properties(combined_spec["components"]["schemas"][schema_name]):
                combined_spec["components"]["schemas"][schema_name] = schema

# Print summary of combined spec
print(f"Combined API specification generated")
print(f"Total paths in combined spec: {len(combined_spec['paths'])}")
print(f"Total schemas in combined spec: {len(combined_spec['components']['schemas'])}")

# Save the combined spec to a JSON file in the same directory as the Python file
output_file = os.path.join(os.path.dirname(__file__), "combined_api_spec.json")
with open(output_file, "w") as f:
    json.dump(combined_spec, f, indent=2)

print(f"Combined API specification saved to {output_file}")
