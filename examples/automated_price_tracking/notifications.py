from dotenv import load_dotenv
import os
import aiohttp
import asyncio

load_dotenv()


async def send_price_alert(
    product_name: str, old_price: float, new_price: float, url: str
):
    """Send a price drop alert to Discord"""
    drop_percentage = ((old_price - new_price) / old_price) * 100

    message = {
        "embeds": [
            {
                "title": "Price Drop Alert! 🎉",
                "description": f"**{product_name}**\nPrice dropped by {drop_percentage:.1f}%!\n"
                f"Old price: ${old_price:.2f}\n"
                f"New price: ${new_price:.2f}\n"
                f"[View Product]({url})",
                "color": 3066993,
            }
        ]
    }

    try:
        async with aiohttp.ClientSession() as session:
            await session.post(os.getenv("DISCORD_WEBHOOK_URL"), json=message)
    except Exception as e:
        print(f"Error sending Discord notification: {e}")


if __name__ == "__main__":
    asyncio.run(send_price_alert("Test Product", 100, 90, "https://www.google.com"))
