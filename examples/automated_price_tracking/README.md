# Automated Price Tracking System

A robust price tracking system that monitors product prices across e-commerce websites and notifies users of price changes through Discord.

## Features

- Automated price checking every 6 hours
- Support for multiple e-commerce platforms through Firecrawl API
- Discord notifications for price changes
- Historical price data storage in PostgreSQL database
- Interactive price history visualization with Streamlit

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` with your:
   - Discord webhook URL
   - Database credentials
   - Firecrawl API key
