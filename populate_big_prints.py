#!/usr/bin/env python3
"""
Script to populate big_prints.json with top 10 ranked prints (rank 30 or better)
for all tickers in the TrendSpider ticker list using 90-day lookback.
"""

import json
import requests
import sys
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

def get_date_range(days_back=90):
    """Calculate date range for the past N days (excluding weekends)"""
    end_date = datetime.now()
    
    # If today is weekend, use Friday as end date
    if end_date.weekday() == 5:  # Saturday
        end_date = end_date - timedelta(days=1)
    elif end_date.weekday() == 6:  # Sunday
        end_date = end_date - timedelta(days=2)
    
    # Calculate start date
    start_date = end_date - timedelta(days=days_back)
    
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')

def convert_dotnet_timestamp(timestamp_str):
    """Convert /Date(1748563200000)/ format to Unix timestamp"""
    if not timestamp_str or not timestamp_str.startswith('/Date('):
        return None
    
    # Extract the timestamp from /Date(...)/ format
    match = re.search(r'/Date\((\d+)\)/', timestamp_str)
    if match:
        # The timestamp is already in milliseconds, convert to seconds for Unix timestamp
        return int(match.group(1)) // 1000
    return None

def load_ticker_list():
    """Load tickers from the ticker_list.json file"""
    ticker_file = Path(__file__).parent / 'ticker_list.json'
    
    try:
        with open(ticker_file, 'r') as f:
            data = json.load(f)
            return data.get('tickers', [])
    except FileNotFoundError:
        print(f"Error: ticker_list.json not found at {ticker_file}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in ticker_list.json: {e}")
        return []

def get_cookies():
    """Load cookies from cookies.json file"""
    try:
        cookies_file = Path(__file__).parent.parent / 'cookies.json'
        with open(cookies_file, 'r') as f:
            cookies_list = json.load(f)
            # Convert the list to a cookie string
            cookie_header = "; ".join([f"{cookie['name']}={cookie['value']}" for cookie in cookies_list])
            return cookie_header
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading cookies.json: {e}")
        print("Please make sure cookies.json exists and is properly formatted")
        sys.exit(1)

