---
title: Comprehensive GitHub Actions Tutorial For Beginners With Examples in Python
description: Learn how to automate software development workflows with GitHub Actions. This beginner-friendly tutorial covers workflow creation, CI/CD pipelines, scheduled tasks, and practical Python examples to help you streamline your development process.
slug: github-actions-tutorial-for-beginners-with-python-examples
date: Dec 9, 2024
author: bex_tuychiev
image: /images/blog/github-actions-tutorial/github-actions-tutorial-for-beginners-with-python-examples.jpg
categories: [tutorials]
keywords: [github actions, github actions tutorial, github actions environment variables, github actions secrets, github actions workflow, github actions run, github actions jobs]
---

## Introduction

GitHub Actions is a powerful automation platform that helps developers automate repetitive, time-consuming software development workflows. Instead of manually running tests, executing scripts at intervals, or performing any programmable task, you can let GitHub Actions handle those operations when specific events occur in your repository. In this tutorial, you will learn how to use this critical feature of GitHub and design your own workflows for several real-world use cases.

### What are GitHub Actions?

At its core, [GitHub Actions](https://docs.github.com/en/actions) is a continuous integration and continuous delivery (CI/CD) platform that lets you automate various tasks directly from your GitHub repository. Think of it as your personal automation assistant, which can:

- Run your Python tests automatically when you push code
- Deploy your application when you create a new release
- Send notifications when issues are created
- Schedule tasks to run at specific times
- And much more...

### Why automate with GitHub Actions?

Consider this common scenario: You are building a Python application that scrapes product prices from various e-commerce websites. Without GitHub Actions, you would need to:

1. Manually run your tests after each code change
2. Remember to execute the scraper at regular intervals
3. Deploy updates to your production environment
4. Keep track of environment variables and secrets

With GitHub Actions, all of these tasks can be automated through workflows, typically written in YAML files like this:

```yaml
name: Run Price Scraper

on:
  schedule:
    - cron: '0 */12 * * *'  # Runs every 12 hours
  workflow_dispatch:  # Allows manual triggers

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'
        
    - name: Run scraper
      env:
        API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
      run: python scraper.py
```

This workflow automatically runs a scraper every 12 hours, handles Python version setup, and securely manages API keys—all without manual intervention.

### What we'll build in this tutorial

Throughout this tutorial, we'll build several practical GitHub Actions workflows for Python applications. You will learn how to:

1. Create basic and advanced workflow configurations
2. Work with environment variables and secrets
3. Set up automated testing pipelines
4. Build a real-world example: an automated scraping system using [Firecrawl](https://firecrawl.dev) in Python
5. Implement best practices for security and efficiency

By the end, you will have hands-on experience with GitHub Actions and be able to automate your own Python projects effectively.

> Note: Even though code examples are Python, the concepts and hands-on experience you will gain from the tutorial will apply to any programming language.

Let's start by understanding the core concepts that make GitHub Actions work.

## How to Use This GitHub Actions Tutorial

Before diving into the technical details, here's how to get the most from this GitHub Actions tutorial:

1. Follow the examples sequentially - each builds on previous concepts
2. Try running the workflows yourself - hands-on practice is crucial
3. Refer back to earlier sections as needed
4. Use the provided code samples as templates for your own projects

## Understanding GitHub Actions Core Concepts

To write your own GitHub Actions workflows, you need to understand how its different components work together. Let's break down these core concepts using a practical example: automating tests for a simple Python script.

### GitHub Actions workflows and their components

A workflow is an automated process that you define in a YAML file within your repository's `.github/workflows` directory. Think of it as a recipe that tells GitHub exactly what to do, how and when to do it. You can transform virtually any programmable task into a GitHub workflow as long as it can be executed in a Linux, Windows, or macOS environment and doesn't require direct user interaction.

Here is a basic workflow structure:

```yaml
# test.yaml
name: Python Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
```

The YAML file starts by specifying the name of the workflow with the `name` field. Immediately after, we specify the events that triggers this workflow. In this example, the workflow automatically executes on each `git push` command and pull request. We will learn more about events and triggers in a later section.

Next, we define jobs, which are the building blocks of workflows. Each job:

- Runs on a fresh virtual machine (called a runner) that is specified using the `runs-on` field.
- Can execute multiple steps in sequence
- Can run in parallel with other jobs
- Has access to shared workflow data

For example, you might have separate jobs for testing and deployment:

```yaml
jobs:
    test:
        runs-on: ubuntu-latest
        ...
    deploy:
        runs-on: macos-latest
        ...
```

Each job can contain one or more `steps` that are executed sequentially. Steps are individual tasks that make up your job. They can:

- Run commands or shell scripts
- Execute actions (reusable units of code)
- Run commands in Docker containers
- Reference other GitHub repositories

For example, a typical test job might have steps to:

1. Check out (clone) code from your GitHub repository
2. Set up dependencies
3. Run tests
4. Upload test results

Each step can specify:

- `name`: A display name for the step
- `uses`: Reference to an action to run
- `run`: Any operating-system specific terminal command like `pip install package` or `python script.py`
- `with`: Input parameters for actions
- `env`: Environment variables for the step

Now that we understand jobs and steps, let's look at Actions - the reusable building blocks that make GitHub Actions so powerful.

### Actions

The `test.yaml` file from earlier has a single `test` job that executes two steps:

1. Checking out the repository code using a built-in `actions/checkout@v3` action.
2. Setting up a Python environment with `actions/setup-python@v4` and `python-version` as an input parameter for said action.

```bash
# test.yaml
name: Python Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
```

Actions are reusable units of code that can be shared across workflows (this is where GitHub Actions take its name). They are like pre-packaged functions that handle common tasks. For instance, instead of writing code to set up Node.js or caching dependencies, you can use the GitHub official actions like:

- `actions/setup-node@v3` - Sets up Node.js environment
- `actions/cache@v3` - Caches dependencies and build outputs
- `actions/upload-artifact@v3` - Uploads workflow artifacts
- `actions/download-artifact@v3` - Downloads workflow artifacts
- `actions/labeler@v4` - Automatically labels pull requests
- `actions/stale@v8` - Marks and closes stale issues/PRs
- `actions/dependency-review-action@v3` - Reviews dependency changes

### Events and triggers

Events are specific activities that trigger a workflow. Common triggers include:

- `push`: When code is pushed to the repository
- `pull_request`: When a PR is opened or updated
- `schedule`: At specified times using cron syntax
- `workflow_dispatch`: Manual trigger via GitHub UI

Here is how you can configure multiple triggers:

```yaml
name: Comprehensive Workflow
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:  # Manual trigger

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run daily tasks
        run: python daily_tasks.py
        env:
          API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
```

This example shows how a single workflow can:

- Run automatically on code changes on `git push`
- Execute daily scheduled tasks with cron
- Be triggered automatically when needed through the GitHub UI
- Handle sensitive data like API keys securely

### Cron jobs in GitHub Actions

To use the `schedule` trigger effectively in GitHub Actions, you'll need to understand cron syntax. This powerful scheduling format lets you automate workflows to run at precise times. The syntax uses five fields to specify when a job should run:

![Cron syntax diagram showing minute, hour, day of month, month, and day of week fields with examples and explanations for GitHub Actions scheduling](github-actions-tutorial-images/cron-syntax.png)

Here are some common cron schedule examples:

```yaml
# Daily at 3:30 AM UTC
- cron: '30 3 * * *'

# Every Monday at 1:00 PM UTC
- cron: '0 13 * * 1'

# Every 6 hours at the first minute
- cron: '0 */6 * * *'

# At minute 15 of every hour
- cron: '15 * * * *'

# Every weekday (Monday through Friday)
- cron: '0 0 * * 1-5'

# Each day at 12am, 6am, 12pm, 6pm on Tuesday, Thursday, Saturday
- cron: '0 0,6,12,18 * * 1,3,5'
```

Here is a sample workflow for a scraping job with four different schedules (multiple schedules are allowed):

```yaml
name: Price Scraper Schedules
on:
  schedule:
    - cron: '0 */4 * * *'    # Every 4 hours
    - cron: '30 1 * * *'     # Daily at 1:30 AM UTC
    - cron: '0 9 * * 1-5'    # Weekdays at 9 AM UTC

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Firecrawl scraper
        env:
          API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
        run: python scraper.py
```

Remember that GitHub Actions runs on UTC time, and schedules might experience slight delays during peak GitHub usage. That's why it's helpful to combine `schedule` with `workflow_dispatch` as we saw earlier - giving you both automated and manual trigger options.

---------------

Understanding these core concepts allows you to create workflows that are efficient (running only when needed), secure (properly handling sensitive data), maintainable (using reusable actions) and scalable (running on different platforms).

In the next section, we will put these concepts into practice by creating your first GitHub actions workflow.

## Creating Your First GitHub Actions Workflow

Let's create a practical GitHub Actions workflow from scratch. We'll build a workflow that automatically tests a Python script and runts it on a schedule - a universal task applicable to any programming language.

### Setting up the environment

Let's start by creating a working directory for this mini-project:

```bash
mkdir first-workflows
cd first-workflows
```

Let's create the standard `.github/workflows` folder structure GitHub uses for detecting workflow files:

```bash
mkdir -p .github/workflows
```

The workflow files can have any name but must have a `.yml` extension:

```bash
touch .github/workflows/system_monitor.yml
```

In addition to the workflows folder, create a `tests` folder as well as a test file:

```bash
mkdir tests
touch tests/test_main.py
```

We should also create the `main.py` file along with a `requirements.txt`:

```bash
touch main.py requirements.txt
```

Then, add these two dependencies to `requirements.txt`:

```text
psutil>=5.9.0
pytest>=7.0.0
```

Finally, let's initialize git and make our first commit:

```bash
git init 
git add .
git commit -m "Initial commit"
```

Check out the [Git documentation](https://git-scm.com/doc) if you don't have it installed already.

### Writing your first workflow file

Let's write the workflow logic first. Open `system_monitor.yml` and paste each code snippet we are about to define one after the other.

- Workflow name and triggers:

```yaml
name: System Monitoring
on:
  schedule:
    - cron: '*/30 * * * *'  # Run every 30 minutes
  workflow_dispatch:        # Enables manual trigger
```

In this part, we give a descriptive name to the workflow that appears in GitHub's UI. Using the `on` field, we set the workflow to run every 30 minutes and through a manual trigger.

- Job definition:

```yaml
jobs:
  run_script:
    runs-on: ubuntu-latest
```

`jobs` contains all the jobs in this workflow and it has a `run_script` name, which is a unique identifier.

- Steps:

There are five steps that run sequentially in this workflow. They are given descriptive names that appear in the GitHub UI and uses official GitHub actions and custom terminal commands.

```yaml
jobs:
  monitor:
    runs-on: ubuntu-latest
    
    steps:
      - name: Check out repository
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
      
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: Run tests
        run: pytest tests/
      
      - name: Collect system metrics
        run: python main.py
```

Here is what each step does:

1. Check out repository code with `actions/checkout@v3`.
2. Configures Python 3.9 environment.
3. Runs two terminal commands that:
    - Install/upgrade `pip`
    - Install `pytest` package
4. Runs the tests located in the `tests` directory using `pytest`.
5. Executes the main script with `python main.py`.

Notice the use of `|` (pipe) operator for multi-line commands.

After you complete writing the workflow, commit the changes to Git:

```bash
git add .
git commit -m "Add a workflow file for monitoring system resources"
```

### Creating the Python script

Now, let's write the `main.py` file, which is a monitoring script that helps software developers track system resource usage over time, enabling them to identify performance bottlenecks and capacity issues in their development environment.

```python
import psutil
import json
from datetime import datetime
from pathlib import Path
```

This script collects and logs system metrics over time. It uses `psutil` to gather CPU usage, memory usage, disk usage, and active process counts. The metrics are timestamped and saved to JSON files organized by date.

The script has three main functions:

```python
def get_system_metrics():
    """Collect key system metrics"""
    metrics = {
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory_percent": psutil.virtual_memory().percent,
        "disk_usage": psutil.disk_usage('/').percent,
        "timestamp": datetime.now().isoformat()
    }
    
    # Add running processes count
    metrics["active_processes"] = len(psutil.pids())
    
    return metrics
```

`get_system_metrics()` - Collects current system metrics including CPU percentage, memory usage percentage, disk usage percentage, timestamp, and count of active processes.

```python
def save_metrics(metrics):
    """Save metrics to a JSON file with today's date"""
    date_str = datetime.now().strftime("%Y-%m-%d")
    reports_dir = Path("system_metrics")
    reports_dir.mkdir(exist_ok=True)
    
    # Save to daily file
    file_path = reports_dir / f"metrics_{date_str}.json"
    
    # Load existing metrics if file exists
    if file_path.exists():
        with open(file_path) as f:
            daily_metrics = json.load(f)
    else:
        daily_metrics = []
    
    # Append new metrics
    daily_metrics.append(metrics)
    
    # Save updated metrics
    with open(file_path, 'w') as f:
        json.dump(daily_metrics, f, indent=2)
```

`save_metrics()` - Handles saving the metrics to JSON files. It creates a `system_metrics` directory if needed, and saves metrics to date-specific files (e.g. `metrics_2024-12-12.json`). If a file for the current date exists, it loads and appends to it, otherwise creates a new file.

```python
def main():
    try:
        metrics = get_system_metrics()
        save_metrics(metrics)
        print(f"System metrics collected at {metrics['timestamp']}")
        print(f"CPU: {metrics['cpu_percent']}% | Memory: {metrics['memory_percent']}%")
        return True
    except Exception as e:
        print(f"Error collecting metrics: {str(e)}")
        return False

if __name__ == "__main__":
    main()
```

`main()` - Orchestrates the metric collection and saving process. It calls `get_system_metrics()`, saves the data via `save_metrics()`, prints current CPU and memory usage to console, and handles any errors that occur during execution.

The script can be run directly or imported as a module. When run directly (which is what happens in a GitHub Actions workflow), it executes the `main()` function which collects and saves one set of metrics.

Combine the code snippets above into the `main.py` file and commit the changes:

```bash
git add .
git commit -m "Add the main.py functionality"
```

### Adding tests

Testing is a critical part of software engineering workflows for several reasons:

1. Reliability: Tests help ensure code behaves correctly and consistently across changes.
2. Regression prevention: Tests catch when new changes break existing functionality.
3. Documentation: Tests serve as executable documentation of expected behavior
4. Design feedback: Writing tests helps identify design issues early
5. Confidence: A good test suite gives confidence when refactoring or adding features

For our system metrics collection script, tests would be valuable to verify:

- The `get_system_metrics()` function returns data in the expected format with valid ranges
- The `save_metrics()` function properly handles file operations and JSON serialization
- Error handling works correctly for various failure scenarios
- The `main()` function orchestrates the workflow as intended

With that said, let's work on the `tests/test_main.py` file:

```python
import json
from datetime import datetime
from pathlib import Path
from main import get_system_metrics, save_metrics
```

The test file we are about to write demonstrates key principles of testing with `pytest`, a popular Python testing framework. Pytest makes it easy to write tests by using simple `assert` statements and providing a rich set of features for test organization and execution. The test functions are automatically discovered by `pytest` when their names start with `test_`, and each function tests a specific aspect of the system's functionality.

```python
def test_get_system_metrics():
    """Test if system metrics are collected correctly"""
    metrics = get_system_metrics()
    
    # Check if all required metrics exist and are valid
    assert 0 <= metrics['cpu_percent'] <= 100
    assert 0 <= metrics['memory_percent'] <= 100
    assert metrics['active_processes'] > 0
    assert 'timestamp' in metrics
```

In this example, we have two test functions that verify different components of our metrics collection system. The first test, `test_get_system_metrics()`, checks if the metrics collection function returns data in the expected format and with valid ranges. It uses multiple assert statements to verify that CPU and memory percentages are between 0 and 100, that there are active processes, and that a timestamp is included. This demonstrates the practice of testing both the structure of returned data and the validity of its values.

```python
def test_save_and_read_metrics():
    """Test if metrics are saved and can be read back"""
    # Get and save metrics
    metrics = get_system_metrics()
    save_metrics(metrics)
    
    # Check if file exists and contains data
    date_str = datetime.now().strftime("%Y-%m-%d")
    file_path = Path("system_metrics") / f"metrics_{date_str}.json"
    
    assert file_path.exists()
    with open(file_path) as f:
        saved_data = json.load(f)
    
    assert isinstance(saved_data, list)
    assert len(saved_data) > 0
```

The second test, `test_save_and_read_metrics()`, showcases integration testing by verifying that metrics can be both saved to and read from a file. It follows a common testing pattern: arrange (setup the test conditions), act (perform the operations being tested), and assert (verify the results). The test ensures that the file is created in the expected location and that the saved data maintains the correct structure. This type of test is particularly valuable as it verifies that different components of the system work together correctly.

Combine the above code snippets and commit the changes to GitHub:

```bash
git add .
git commit -m "Write tests for main.py"
```

### Running your first GitHub Actions workflow

Now that we've created our system monitoring workflow, let's set it up on GitHub and run it. First, push everything we have to a new GitHub repository:

```bash
git remote add origin https://github.com/your-username/your-repository.git
git branch -M main
git push -u origin main
```

Once the workflow file is pushed, GitHub automatically detects it and displays in the "Actions" tab of your repository. The workflow is scheduled so you don't need to do anything - the first workflow run will happen within 30 minutes (remember how we set the running interval to `*/30` with cron). Since the workflow also includes a `workflow_dispatch` field, you can trigger it manually by clicking on the "Run workflow" button.

After clicking the button, a new run appears within a few seconds (refresh if you don't see it). To see the workflow run in real-time, click on it and expand the `monitor` job. You'll see each step executing:

- Checking out repository
- Setting up Python
- Installing dependencies
- Running tests
- Collecting metrics

### Committing changes made by GitHub Actions workflows

Right now, our workflow file has a problem - while it successfully collects metrics, it doesn't commit and push the changes back to the repository. This means that although metrics are being gathered, they aren't being saved in version control. Let's modify the workflow to automatically commit and push the collected metrics:

```yaml
name: System Monitor

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
          
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          
      - name: Run tests
        run: python -m pytest
        
      - name: Collect metrics
        run: python main.py
        
      - name: Commit and push changes
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'
          git add metrics.json
          git commit -m "Update metrics" || exit 0
          git push
```

The key changes in this updated workflow are:

1. Added `permissions` block with `contents: write` to allow the workflow to push changes back to the repository.
2. Added a new "Commit and push changes" step that:
   - Configures git user identity as `github-actions` bot
   - Stages the `metrics.json` file
   - Creates a commit with message "Update metrics"
   - Pushes the changes back to the repository

The "|| exit 0" after `git commit` ensures the workflow doesn't fail if there are no changes to commit.

This allows the workflow to automatically save and version control the metrics it collects. Let's commit the changes to the workflow and push:

```bash
git add .
git commit -m "Add a commit step to the workflow file"
git push origin main
```

After this change, try running the workflow manually and verify its success by navigating to the Actions tab in your GitHub repository. You should see the workflow run and the `metrics.json` file updated with new data.

## Managing Sensitive Data and Environment Variables

When building automated workflows with GitHub Actions, proper handling of sensitive data like API keys, passwords, and access tokens is crucial for security. Let's explore best practices for managing these credentials.

### Understanding environment variables in GitHub Actions

Environment variables in GitHub Actions can be set at different levels:

- Repository level (GitHub Secrets)
- Workflow level
- Job level
- Step level

Here is how to properly configure and use them:

#### 1. Setting up the repository secrets

First, store sensitive values as repository secrets:

1. Navigate to your GitHub repository
2. Go to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add your secrets with descriptive names like:

- `API_KEY`
- `DATABASE_URL`
- `AWS_ACCESS_KEY`

#### 2. Using secrets in workflows

Reference secrets in your workflow file using the `secrets` context:

```yaml
name: Web Scraping Pipeline
# ... the rest of the file

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
      # ... the rest of the steps
          
      - name: Run scraper
        env:
          API_KEY: ${{ secrets.API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: python scraper.py
```

Above, the "Run scraper" step executes `scraper.py` which relies on two environment variables configured through the `secrets` context.

#### 3. Local development with .env files

For local development, use `.env` files to manage environment variables:

```bash
touch .env
echo "API_KEY='your-api-key-here'" >> .env
echo "DATABASE_URL='postgresql://user:pass@localhost:5432/db'" >> .env
```

Create a `.gitignore` file to prevent committing sensitive data:

```bash
echo ".env" >> .gitignore
```

#### 4. Loading environment variables in Python

Use `python-dotenv` to load variables from `.env` files:

```python
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

# Access variables
api_key = os.getenv('API_KEY')
database_url = os.getenv('DATABASE_URL')

if not api_key or not database_url:
    raise ValueError("Missing required environment variables")
```

This code demonstrates loading environment variables from a `.env` file using `python-dotenv`. The `load_dotenv()` function reads the variables, which can then be accessed via `os.getenv()`. Basic validation ensures required variables exist.

#### 5. Environment variable validation

Create a configuration class to validate environment variables:

```python
from pydantic import BaseSettings, SecretStr


class Settings(BaseSettings):
    api_key: SecretStr
    database_url: str
    debug_mode: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Initialize settings
settings = Settings()
```

This approach using Pydantic provides several advantages for environment variable management:

1. Type validation - Pydantic automatically validates types and converts values
2. Default values - The `debug_mode` demonstrates setting defaults
3. Secret handling - `SecretStr` provides secure handling of sensitive values
4. Centralized config - All environment variables are defined in one place
5. IDE support - Get autocomplete and type hints when using the settings object

The `Settings` class inherits from `BaseSettings` which automatically loads from environment variables. The `Config` class specifies to also load from a `.env` file.

Using `settings = Settings()` creates a validated configuration object that can be imported and used throughout the application. This is more robust than accessing `os.environ` directly.

Example usage:

```python
settings.api_key.get_secret_value()  # Securely access API key
settings.database_url  # Type-checked database URL
settings.debug_mode  # Boolean with default value
```

#### 6. Handle different environments

Handle different environments (development, staging, production) using environment-specific files:

```bash
.env                # Default environment variables
.env.development   # Development-specific variables
.env.staging       # Staging-specific variables
.env.production    # Production-specific variables
```

Load the appropriate file based on the environment:

```bash
from dotenv import load_dotenv
import os

env = os.getenv('ENVIRONMENT', 'development')
env_file = f'.env.{env}'

load_dotenv(env_file)
```

This approach allows you to maintain separate configurations for different environments while keeping sensitive information secure. The environment-specific files can contain different values for the same variables, such as:

- Development environment may use local services and dummy credentials
- Staging environment may use test services with restricted access
- Production environment contains real credentials and production service endpoints

You can also combine this with the `Pydantic` settings approach shown earlier for robust configuration management across environments.

For example, staging might use a test database while production uses the live database:

```bash
# .env.staging:
DATABASE_URL=postgresql://test-db.example.com
API_KEY=test-key
```

```bash
.env.production:
DATABASE_URL=postgresql://prod-db.example.com 
API_KEY=live-key
```

This separation helps prevent accidental use of production resources during development and testing.

## Building Real-World Python Workflows

Let's explore three practical examples of GitHub Actions workflows for common Python tasks: web scraping, package publishing, and container builds.

### 1. Scheduled web scraping with Firecrawl

Web scraping is a common use case for automated workflows. Let's build a workflow that scrapes [Hacker News](https://news.ycombinator.com/) on a schedule using [Firecrawl](https://docs.firecrawl.dev), which is a Python AI-based web scraping engine designed for large-scale data collection. Here are some key benefits that make Firecrawl an excellent choice for this task:

1. **Enterprise-grade automation and scalability** - Firecrawl streamlines web scraping with powerful automation features.
2. **AI-powered content extraction** - Maintains scraper reliability over time by identifying and extracting data based on semantic descriptions instead of relying HTML elements and CSS selectors.
3. **Handles complex scraping challenges** - Automatically manages proxies, anti-bot mechanisms, and dynamic JavaScript content.
4. **Multiple output formats** - Supports scraping and converting data in markdown, tabular, screenshots, and HTML, making it versatile for various applications.
5. **Built-in rate limiting and request management** - Ensures efficient and compliant data extraction.
6. **Geographic location customization** - Avoids IP bans by customizing the geographic location of requests.

Let's build our web scraping workflow using Firecrawl to demonstrate these capabilities.

```bash
# Create project directory and install dependencies
mkdir hacker-news-scraper && cd hacker-news-scraper
pip install firecrawl-py pydantic python-dotenv

# Create necessary files
touch requirements.txt scraper.py .env

# Add dependencies to requirements.txt
echo "firecrawl-py\npydantic\npython-dotenv" > requirements.txt

# Add Firecrawl API key to .env (get your key at firecrawl.dev/signin/signup)
echo "FIRECRAWL_API_KEY='your_api_key_here'" > .env
```

Open the scraper script where we define our scraping logic:

```python
# scraper.py
import json
from firecrawl import FirecrawlApp
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

load_dotenv()

BASE_URL = "https://news.ycombinator.com/"
```

First, we import necessary libraries and packages, also defining a base URL we are going to scrape.

```python
class NewsItem(BaseModel):
    title: str = Field(description="The title of the news item")
    source_url: str = Field(description="The URL of the news item")
    author: str = Field(
        description="The URL of the post author's profile concatenated with the base URL."
    )
    rank: str = Field(description="The rank of the news item")
    upvotes: str = Field(description="The number of upvotes of the news item")
    date: str = Field(description="The date of the news item.")


class NewsData(BaseModel):
    news_items: List[NewsItem]
```

We define two Pydantic models to structure our scraped data:

1. `NewsItem` - Represents a single news item with fields for title, URL, author, rank, upvotes and date
2. `NewsData` - Contains a list of `NewsItem` objects

These models help validate the scraped data and ensure it matches our expected schema. They also make it easier to serialize/deserialize the data when saving to JSON. Using `Field` with a detailed description is crucial because Firecrawl uses these definitions to automatically detect the HTMl elements and CSS selectors we are looking for.

```python
def get_news_data():
    app = FirecrawlApp()

    data = app.scrape_url(
        BASE_URL,
        params={
            "formats": ["extract"],
            "extract": {"schema": NewsData.model_json_schema()},
        },
    )

    return data
```

The `get_news_data()` function uses Firecrawl to scrape Hacker News. It creates a `FirecrawlApp` instance and calls `scrape_url()` with the `BASE_URL` and parameters specifying we want to extract data according to our `NewsData` schema. The schema helps Firecrawl automatically identify and extract the relevant HTML elements. The function returns the scraped data containing news items with their titles, URLs, authors, ranks, upvotes and dates.

```python
def save_firecrawl_news_data():
    """
    Save the scraped news data to a JSON file with the current date in the filename.
    """
    # Get the data
    data = get_news_data()
    # Format current date for filename
    date_str = datetime.now().strftime("%Y_%m_%d_%H_%M")
    filename = f"firecrawl_hacker_news_data_{date_str}.json"

    # Save the news items to JSON file
    with open(filename, "w") as f:
        json.dump(data["extract"]["news_items"], f, indent=4)

    print(f"{datetime.now()}: Successfully saved the news data.")
    
if __name__ == "__main__":
    save_firecrawl_news_data()

```

The `save_firecrawl_news_data()` function handles saving the scraped Hacker News data to a JSON file. It first calls `get_news_data()` to fetch the latest data from Hacker News. Then it generates a filename using the current timestamp to ensure uniqueness. The data is saved to a JSON file with that filename, with the news items formatted with proper indentation for readability. Finally, it prints a confirmation message with the current timestamp when the save is complete. This function provides a convenient way to store snapshots of Hacker News data that can be analyzed later.

Combine these snippets into the `scraper.py` script. Then, we can write a workflow that executes it on schedule:

```bash
cd ..  # Change back to the project root directory
touch .github/workflows/hacker-news-scraper.py  # Create the workflow file
```

Here is what the workflow file must look like:

```yaml
name: Run Hacker News Scraper

permissions:
  contents: write

on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.10"
          
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r hacker-news-scraper/requirements.txt
          
      - name: Run scraper
        run: python hacker-news-scraper/scraper.py
        
      - name: Commit and push if changes
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add .
          git commit -m "Update scraped data" -a || exit 0
          git push
```

This workflow runs our Hacker News scraper every 6 hours using GitHub Actions. It sets up Python, installs dependencies, executes the scraper, and automatically commits any new data to the repository. The workflow can also be triggered manually using the `workflow_dispatch` event. One important note about the paths specified in the workflow file is that they must match your repository's directory structure exactly, including the requirements.txt location and the path to your scraper script.

To enable the workflow, simply push all the changes to GitHub and test it through the UI. The next runs will be automatic.

```bash
git add .
git commit -m "Add a scraping workflow"
git push origin main
```

### 2. Package publishing workflow

Publishing Python packages to PyPI (Python Package Index) typically involves several steps. First, developers need to prepare their package by creating a proper directory structure, writing setup files, and ensuring all metadata is correct. Then, the package needs to be built into distribution formats - both source distributions (`sdist`) and wheel distributions (`bdist_wheel`). Finally, these distribution files are uploaded to PyPI using tools like `twine`. This process often requires careful version management and proper credentials for the package repository. While this can be done manually, automating it with CI/CD pipelines like GitHub Actions ensures consistency and reduces human error in the release process.

For example, the following workflow publishes a new version of a package when you create a new release:

```yaml
name: Publish Python Package
on:
  release:
    types: [created]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
          
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install build twine
          
      - name: Build package
        run: python -m build
        
      - name: Publish to PyPI
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_API_TOKEN }}
        run: |
          python -m twine upload dist/*
```

The workflow automates publishing Python packages to PyPI when GitHub releases are created.

Required setup steps:

1. Package must have `setup.py` or `pyproject.toml` configured
2. Create PyPI account at `pypi.org`
3. Generate PyPI API token with upload permissions
4. Store token as `PYPI_API_TOKEN` in repository secrets

The workflow process:

1. Triggers on new GitHub release
2. Checks out code and sets up Python
3. Installs build tools
4. Creates distribution packages
5. Uploads to PyPI using stored token

The `__token__` username is used with PyPI's token authentication, while the actual token is accessed securely through GitHub secrets.

### 3. Container build and push workflow

GitHub Actions can also automate building and pushing Docker containers to container registries like Docker Hub or GitHub Container Registry (GHCR). This workflow is useful for maintaining containerized applications and ensuring your latest code changes are packaged into updated container images.

The process typically involves:

1. Building a Docker image from your `Dockerfile`
2. Tagging the image with version/metadata
3. Authenticating with the container registry
4. Pushing the tagged image to the registry

This automation ensures your container images stay in sync with code changes and are readily available for deployment. Here is a sample workflow containing these steps:

```yaml
name: Build and Push Container
on:
  push:
    branches: [main]
    paths:
      - 'Dockerfile'
      - 'src/**'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
        
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
          
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: |
            user/app:latest
            user/app:${{ github.sha }}
```

This workflow introduces a few new GitHub Actions concepts and syntax:

The `paths` trigger filter ensures the workflow only runs when changes are made to the Dockerfile or files in the `src` directory, preventing unnecessary builds.

`docker/setup-buildx-action` configures Docker Buildx, which provides enhanced build capabilities including multi-platform builds and build caching.

`docker/login-action` handles registry authentication. Before using this, you must:

1. [Create a Docker Hub account](https://app.docker.com/signup)
2. Generate an access token in Docker Hub settings
3. Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as repository secrets in GitHub

`docker/build-push-action` is a specialized action for building and pushing Docker images. The configuration shows:

- `context: .` (builds from current directory)
- `push: true` (automatically pushes after building)
- `tags:` specifies multiple tags including:
  - `latest:` rolling tag for most recent version
  - `github.sha:` unique tag using commit hash for versioning

The workflow assumes you have:

- A valid Dockerfile in your repository
- Required application code in `src` directory
- Docker Hub repository permissions
- Properly configured repository secrets

When this workflow runs successfully, it produces a containerized version of your application that is automatically published to Docker Hub and can be pulled with either the latest tag or specific commit hash.

## Understanding How GitHub Actions Run

When you trigger a GitHub Actions run, whether manually or through automated events, the platform:

1. Provisions a fresh virtual machine (runner)
2. Executes your workflow steps sequentially
3. Reports results back to GitHub
4. Tears down the runner environment

This isolated execution model ensures consistency and security for each GitHub Actions run.

## Glossary of GitHub Actions Terms

- **GitHub Actions**: GitHub's built-in automation platform for software development workflows
- **GitHub Actions Workflow**: A configurable automated process made up of one or more jobs
- **GitHub Actions Jobs**: Individual units of work that can run sequentially or in parallel
- **GitHub Actions Run**: A single execution instance of a workflow
- **GitHub Actions Environment Variables**: Configuration values available during workflow execution
- **GitHub Actions Secrets**: Encrypted environment variables for sensitive data
- **GitHub Actions Tutorial**: A guide teaching the fundamentals of GitHub Actions (like this one!)

## Conclusion

Throughout this tutorial, we've explored the fundamentals and practical applications of GitHub Actions for Python development. From understanding core concepts like workflows, jobs, and actions, to implementing real-world examples including automated testing, web scraping, package publishing, and container builds, you've gained hands-on experience with this powerful automation platform. We've also covered critical aspects like managing sensitive data through environment variables and secrets, ensuring your automated workflows are both secure and maintainable.

As you continue your journey with GitHub Actions, remember that automation is an iterative process. Start small with basic workflows, test thoroughly, and gradually add complexity as needed. The examples provided here serve as templates that you can adapt and expand for your specific use cases. For further learning, explore the [GitHub Actions documentation](https://docs.github.com/en/actions), join the [GitHub Community Forum](https://github.community/), and experiment with the vast ecosystem of pre-built actions available in the [GitHub Marketplace](https://github.com/marketplace?type=actions). Whether you're building a personal project or managing enterprise applications, GitHub Actions provides the tools you need to streamline your development workflow and focus on what matters most - writing great code.

If you want to learn more about Firecrawl, the web scraping API we used today, you can read the following posts:

- [Guide to Scheduling Web Scrapers in Python](https://www.firecrawl.dev/blog/automated-web-scraping-free-2025)
- [Mastering Firecrawl's Scrape Endpoint](https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint)
- [Getting Started With Predicted Outputs in OpenAI](https://www.firecrawl.dev/blog/getting-started-with-predicted-outputs-openai)

Thank you for reading!
