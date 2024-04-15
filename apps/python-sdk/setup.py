from setuptools import setup, find_packages

setup(
    name='firecrawl-py',
    version='0.0.5',
    url='https://github.com/mendableai/firecrawl-py',
    author='Mendable.ai',
    author_email='nick@mendable.ai',
    description='Python SDK for Firecrawl API',
    packages=find_packages(),    
    install_requires=[
        'requests',
    ],
)
