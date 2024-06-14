"""
This is the Firecrawl package.

This package provides a Python SDK for interacting with the Firecrawl API.
It includes methods to scrape URLs, perform searches, initiate and monitor crawl jobs,
and check the status of these jobs.

For more information visit https://github.com/firecrawl/
"""

import logging
import os

from .firecrawl import FirecrawlApp

__version__ = "0.0.16"

# Define the logger for the Firecrawl project
logger: logging.Logger = logging.getLogger("firecrawl")


def _basic_config() -> None:
    """Set up basic configuration for logging with a specific format and date format."""
    try:
        logging.basicConfig(
            format="[%(asctime)s - %(name)s:%(lineno)d - %(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    except Exception as e:
        logger.error("Failed to configure logging: %s", e)


def setup_logging() -> None:
    """Set up logging based on the FIRECRAWL_LOGGING_LEVEL environment variable."""
    env = os.environ.get(
        "FIRECRAWL_LOGGING_LEVEL", "INFO"
    ).upper()  # Default to 'INFO' level
    _basic_config()

    if env == "DEBUG":
        logger.setLevel(logging.DEBUG)
    elif env == "INFO":
        logger.setLevel(logging.INFO)
    elif env == "WARNING":
        logger.setLevel(logging.WARNING)
    elif env == "ERROR":
        logger.setLevel(logging.ERROR)
    elif env == "CRITICAL":
        logger.setLevel(logging.CRITICAL)
    else:
        logger.setLevel(logging.INFO)
        logger.warning("Unknown logging level: %s, defaulting to INFO", env)


# Initialize logging configuration when the module is imported
setup_logging()
logger.debug("Debugging logger setup")
