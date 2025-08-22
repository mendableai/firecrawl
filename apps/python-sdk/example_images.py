"""
Image Extraction Examples - Firecrawl Python SDK v2

This example demonstrates how to use the new 'images' format
to extract all images from webpages.
"""

from firecrawl.client import Firecrawl

def main():
    # Initialize Firecrawl client
    firecrawl = Firecrawl(api_key="YOUR_API_KEY")
    
    print("🖼️  Image Extraction Examples")
    print("============================\n")

    try:
        # Example 1: Extract only images
        print("1. Extract only images from a webpage:")
        images_only = firecrawl.scrape("https://news.ycombinator.com", formats=["images"])
        
        images_count = len(images_only.images) if images_only.images else 0
        print(f"   Found {images_count} images:")
        
        if images_only.images:
            for i, img in enumerate(images_only.images[:3], 1):
                print(f"   {i}. {img}")
            if len(images_only.images) > 3:
                print(f"   ... and {len(images_only.images) - 3} more")

        # Example 2: Extract images + content + links  
        print("\n2. Extract images along with content and links:")
        comprehensive = firecrawl.scrape("https://github.com", formats=["markdown", "links", "images"])

        markdown_length = len(comprehensive.markdown) if comprehensive.markdown else 0
        links_count = len(comprehensive.links) if comprehensive.links else 0
        images_count = len(comprehensive.images) if comprehensive.images else 0
        
        print(f"   Markdown content: {markdown_length} characters")
        print(f"   Links found: {links_count}")
        print(f"   Images found: {images_count}")

        # Example 3: Show the value of images vs links
        print("\n3. Comparison: Images vs Links with image extensions:")
        if comprehensive.links and comprehensive.images:
            image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico']
            link_images = [
                link for link in comprehensive.links 
                if any(ext in link.lower() for ext in image_extensions)
            ]
            
            print(f"   Links that look like images: {len(link_images)}")
            print(f"   Actual images found: {len(comprehensive.images)}")
            print(f"   Additional images discovered: {len(comprehensive.images) - len(link_images)}")
            
            # Show images that wouldn't be found via links
            unique_images = [
                img for img in comprehensive.images 
                if img not in (comprehensive.links or [])
            ]
            
            if unique_images:
                print(f"\n   Images not in links (from meta tags, CSS, etc.):")
                for img in unique_images[:2]:
                    print(f"   - {img}")

        # Example 4: Using ScrapeFormats class (boolean syntax)
        print("\n4. Using ScrapeFormats class:")
        from firecrawl.v2.types import ScrapeFormats
        
        formats = ScrapeFormats(
            markdown=True,
            images=True,
            links=False,
            html=False
        )
        
        boolean_syntax = firecrawl.scrape("https://httpbin.org/html", formats=formats)
        images_found = len(boolean_syntax.images) if boolean_syntax.images else 0
        print(f"   Images found: {images_found}")

        # Example 5: Batch scraping with images
        print("\n5. Batch scraping with image extraction:")
        urls = [
            "https://httpbin.org/html",
            "https://news.ycombinator.com"
        ]
        
        batch_result = firecrawl.batch_scrape(urls, formats=["images"], poll_interval=1)
        
        if batch_result.status == "completed" and batch_result.data:
            total_images = 0
            for i, doc in enumerate(batch_result.data):
                doc_images = len(doc.images) if doc.images else 0
                total_images += doc_images
                print(f"   URL {i+1}: {doc_images} images")
            print(f"   Total images across all pages: {total_images}")

    except Exception as error:
        print(f"Error: {error}")

# Helper functions for advanced usage
class ImageExtractor:
    """Helper class for image extraction operations."""
    
    def __init__(self, api_key: str):
        self.client = Firecrawl(api_key=api_key)
    
    async def extract_images_only(self, url: str) -> list[str]:
        """Extract only images from a URL."""
        result = self.client.scrape(url, formats=["images"])
        return result.images or []
    
    async def extract_with_context(self, url: str) -> dict:
        """Extract images with page context."""
        result = self.client.scrape(url, formats=["markdown", "images"])
        
        return {
            "url": url,
            "title": result.metadata.title if result.metadata else "Untitled",
            "content_length": len(result.markdown) if result.markdown else 0,
            "images": result.images or [],
            "image_count": len(result.images) if result.images else 0
        }
    
    def categorize_images(self, images: list[str]) -> dict[str, list[str]]:
        """Categorize images by type based on URL patterns."""
        categories = {
            "external_cdn": [],
            "social_media": [],
            "icons": [],
            "content": [],
            "data_uri": []
        }
        
        for img in images:
            if img.startswith("data:"):
                categories["data_uri"].append(img)
            elif any(x in img.lower() for x in ["og-image", "twitter-image"]):
                categories["social_media"].append(img)
            elif any(x in img.lower() for x in ["favicon", "icon", "apple-touch"]):
                categories["icons"].append(img)
            elif any(x in img for x in ["cdn.", "assets.", "static."]):
                categories["external_cdn"].append(img)
            else:
                categories["content"].append(img)
        
        return categories

if __name__ == "__main__":
    main()