def fetch_big_prints_for_ticker(ticker, start_date, end_date):
    """Fetch big prints (rank 30 or better) for a single ticker"""
    
    # Get cookies
    cookie_header = get_cookies()
    
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookie_header,
        "Referer": f"https://www.volumeleaders.com/Trades?Tickers={ticker}&StartDate={start_date}&EndDate={end_date}",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    }

    # Column definitions for the API
    columns = [
        {"data": "DateTime", "name": "Date/Time", "searchable": "true", "orderable": "true"},
        {"data": "Dollars", "name": "$$", "searchable": "true", "orderable": "true"},
        {"data": "Price", "name": "Price", "searchable": "true", "orderable": "true"},
        {"data": "Volume", "name": "Volume", "searchable": "true", "orderable": "true"},
        {"data": "Conditions", "name": "Conditions", "searchable": "true", "orderable": "false"},
        {"data": "RelativeSize", "name": "Relative Size", "searchable": "true", "orderable": "true"},
        {"data": "VolumeConcentrationRatio", "name": "VCD", "searchable": "true", "orderable": "true"},
        {"data": "Exchange", "name": "Exchange", "searchable": "true", "orderable": "false"},
        {"data": "SecurityTypeDisplay", "name": "Type", "searchable": "true", "orderable": "false"},
        {"data": "Symbol", "name": "Symbol", "searchable": "true", "orderable": "false"},
        {"data": "IsDarkPool", "name": "Dark Pool", "searchable": "true", "orderable": "false"},
        {"data": "TradeRank", "name": "Rank", "searchable": "true", "orderable": "true"},
        {"data": "FullTimeString24", "name": "Time", "searchable": "true", "orderable": "true"},
        {"data": "Date", "name": "Date", "searchable": "true", "orderable": "true"},
        {"data": "DateKey", "name": "DateKey", "searchable": "true", "orderable": "true"}
    ]

    # Base payload for the API request
    payload = {
        "draw": "1",
        "start": "0", 
        "length": "1000",  # Get more results to filter
        "search[value]": "",
        "search[regex]": "false",
        "Tickers": ticker,
        "SectorIndustry": "",
        "StartDate": start_date,
        "EndDate": end_date,
        "MinVolume": "0",
        "MaxVolume": "2000000000",
        "MinPrice": "0",
        "MaxPrice": "100000",
        "MinDollars": "500000",  # 500K minimum for big prints
        "MaxDollars": "300000000000",
        "Conditions": "0",
        "VCD": "0",
        "SecurityTypeKey": "-1",
        "RelativeSize": "0",
        "DarkPools": "-1",
        "Sweeps": "-1",
        "LatePrints": "-1",
        "SignaturePrints": "-1",
        "EvenShared": "-1",
        "TradeRank": "30",  # Only rank 30 or better
        "IncludePremarket": "1",
        "IncludeRTH": "1",
        "IncludeAH": "1",
        "IncludeOpening": "1",
        "IncludeClosing": "1",
        "IncludePhantom": "1",
        "IncludeOffsetting": "1",
        "order[0][column]": "11",  # Sort by TradeRank
        "order[0][dir]": "ASC"     # Best ranks first
    }

    # Add column configurations to payload
    for i, col in enumerate(columns):
        payload[f"columns[{i}][data]"] = col["data"]
        payload[f"columns[{i}][name]"] = col["name"]
        payload[f"columns[{i}][searchable]"] = col["searchable"]
        payload[f"columns[{i}][orderable]"] = col["orderable"]
        payload[f"columns[{i}][search][value]"] = ""
        payload[f"columns[{i}][search][regex]"] = "false"

    url = "https://www.volumeleaders.com/Trades/GetTrades"
    
    try:
        print(f"Fetching big prints for {ticker} from {start_date} to {end_date}...")
        
        response = requests.post(url, headers=headers, data=payload, timeout=60)
        
        if response.status_code == 200:
            try:
                data = response.json()
                if 'data' in data and data['data']:
                    # Filter for rank 30 or better and take top 10
                    big_prints = []
                    for trade in data['data']:
                        rank = trade.get('TradeRank', 999)
                        if rank != '' and rank is not None:
                            try:
                                rank_int = int(rank)
                                if rank_int <= 30:  # Rank 30 or better
                                    big_prints.append(trade)
                            except (ValueError, TypeError):
                                continue
                    
                    # Sort by rank (best first) and take top 10
                    big_prints.sort(key=lambda x: int(x.get('TradeRank', 999)))
                    return big_prints[:10]  # Top 10 only
                else:
                    print(f"No big prints found for {ticker}")
                    return []
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for {ticker}: {e}")
                return []
        else:
            print(f"Error fetching data for {ticker}: HTTP {response.status_code}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed for {ticker}: {e}")
        return []

def format_timestamp(trade):
    """Extract and convert timestamp from trade data to Unix timestamp"""
    # First try to get the timestamp from the Date field (which contains /Date(...) format)
    date_field = trade.get('Date', '')
    if date_field:
        unix_timestamp = convert_dotnet_timestamp(date_field)
        if unix_timestamp:
            return unix_timestamp
    
    # Fallback to DateTime field if Date field is not available
    datetime_field = trade.get('DateTime', '')
    if datetime_field:
        unix_timestamp = convert_dotnet_timestamp(datetime_field)
        if unix_timestamp:
            return unix_timestamp
    
    # If neither field has the /Date(...) format, return None
    # This ensures we either get a proper Unix timestamp or nothing
    return None

