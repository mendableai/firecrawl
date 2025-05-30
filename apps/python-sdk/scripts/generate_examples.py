import inspect
import sys
import os
from typing import get_origin, get_args
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))
from firecrawl.firecrawl import FirecrawlApp

class MethodInfo:
    def __init__(self, name: str, signature: str, parameters: dict[str, dict]):
        self.name = name
        self.signature = signature
        self.parameters = parameters

def extract_method_info(cls, method_name) -> MethodInfo:
    """Extract signature, parameters, types, defaults"""
    method = getattr(cls, method_name)
    signature = inspect.signature(method)
    parameters = signature.parameters
    
    param_info = {}
    for param_name, param in parameters.items():
        param_info[param_name] = {
            "type": param.annotation,
            "default": param.default,
            "kind": param.kind.name
        }
    
    return MethodInfo(
        name=method_name,
        signature=str(signature),
        parameters=param_info
    )

def generate_example_value(param_name: str, param_type, method_name: str):
    """Generate realistic example values based on parameter type and name"""
    
    # Check for actions parameter first, before any type processing
    if param_name == 'actions' or 'Action' in str(param_type):
        return "ACTIONS_EXAMPLE"
    
    # Check for formats parameter to show all available formats
    if param_name == 'formats':
        return ['markdown', 'html', 'raw_html', 'links', 'screenshot', 'screenshot@full_page', 'extract', 'json', 'change_tracking']
    
    # Check for urls parameter to show proper URL examples
    if param_name == 'urls':
        return ['https://example1.com', 'https://example2.com', 'https://blog.example.com']
    
    # Check for location parameter to use LocationConfig object
    if param_name == 'location':
        # For search method, location is a string, not LocationConfig
        if method_name == 'search':
            return 'US'
        return "LOCATION_EXAMPLE"
    
    # Check for extract and json_options parameters to use JsonConfig object
    if param_name in ['extract', 'json_options']:
        return "JSONCONFIG_EXAMPLE"
    
    # Check for change_tracking_options parameter to use ChangeTrackingOptions object
    if param_name == 'change_tracking_options':
        return "CHANGETRACKING_EXAMPLE"
    
    # Handle Optional types
    if hasattr(param_type, '__origin__') and param_type.__origin__ is type(None):
        return None
    
    if str(param_type).startswith('typing.Optional'):
        # Extract the inner type from Optional[T]
        args = get_args(param_type)
        if args:
            param_type = args[0]
    
    # String parameters
    if param_type == str or str(param_type) == "<class 'str'>":
        if param_name == 'url':
            return 'https://example.com'
        return f'example_{param_name}'
    
    # Boolean parameters
    if param_type == bool or str(param_type) == "<class 'bool'>":
        return True
    
    # Integer parameters
    if param_type == int or str(param_type) == "<class 'int'>":
        if 'timeout' in param_name or 'wait' in param_name:
            return 30000
        return 10
    
    # List parameters
    if hasattr(param_type, '__origin__') and param_type.__origin__ is list:
        args = get_args(param_type)
        if args:
            inner_type = args[0]
            if inner_type == str:
                if 'tags' in param_name:
                    return ['div', 'p', 'span']
                elif 'formats' in param_name:
                    return ['markdown', 'html', 'raw_html', 'links', 'screenshot', 'screenshot@full_page', 'extract', 'json', 'change_tracking']
                return ['example1', 'example2']
        return []
    
    # Literal types
    if 'Literal' in str(param_type):
        args = get_args(param_type)
        if args:
            return args[0]  # Return first literal value
    
    # Complex types - return example structures
    if 'LocationConfig' in str(param_type):
        return {'country': 'US', 'languages': ['en']}
    
    if 'JsonConfig' in str(param_type):
        return {
            'schema': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'description': {'type': 'string'}
                }
            }
        }
    
    if 'ChangeTrackingOptions' in str(param_type):
        return {
            'modes': ['git-diff', 'json'],
            'schema': {
                'type': 'object',
                'properties': {
                    'changes': {'type': 'array'},
                    'timestamp': {'type': 'string'}
                }
            },
            'prompt': 'Detect and extract any content changes from the page'
        }
    
    return None

