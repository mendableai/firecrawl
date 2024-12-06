import os
import asyncio
from database import Database
from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from scraper import scrape_product
from notifications import send_price_alert

load_dotenv()

db = Database(os.getenv("POSTGRES_URL"))
app = FirecrawlApp()

# Threshold percentage for price drop alerts (e.g., 5% = 0.05)
PRICE_DROP_THRESHOLD = 0.05


async def check_prices():
    products = db.get_all_products()
    product_urls = set(product.url for product in products)

    for product_url in product_urls:
        # Get the price history
        price_history = db.get_price_history(product_url)
        if not price_history:
            continue

        # Get the earliest recorded price
        earliest_price = price_history[-1].price

        # Retrieve updated product data
        updated_product = scrape_product(product_url)
        current_price = updated_product["price"]

        # Add the price to the database
        db.add_price(updated_product)
        print(f"Added new price entry for {updated_product['name']}")

        # Check if price dropped below threshold
        if earliest_price > 0:  # Avoid division by zero
            price_drop = (earliest_price - current_price) / earliest_price
            if price_drop >= PRICE_DROP_THRESHOLD:
                await send_price_alert(
                    updated_product["name"], earliest_price, current_price, product_url
                )


if __name__ == "__main__":
    asyncio.run(check_prices())