def convert_to_big_prints_format(ticker, prints_data, start_date, end_date):
    """Convert the VolumeLeaders trade data to big_prints.json format"""
    converted_prints = []
    
    for i, trade in enumerate(prints_data):
        try:
            # Parse the trade data
            price = float(trade.get('Price', 0))
            volume = int(trade.get('Volume', 0))
            dollars = float(trade.get('Dollars', 0))
            rank = int(trade.get('TradeRank', 999))
            conditions = trade.get('Conditions', '')
            exchange = trade.get('Exchange', '')
            is_dark_pool = trade.get('IsDarkPool', False)
            relative_size = float(trade.get('RelativeSize', 0))
            vcd = float(trade.get('VolumeConcentrationRatio', 0))
            
            # Get properly formatted timestamp
            timestamp = format_timestamp(trade)
            
            converted_print = {
                "symbol": ticker,
                "timestamp": timestamp,
                "price": price,
                "volume": volume,
                "dollars": int(dollars),
                "rank": rank,
                "conditions": conditions,
                "exchange": exchange,
                "is_dark_pool": is_dark_pool,
                "relative_size": relative_size,
                "vcd": vcd,
                "print_number": i + 1  # 1-10 for each ticker
            }
            
            converted_prints.append(converted_print)
            
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error converting print data for {ticker}: {e}")
            continue
    
    return converted_prints

def save_big_prints_data(all_prints, start_date, end_date):
    """Save the compiled data to big_prints.json"""
    output_file = Path(__file__).parent / 'big_prints.json'
    
    # Create the output structure
    output_data = {
        "metadata": {
            "source": "volumeleaders.com",
            "generated_at": datetime.now().isoformat() + "Z",
            "description": "Top 10 big prints (rank 30 or better) from VolumeLeaders trade data",
            "date_range": f"{start_date} to {end_date}",
            "criteria": "Top 10 prints per ticker with rank 30 or better over 90-day lookback period",
            "min_dollars": 500000,
            "script": "populate_big_prints.py"
        },
        "big_prints": all_prints
    }
    
    try:
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\n✅ Successfully saved {len(all_prints)} big prints to {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving data to {output_file}: {e}")
        return False

def main():
    """Main function to populate big_prints.json"""
    print("🔄 Starting TrendSpider big prints population...")
    
    # Load ticker list
    tickers = load_ticker_list()
    if not tickers:
        print("❌ No tickers found in ticker_list.json")
        sys.exit(1)
    
    print(f"📋 Found {len(tickers)} tickers: {', '.join(tickers)}")
    
    # Get date range (90 days back)
    start_date, end_date = get_date_range(90)
    print(f"📅 Date range: {start_date} to {end_date}")
    print(f"🎯 Filtering for rank 30 or better, top 10 per ticker")
    
    # Fetch data for each ticker
    all_prints = []
    successful_tickers = []
    failed_tickers = []
    
    for ticker in tickers:
        print(f"\n🔍 Processing {ticker}...")
        
        prints_data = fetch_big_prints_for_ticker(ticker, start_date, end_date)
        
        if prints_data:
            converted_prints = convert_to_big_prints_format(ticker, prints_data, start_date, end_date)
            if converted_prints:
                all_prints.extend(converted_prints)
                successful_tickers.append(ticker)
                print(f"✅ {ticker}: Added {len(converted_prints)} big prints")
            else:
                print(f"⚠️ {ticker}: No valid big prints found")
                failed_tickers.append(ticker)
        else:
            print(f"❌ {ticker}: Failed to fetch data")
            failed_tickers.append(ticker)
    
    # Save the results
    print(f"\n📊 Summary:")
    print(f"  • Successful: {len(successful_tickers)} tickers")
    print(f"  • Failed: {len(failed_tickers)} tickers")
    print(f"  • Total big prints: {len(all_prints)}")
    
    if successful_tickers:
        print(f"  • Success: {', '.join(successful_tickers)}")
    
    if failed_tickers:
        print(f"  • Failed: {', '.join(failed_tickers)}")
    
    if all_prints:
        if save_big_prints_data(all_prints, start_date, end_date):
            print("\n🎯 TrendSpider big prints population complete!")
        else:
            print("\n❌ Failed to save big prints data")
            sys.exit(1)
    else:
        print("\n⚠️ No big prints data collected - nothing to save")
        sys.exit(1)

if __name__ == "__main__":
    main() 