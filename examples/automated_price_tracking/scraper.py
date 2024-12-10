from firecrawl import FirecrawlApp
from pydantic import BaseModel, Field
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
app = FirecrawlApp()


class Product(BaseModel):
    """Schema for creating a new product"""

    url: str = Field(description="The URL of the product")
    name: str = Field(description="The product name/title")
    price: float = Field(description="The current price of the product")
    currency: str = Field(description="Currency code (USD, EUR, etc)")
    main_image_url: str = Field(description="The URL of the main image of the product")


def scrape_product(url: str):
    extracted_data = app.scrape_url(
        url,
        params={
            "formats": ["extract"],
            "extract": {"schema": Product.model_json_schema()},
        },
    )

    # Add the scraping date to the extracted data
    extracted_data["extract"]["timestamp"] = datetime.utcnow()

    return extracted_data["extract"]


if __name__ == "__main__":
    product = "https://www.amazon.com/gp/product/B002U21ZZK/"

    print(scrape_product(product))