def create_example_files():
    """Generate individual .py files for each method"""
    
    # Get all public methods from FirecrawlApp
    methods = [method for method in dir(FirecrawlApp) 
              if not method.startswith('_') and callable(getattr(FirecrawlApp, method))]
    
    # Create examples directory
    examples_dir = os.path.join(os.path.dirname(__file__), '../examples')
    os.makedirs(examples_dir, exist_ok=True)
    
    for method_name in methods:
        try:
            method_info = extract_method_info(FirecrawlApp, method_name)
            
            # Skip if no parameters (besides self)
            relevant_params = {k: v for k, v in method_info.parameters.items() 
                             if k not in ['self', 'kwargs']}
            
            if not relevant_params:
                continue
                
            # Generate example file content
            example_content = generate_example_file_content(method_name, method_info)
            
            # Write to file
            filename = f"{method_name}_example.py"
            filepath = os.path.join(examples_dir, filename)
            
            with open(filepath, 'w') as f:
                f.write(example_content)
                
            print(f"Generated: {filename}")
            
        except Exception as e:
            print(f"Error generating example for {method_name}: {e}")

def generate_example_file_content(method_name: str, method_info: MethodInfo) -> str:
    """Generate the content for an example file"""
    
    # Define example templates
    actions_example = """[
        WaitAction(milliseconds=1000),
        ScreenshotAction(fullPage=True),
        ClickAction(selector="button.submit"),
        WriteAction(selector="input[name='email']", text="test@example.com"),
        PressAction(key="Enter"),
        ScrollAction(direction="down"),
        ScrapeAction(),
        ExecuteJavascriptAction(script='''
            function getDocumentTitle() {
                return document.title;
            }
            return getDocumentTitle();
        ''')
    ]"""
    
    formats_example = """["markdown", "html", "rawHtml", "screenshot", "links", "screenshot@fullPage", "extract"]"""
    
    urls_example = """["https://example1.com", "https://example2.com", "https://example3.com"]"""
    
    location_example = """LocationConfig(
        country="US",
        languages=["en"]
    )"""
    
    jsonconfig_example = """JsonConfig(
        prompt="Extract the main content and metadata",
        schema={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
                "author": {"type": "string"},
                "date": {"type": "string"}
            },
            "required": ["title", "content"]
        },
        system_prompt="You are a helpful assistant that extracts structured data from web pages.",
        agent="gpt-4"
    )"""
    
    changetracking_example = """ChangeTrackingOptions(
        modes=["git-diff", "json"],
        schema={
            "type": "object",
            "properties": {
                "changes": {"type": "array"},
                "timestamp": {"type": "string"}
            }
        },
        prompt="Detect and extract any content changes from the page"
    )"""
    
    # Check if this method uses actions to determine imports
    has_actions = any('Action' in str(param_details['type']) 
                     for param_details in method_info.parameters.values())
    has_location = any('LocationConfig' in str(param_details['type']) 
                      for param_details in method_info.parameters.values())
    has_jsonconfig = any('JsonConfig' in str(param_details['type']) 
                        for param_details in method_info.parameters.values())
    has_changetracking = any('ChangeTrackingOptions' in str(param_details['type']) 
                            for param_details in method_info.parameters.values())
    
    # File header with conditional imports
    if has_actions and has_location and has_jsonconfig and has_changetracking:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    LocationConfig, JsonConfig, ChangeTrackingOptions
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_actions and has_location and has_jsonconfig:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    LocationConfig, JsonConfig
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_actions and has_location and has_changetracking:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    LocationConfig, ChangeTrackingOptions
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_actions and has_location:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    LocationConfig
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_actions and has_jsonconfig:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction,
    JsonConfig
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_location and has_jsonconfig:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import LocationConfig, JsonConfig

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_actions:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import (
    WaitAction, ScreenshotAction, ClickAction, WriteAction, 
    PressAction, ScrollAction, ScrapeAction, ExecuteJavascriptAction
)

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_location:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import LocationConfig

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_jsonconfig:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import JsonConfig

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    elif has_changetracking:
        content = f"""import os
from firecrawl import FirecrawlApp
from firecrawl import ChangeTrackingOptions

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    else:
        content = f"""import os
from firecrawl import FirecrawlApp

def main():
    # Initialize the FirecrawlApp
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("Please set FIRECRAWL_API_KEY environment variable")
    
    app = FirecrawlApp(api_key=api_key)
    
    # Example with all parameters
    try:
"""
    
    # Generate method call with all parameters
    params = []
    for param_name, param_details in method_info.parameters.items():
        if param_name in ['self', 'kwargs']:
            continue
            
        param_type = param_details['type']
        example_value = generate_example_value(param_name, param_type, method_name)
        
        if example_value is not None:
            if example_value == "ACTIONS_EXAMPLE":
                # Special handling for actions
                actions_code = """[
                WaitAction(milliseconds=1000, selector="#content"),
                ScreenshotAction(full_page=True),
                ClickAction(selector="button.submit"),
                WriteAction(text="example@email.com"),
                PressAction(key="Enter"),
                ScrollAction(direction="down", selector=".scrollable-container"),
                ScrapeAction(),
                ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
            ]"""
                params.append(f"            {param_name}={actions_code}")
            elif example_value == "LOCATION_EXAMPLE":
                # Special handling for location
                location_code = 'LocationConfig(country="US", languages=["en"])'
                params.append(f"            {param_name}={location_code}")
            elif example_value == "JSONCONFIG_EXAMPLE":
                # Special handling for extract and json_options
                json_config_code = 'JsonConfig(schema={"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}})'
                params.append(f"            {param_name}={json_config_code}")
            elif example_value == "CHANGETRACKING_EXAMPLE":
                # Special handling for change_tracking_options
                change_tracking_code = 'ChangeTrackingOptions(modes=["git-diff", "json"], schema={"type": "object", "properties": {"changes": {"type": "array"}, "timestamp": {"type": "string"}}})'
                params.append(f"            {param_name}={change_tracking_code}")
            elif isinstance(example_value, str):
                params.append(f"            {param_name}='{example_value}'")
            elif isinstance(example_value, dict):
                # Format dict with proper indentation
                dict_str = json.dumps(example_value, indent=4)
                # Add proper indentation to each line except the first
                lines = dict_str.split('\n')
                if len(lines) > 1:
                    indented_lines = [lines[0]]  # First line without extra indent
                    for line in lines[1:]:
                        indented_lines.append('            ' + line)
                    indented_dict = '\n'.join(indented_lines)
                else:
                    indented_dict = dict_str
                params.append(f"            {param_name}={indented_dict}")
            elif isinstance(example_value, list):
                # Format list with proper indentation
                if all(isinstance(item, str) for item in example_value):
                    # Simple string list
                    params.append(f"            {param_name}={example_value}")
                else:
                    # Complex list with dicts
                    list_str = json.dumps(example_value, indent=4)
                    indented_list = '\n'.join('            ' + line for line in list_str.split('\n'))
                    params.append(f"            {param_name}={indented_list}")
            else:
                params.append(f"            {param_name}={example_value}")
        elif param_name == 'actions':
            # Always include actions parameter even if example_value is None
            actions_code = """[
                WaitAction(milliseconds=1000, selector="#content"),
                ScreenshotAction(full_page=True),
                ClickAction(selector="button.submit"),
                WriteAction(text="example@email.com"),
                PressAction(key="Enter"),
                ScrollAction(direction="down", selector=".scrollable-container"),
                ScrapeAction(),
                ExecuteJavascriptAction(script="function get_title() { return document.title; }; get_title();")
            ]"""
            params.append(f"            {param_name}={actions_code}")
        elif param_name == 'formats':
            # Always include formats parameter to show all available options
            formats_list = ['markdown', 'html', 'raw_html', 'links', 'screenshot', 'screenshot@full_page', 'extract', 'json', 'change_tracking']
            params.append(f"            {param_name}={formats_list}")
    
    # Add method call
    if params:
        params_str = ',\n'.join(params)
        content += f"""        result = app.{method_name}(
{params_str}
        )
        
        print("Success!")
        print(f"Result: {{result}}")
        
    except Exception as e:
        print(f"Error: {{e}}")

if __name__ == "__main__":
    main()
"""
    else:
        content += f"""        result = app.{method_name}()
        print("Success!")
        print(f"Result: {{result}}")
        
    except Exception as e:
        print(f"Error: {{e}}")

if __name__ == "__main__":
    main()
