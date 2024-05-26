from pathlib import Path
from setuptools import setup, find_packages

this_directory = Path(__file__).parent
long_description_content = (this_directory / "README.md").read_text()

setup(
    name='firecrawl-py',
    version='0.0.9',
    url='https://github.com/mendableai/firecrawl',
    author='Mendable.ai',
    author_email='nick@mendable.ai',
    description='Python SDK for Firecrawl API',
    long_description=long_description_content,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    install_requires=[
        'requests',
    ],
)
