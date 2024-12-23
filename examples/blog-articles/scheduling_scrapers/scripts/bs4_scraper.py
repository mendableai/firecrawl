import json
import requests

from bs4 import BeautifulSoup
from pydantic import BaseModel
from datetime import datetime


class NewsItem(BaseModel):
    title: str
    source_url: str
    author: str
    rank: str
    upvotes: str
    date: str


BASE_URL = "https://news.ycombinator.com/"


def get_page_content():
    """
    Send a GET request to the Hacker News homepage and return the HTML content.
    """
    response = requests.get(BASE_URL)
    return response.text


def get_title_rows(html_content, class_name):
    """
    Parse the HTML content and return the first table row.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    title_rows = soup.find("table").find_all("tr", {"class": class_name})
    return title_rows


def get_subtext_rows(html_content):
    """
    Parse the HTML content and return the subtext row.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    subtext_rows = soup.find("table").find_all("td", {"class": "subtext"})
    return subtext_rows


def get_news_data():
    """
    Extract the news data from the table row.
    """
    title_rows = get_title_rows(get_page_content(), "athing submission")
    subtext_rows = get_subtext_rows(get_page_content())

    news_data = []

    for title_row, subtext_row in zip(title_rows, subtext_rows):
        # Extract title information from the title row
        title_span = title_row.find("span", {"class": "titleline"})
        title = title_span.a.text
        url = title_span.a["href"]
        rank = title_row.find("span", {"class": "rank"}).text

        # Extract metadata from the subtext row
        author = BASE_URL + subtext_row.find("a", {"class": "hnuser"})["href"]
        upvotes = subtext_row.find("span", {"class": "score"}).text
        date = subtext_row.find("span", {"class": "age"}).get("title").split(" ")[0]

        news_data.append(
            NewsItem(
                title=title,
                source_url=url,
                author=author,
                rank=rank,
                upvotes=upvotes,
                date=date,
            )
        )

    return news_data


def save_news_data():
    """
    Save the scraped news data to a JSON file with the current date in the filename.
    """

    news_data = get_news_data()
    current_date = datetime.now().strftime("%Y_%m_%d_%H_%M")
    filename = f"hacker_news_data_{current_date}.json"

    with open(filename, "w") as f:
        json.dump([item.dict() for item in news_data], f, indent=4)

    return filename


if __name__ == "__main__":
    save_news_data()