"""
    
    # Replace placeholders with actual examples
    content = content.replace('"ACTIONS_EXAMPLE"', actions_example)
    content = content.replace('"FORMATS_EXAMPLE"', formats_example)
    content = content.replace('"URLS_EXAMPLE"', urls_example)
    content = content.replace('"LOCATION_EXAMPLE"', location_example)
    content = content.replace('"JSONCONFIG_EXAMPLE"', jsonconfig_example)
    content = content.replace('"CHANGETRACKING_EXAMPLE"', changetracking_example)
    
    return content

def add_examples_to_openapi():
    """Add Python SDK examples to OpenAPI spec for Mintlify documentation"""
    import json
    
    # Load the OpenAPI specification
    openapi_path = os.path.join(os.path.dirname(__file__), '../../api/v1-openapi.json')
    
    try:
        with open(openapi_path, 'r') as f:
            openapi_spec = json.load(f)
    except FileNotFoundError:
        print(f"OpenAPI spec not found at {openapi_path}")
        return
    
    # Mapping of OpenAPI operation IDs to Python SDK methods
    operation_to_method_mapping = {
        'scrapeAndExtractFromUrl': 'scrape_url',
        'scrapeAndExtractFromUrls': 'batch_scrape',
        'getBatchScrapeStatus': 'get_batch_scrape_status',
        'cancelBatchScrape': 'cancel_batch_scrape',
        'getBatchScrapeErrors': 'get_batch_scrape_errors',
        'getCrawlStatus': 'get_crawl_status',
        'cancelCrawl': 'cancel_crawl',
        'getCrawlErrors': 'get_crawl_errors',
        'crawlUrls': 'crawl_url',
        'mapUrls': 'map_url',
        'extractData': 'extract',
        'getExtractStatus': 'get_extract_status',
        'startDeepResearch': 'deep_research',
        'getDeepResearchStatus': 'get_deep_research_status',
        'getCreditUsage': 'get_credit_usage',
        'getTokenUsage': 'get_token_usage',
        'searchAndScrape': 'search',
        'generateLLMsTxt': 'generate_llms_txt',
        'getLLMsTxtStatus': 'get_llms_txt_status'
    }
    
    # Path to examples directory
    examples_dir = os.path.join(os.path.dirname(__file__), '../examples')
    
    # Check if examples directory exists
    if not os.path.exists(examples_dir):
        print(f"Examples directory not found at {examples_dir}")
        return
    
    # Generate code samples for each endpoint
    for path, path_item in openapi_spec.get('paths', {}).items():
        for method, operation in path_item.items():
            if method.upper() not in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                continue
                
            operation_id = operation.get('operationId')
            if not operation_id or operation_id not in operation_to_method_mapping:
                continue
                
            python_method = operation_to_method_mapping[operation_id]
            
            # Look for the corresponding example file
            example_filename = f"{python_method}_example.py"
            example_filepath = os.path.join(examples_dir, example_filename)
            
            # Only proceed if the example file exists
            if not os.path.exists(example_filepath):
                print(f"Skipping {operation_id} -> {python_method} (no example file found)")
                continue
            
            try:
                # Read the example file content
                with open(example_filepath, 'r') as f:
                    example_content = f.read()
                
                # Add x-codeSamples to the operation
                if 'x-codeSamples' not in operation:
                    operation['x-codeSamples'] = []
                
                # Remove existing Python samples to avoid duplicates
                operation['x-codeSamples'] = [
                    sample for sample in operation['x-codeSamples'] 
                    if sample.get('lang') != 'python'
                ]
                
                # Add new Python sample using the example file content
                operation['x-codeSamples'].append({
                    'lang': 'python',
                    'label': 'Python SDK',
                    'source': example_content
                })
                
                print(f"Added Python example for {operation_id} -> {python_method}")
                
            except Exception as e:
                print(f"Error reading example file for {python_method}: {e}")
                continue
    
    # Save the updated OpenAPI spec
    output_path = os.path.join(os.path.dirname(__file__), '../../api/v1-openapi-with-examples.json')
    with open(output_path, 'w') as f:
        json.dump(openapi_spec, f, indent=2)
    
    print(f"Updated OpenAPI spec saved to: {output_path}")

def main():
    print("Generating comprehensive SDK examples...")
    
    # First, show method info for scrape_url as before
    method_info = extract_method_info(FirecrawlApp, "scrape_url")
    print(f"\nMethod: {method_info.name}")
    print(f"Signature: {method_info.signature}")
    print("Parameters:")
    for param_name, param_details in method_info.parameters.items():
        print(f"  {param_name}: {param_details}")
    
    print("\n" + "="*50)
    print("Generating example files...")
    
    # Generate all example files
    create_example_files()
    
    print("\n" + "="*50)
    print("Adding examples to OpenAPI specification...")
    
    # Add examples to OpenAPI spec for Mintlify
    add_examples_to_openapi()
    
    print("\nDone! Check the examples/ directory for generated files.")
    print("Updated OpenAPI spec with Python SDK examples saved to v1-openapi-with-examples.json")

if __name__ == "__main__":
    main()