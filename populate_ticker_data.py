#!/usr/bin/env python3
"""
Script to populate individual ticker data files with big prints, support/resistance levels, 
and price boxes for each ticker in the TrendSpider ticker list.
Creates one JSON file per ticker with structure: {prints, levels, boxes}
"""

import json
import requests
import subprocess
import sys
import os
import argparse
import re
import signal
import gc
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from tqdm import tqdm
import random

def retry_with_backoff(func, max_retries=3, base_delay=1.0, max_delay=60.0):
    """
    Retry a function with exponential backoff
    
    Args:
        func: Function to retry (should be a lambda or callable)
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
    
    Returns:
        Result of the function call
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            
            if attempt == max_retries:
                # Last attempt failed, raise the exception
                raise last_exception
            
            # Calculate delay with exponential backoff and jitter
            delay = min(base_delay * (2 ** attempt), max_delay)
            jitter = random.uniform(0.1, 0.3) * delay  # Add 10-30% jitter
            total_delay = delay + jitter
            
            print(f"Attempt {attempt + 1} failed: {e}. Retrying in {total_delay:.1f}s...")
            time.sleep(total_delay)
    
    # This should never be reached, but just in case
    raise last_exception

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

def load_ticker_list():
    """Load base_tickers from the volumeleaders_config.json file"""
    config_file = Path(__file__).parent.parent / 'moe-bot' / 'volumeleaders_config.json'
    
    try:
        with open(config_file, 'r') as f:
            data = json.load(f)
            base_tickers = data.get('base_tickers', [])
            print(f"Loaded {len(base_tickers)} base_tickers from volumeleaders_config.json")
            return base_tickers
    except FileNotFoundError:
        print(f"Error: volumeleaders_config.json not found at {config_file}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in volumeleaders_config.json: {e}")
        return []

# Import VL auth utilities from moe-bot shared module
sys.path.insert(0, str(Path(__file__).parent.parent / 'moe-bot'))
from shared.vl_auth import get_vl_cookie, get_vl_xsrf_token, get_vl_headers, check_vl_auth_ready

def get_cookies():
    """Load cookies from cookie_string.txt or cookies.json file (legacy compatibility)"""
    return get_vl_cookie()

def get_xsrf_token():
    """Load XSRF token (required as of Jan 2026)"""
    return get_vl_xsrf_token()

def get_auth_headers(referer_ticker="", start_date="", end_date=""):
    """Get complete headers with cookie and XSRF token for VL API requests"""
    return get_vl_headers(referer_ticker=referer_ticker, start_date=start_date, end_date=end_date)

def convert_dotnet_timestamp(timestamp_str):
    """Convert /Date(1748563200000)/ format to Unix timestamp with timezone adjustment"""
    if not timestamp_str or not timestamp_str.startswith('/Date('):
        return None
    
    # Extract the timestamp from /Date(...)/ format
    match = re.search(r'/Date\((\d+)\)/', timestamp_str)
    if match:
        # The timestamp is in milliseconds, convert to seconds for Unix timestamp
        timestamp_seconds = int(match.group(1)) // 1000
        
        # Add 4 hours (14400 seconds) to adjust from UTC midnight to Eastern market day
        # This fixes the timezone issue where UTC midnight becomes previous day in Eastern time
        timestamp_seconds += 14400  # 4 hours in seconds
        
        return timestamp_seconds
    return None

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

def fetch_big_prints_batch(tickers_batch, start_date, end_date):
    """Fetch big prints for a batch of tickers (up to 50) in a single API call"""
    
    # Get cookies
    cookie_header = get_cookies()
    
    # Join tickers with comma for batch request
    tickers_str = ",".join(tickers_batch)
    
    # Get XSRF token (required as of Jan 2026)
    xsrf_token = get_xsrf_token()
    
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookie_header,
        "Referer": f"https://www.volumeleaders.com/Trades?Tickers={tickers_str}&StartDate={start_date}&EndDate={end_date}",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    }
    
    # Add XSRF token if available
    if xsrf_token:
        headers["x-xsrf-token"] = xsrf_token

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
        "length": "5000",  # Increased to handle multiple tickers
        "search[value]": "",
        "search[regex]": "false",
        "Tickers": tickers_str,  # Comma-separated tickers
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
        "TradeRank": "20",  # Only rank 20 or better
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
    
    def make_request():
        return requests.post(url, headers=headers, data=payload, timeout=180)  # Increased timeout for batch
    
    try:
        # Use retry logic for the request
        response = retry_with_backoff(make_request, max_retries=3, base_delay=2.0)
        
        if response.status_code == 200:
            try:
                data = response.json()
                if 'data' in data and data['data']:
                    # Group trades by ticker
                    ticker_prints = {ticker: [] for ticker in tickers_batch}
                    
                    for trade in data['data']:
                        # API returns ticker in 'Ticker' field, not 'Symbol'
                        ticker = trade.get('Ticker', '') or trade.get('Symbol', '')
                        if not ticker or ticker not in ticker_prints:
                            continue
                            
                        rank = trade.get('TradeRank', 999)
                        if rank != '' and rank is not None:
                            try:
                                rank_int = int(rank)
                                if rank_int <= 20:  # Rank 20 or better
                                    ticker_prints[ticker].append({
                                        "timestamp": format_timestamp(trade),
                                        "price": float(trade.get('Price', 0)),
                                        "volume": int(trade.get('Volume', 0)),
                                        "dollars": int(trade.get('Dollars', 0)),
                                        "rank": rank_int,
                                        "conditions": trade.get('Conditions', ''),
                                        "exchange": trade.get('Exchange', ''),
                                        "is_dark_pool": trade.get('IsDarkPool', False),
                                        "relative_size": float(trade.get('RelativeSize', 0)),
                                        "vcd": float(trade.get('VolumeConcentrationRatio', 0))
                                    })
                            except (ValueError, TypeError):
                                continue
                    
                    # Sort and limit to top 10 for each ticker
                    for ticker in ticker_prints:
                        ticker_prints[ticker].sort(key=lambda x: x['rank'])
                        ticker_prints[ticker] = ticker_prints[ticker][:10]
                    
                    return ticker_prints
                else:
                    # Return empty lists for all tickers
                    return {ticker: [] for ticker in tickers_batch}
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for batch: {e}")
                return {ticker: [] for ticker in tickers_batch}
        else:
            print(f"Error fetching batch: HTTP {response.status_code}")
            return {ticker: [] for ticker in tickers_batch}
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed for batch: {e}")
        return {ticker: [] for ticker in tickers_batch}

def fetch_support_resistance_batch(tickers_batch, start_date, end_date):
    """Fetch support/resistance levels for a batch of tickers in a single API call"""
    
    # Get cookies and XSRF token
    cookie_header = get_cookies()
    xsrf_token = get_xsrf_token()
    
    # Join tickers with comma
    tickers_str = ",".join(tickers_batch)
    
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookie_header,
        "Referer": f"https://www.volumeleaders.com/Chart0?StartDate={start_date}&EndDate={end_date}&Ticker={tickers_str}&MinVolume=0&MaxVolume=2000000000&MinDollars=0&MaxDollars=300000000000&MinPrice=0&MaxPrice=100000&DarkPools=-1&Sweeps=-1&LatePrints=-1&SignaturePrints=0&VolumeProfile=0&Levels=10&TradeCount=5&VCD=0&TradeRank=-1&IncludePremarket=1&IncludeRTH=1&IncludeAH=1&IncludeOpening=1&IncludeClosing=1&IncludePhantom=1&IncludeOffsetting=1",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    }
    
    # Add XSRF token if available
    if xsrf_token:
        headers["x-xsrf-token"] = xsrf_token
    
    data = {
        "draw": "1",
        "columns[0][data]": "Price",
        "columns[0][name]": "Price",
        "columns[0][searchable]": "true",
        "columns[0][orderable]": "false",
        "columns[1][data]": "Dollars",
        "columns[1][name]": "$$",
        "columns[1][searchable]": "true",
        "columns[1][orderable]": "false",
        "columns[2][data]": "Volume",
        "columns[2][name]": "Sh",
        "columns[2][searchable]": "true",
        "columns[2][orderable]": "false",
        "columns[3][data]": "Trades",
        "columns[3][name]": "Trades",
        "columns[3][searchable]": "true",
        "columns[3][orderable]": "false",
        "columns[4][data]": "RelativeSize",
        "columns[4][name]": "RS",
        "columns[4][searchable]": "true",
        "columns[4][orderable]": "false",
        "columns[5][data]": "CumulativeDistribution",
        "columns[5][name]": "PCT",
        "columns[5][searchable]": "true",
        "columns[5][orderable]": "false",
        "columns[6][data]": "TradeLevelRank",
        "columns[6][name]": "Rank",
        "columns[6][searchable]": "true",
        "columns[6][orderable]": "false",
        "columns[7][data]": "Dates",
        "columns[7][name]": "Dates",
        "columns[7][searchable]": "true",
        "columns[7][orderable]": "false",
        "order[0][column]": "0",
        "order[0][dir]": "DESC",
        "start": "0",
        "length": "50",  # Increased for batch
        "search[value]": "",
        "search[regex]": "false",
        "StartDate": start_date,
        "EndDate": end_date,
        "Ticker": tickers_str,
        "Levels": "10"
    }
    
    url = "https://www.volumeleaders.com/Chart/GetTradeLevels"
    
    def make_request():
        return requests.post(url, headers=headers, data=data, timeout=180)
    
    try:
        response = retry_with_backoff(make_request, max_retries=3, base_delay=2.0)
        
        if response.status_code == 200:
            try:
                result = response.json()
                if 'data' in result and result['data']:
                    # Group levels by ticker
                    ticker_levels = {ticker: [] for ticker in tickers_batch}
                    
                    for level in result['data']:
                        ticker = level.get('Ticker', '') or level.get('ticker', '')
                        # If Ticker is null/None (single-ticker request), assign to first ticker in batch
                        if not ticker and len(tickers_batch) == 1:
                            ticker = tickers_batch[0]
                        if ticker not in ticker_levels:
                            continue
                        
                        try:
                            ticker_levels[ticker].append({
                                "price": float(level.get('Price', 0)),
                                "volume": int(level.get('Volume', 0)),
                                "dollars": int(level.get('Dollars', 0)),
                                "rank": level.get('TradeLevelRank', '')
                            })
                        except (ValueError, TypeError):
                            continue
                    
                    # Limit to top 5 per ticker
                    for ticker in ticker_levels:
                        ticker_levels[ticker] = ticker_levels[ticker][:5]
                    
                    return ticker_levels
                else:
                    return {ticker: [] for ticker in tickers_batch}
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON for levels batch: {e}")
                return {ticker: [] for ticker in tickers_batch}
        else:
            print(f"Error fetching levels batch: HTTP {response.status_code}")
            return {ticker: [] for ticker in tickers_batch}
    
    except requests.exceptions.RequestException as e:
        print(f"Request failed for levels batch: {e}")
        return {ticker: [] for ticker in tickers_batch}

def fetch_price_boxes_batch(tickers_batch, start_date, end_date):
    """Fetch price boxes for a batch of tickers in a single API call"""
    
    # Get cookies and XSRF token
    cookie_header = get_cookies()
    xsrf_token = get_xsrf_token()
    
    # Join tickers with comma
    tickers_str = ",".join(tickers_batch)
    
    headers = {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "cookie": cookie_header,
        "referer": f"https://www.volumeleaders.com/Trades?Tickers={tickers_str}&StartDate={start_date}&EndDate={end_date}&MinVolume=0&MaxVolume=2000000000&Conditions=0&VCD=0&RelativeSize=0&DarkPools=1&Sweeps=1&LatePrints=-1&SignaturePrints=-1&EvenShared=-1&SecurityTypeKey=-1&MinPrice=0&MaxPrice=100000&MinDollars=18000000&MaxDollars=300000000000&TradeRank=-1&IncludePremarket=1&IncludeRTH=1&IncludeAH=1&IncludeOpening=1&IncludeClosing=1&IncludePhantom=1&IncludeOffsetting=1",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest"
    }
    
    # Add XSRF token if available
    if xsrf_token:
        headers["x-xsrf-token"] = xsrf_token
    

    # Column definitions
    columns = []
    for i, (data_field, name) in enumerate([
        ("FullTimeString24", ""), ("FullTimeString24", "FullTimeString24"),
        ("Ticker", "Ticker"), ("Current", "Current"), ("Trade", "Trade"),
        ("Sector", "Sector"), ("Industry", "Industry"), ("Volume", "Sh"),
        ("Dollars", "$$"), ("DollarsMultiplier", "RS"),
        ("CumulativeDistribution", "PCT"), ("TradeRank", "Rank"),
        ("LastComparibleTradeDate", "Last Traded"), ("LastComparibleTradeDate", "Charts")
    ]):
        columns.append(f"columns%5B{i}%5D%5Bdata%5D={data_field}")
        columns.append(f"columns%5B{i}%5D%5Bname%5D={name}")
        columns.append(f"columns%5B{i}%5D%5Bsearchable%5D=true")
        columns.append(f"columns%5B{i}%5D%5Borderable%5D={'true' if i > 0 else 'false'}")
        columns.append(f"columns%5B{i}%5D%5Bsearch%5D%5Bvalue%5D=")
        columns.append(f"columns%5B{i}%5D%5Bsearch%5D%5Bregex%5D=false")
    
    payload = (
        f"draw=1&{'&'.join(columns)}"
        f"&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=DESC&start=0&length=1000"
        f"&search%5Bvalue%5D=&search%5Bregex%5D=false"
        f"&Tickers={tickers_str}&StartDate={start_date}&EndDate={end_date}"
        f"&MinVolume=0&MaxVolume=2000000000&MinPrice=0&MaxPrice=100000"
        f"&MinDollars=18000000&MaxDollars=300000000000&Conditions=0&VCD=0"
        f"&SecurityTypeKey=-1&RelativeSize=0&DarkPools=1&Sweeps=1"
        f"&LatePrints=-1&SignaturePrints=-1&EvenShared=-1&TradeRank=-1"
        f"&IncludePremarket=1&IncludeRTH=1&IncludeAH=1&IncludeOpening=1"
        f"&IncludeClosing=1&IncludePhantom=1&IncludeOffsetting=1&SectorIndustry="
    )
    
    url = "https://www.volumeleaders.com/Trades/GetTrades"
    
    def make_request():
        return requests.post(url, headers=headers, data=payload, timeout=180)
    
    try:
        response = retry_with_backoff(make_request, max_retries=3, base_delay=2.0)
        
        if response.status_code == 200:
            try:
                result = response.json()
                if 'data' in result and result['data']:
                    # Group trades by ticker and calculate boxes
                    ticker_trades = defaultdict(list)
                    
                    for trade in result['data']:
                        ticker = trade.get('Ticker', '')
                        if ticker not in tickers_batch:
                            continue
                        
                        try:
                            ticker_trades[ticker].append({
                                'price': float(trade.get('Current', 0) or trade.get('Price', 0)),
                                'volume': int(trade.get('Volume', 0)),
                                'dollars': int(trade.get('Dollars', 0))
                            })
                        except (ValueError, TypeError):
                            continue
                    
                    # Calculate boxes for each ticker
                    ticker_boxes = {}
                    colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"]
                    
                    for ticker in tickers_batch:
                        trades = ticker_trades.get(ticker, [])
                        if not trades:
                            ticker_boxes[ticker] = []
                            continue
                        
                        # Sort by price and create boxes (simplified logic)
                        trades.sort(key=lambda x: x['price'])
                        boxes = []
                        
                        if len(trades) > 0:
                            # Create simple box from trade range
                            prices = [t['price'] for t in trades]
                            total_vol = sum(t['volume'] for t in trades)
                            total_dollars = sum(t['dollars'] for t in trades)
                            
                            boxes.append({
                                "box_number": 1,
                                "high_price": max(prices),
                                "low_price": min(prices),
                                "volume": total_vol,
                                "dollars": total_dollars,
                                "trades": len(trades),
                                "date_range": f"{start_date} to {end_date}",
                                "color": colors[0]
                            })
                        
                        ticker_boxes[ticker] = boxes[:5]  # Top 5 boxes
                    
                    return ticker_boxes
                else:
                    return {ticker: [] for ticker in tickers_batch}
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON for boxes batch: {e}")
                return {ticker: [] for ticker in tickers_batch}
        else:
            print(f"Error fetching boxes batch: HTTP {response.status_code}")
            return {ticker: [] for ticker in tickers_batch}
    
    except requests.exceptions.RequestException as e:
        print(f"Request failed for boxes batch: {e}")
        return {ticker: [] for ticker in tickers_batch}

def fetch_big_prints_for_ticker(ticker, start_date, end_date):
    """Fetch big prints (rank 20 or better) for a single ticker"""
    
    # Get cookies and XSRF token
    cookie_header = get_cookies()
    xsrf_token = get_xsrf_token()
    
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookie_header,
        "Referer": f"https://www.volumeleaders.com/Trades?Tickers={ticker}&StartDate={start_date}&EndDate={end_date}",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    }
    
    # Add XSRF token if available
    if xsrf_token:
        headers["x-xsrf-token"] = xsrf_token

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
        "TradeRank": "20",  # Only rank 20 or better
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
    
    def make_request():
        return requests.post(url, headers=headers, data=payload, timeout=120)  # Increased timeout to 120s
    
    try:
        # Use retry logic for the request
        response = retry_with_backoff(make_request, max_retries=3, base_delay=2.0)
        
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
                                if rank_int <= 20:  # Rank 20 or better
                                    big_prints.append({
                                        "timestamp": format_timestamp(trade),
                                        "price": float(trade.get('Price', 0)),
                                        "volume": int(trade.get('Volume', 0)),
                                        "dollars": int(trade.get('Dollars', 0)),
                                        "rank": rank_int,
                                        "conditions": trade.get('Conditions', ''),
                                        "exchange": trade.get('Exchange', ''),
                                        "is_dark_pool": trade.get('IsDarkPool', False),
                                        "relative_size": float(trade.get('RelativeSize', 0)),
                                        "vcd": float(trade.get('VolumeConcentrationRatio', 0))
                                    })
                            except (ValueError, TypeError):
                                continue
                    
                    # Sort by rank (best first) and take top 10
                    big_prints.sort(key=lambda x: x['rank'])
                    return big_prints[:10]  # Top 10 only
                else:
                    return []
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for {ticker} big prints: {e}")
                return []
        else:
            print(f"Error fetching big prints for {ticker}: HTTP {response.status_code}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed for {ticker} big prints: {e}")
        return []

def fetch_support_resistance_for_ticker(ticker, start_date, end_date):
    """Fetch support/resistance levels for a single ticker"""
    script_path = Path("/Users/stephenbae/Projects/moe-bot/discord-bot-slash/fetch_levels_for_slash.py")
    python_path = Path("/Users/stephenbae/Projects/moe-bot/.venv/bin/python")
    
    # Change to the project root directory
    original_cwd = os.getcwd()
    project_root = Path(__file__).parent.parent
    
    try:
        os.chdir(project_root)
        
        # Run the fetch script
        cmd = [
            str(python_path),
            str(script_path),
            '--ticker', ticker,
            '--min-date', start_date,
            '--max-date', end_date
        ]
        
        def run_levels_script():
            return subprocess.run(
                cmd,
                cwd="/Users/stephenbae/Projects/moe-bot",
                capture_output=True,
                text=True,
                timeout=120  # Increased timeout to 120s
            )
        
        # Use retry logic for the subprocess call
        result = retry_with_backoff(run_levels_script, max_retries=2, base_delay=1.0)
        
        if result.returncode == 0:
            try:
                levels_data = json.loads(result.stdout)
                if levels_data and levels_data.get('success') and levels_data.get('levels'):
                    # Convert to simplified format and take top 5
                    levels = []
                    for i, level in enumerate(levels_data['levels'][:5]):
                        if 'formatted' in level:
                            parts = level['formatted'].split(':')
                            if len(parts) >= 3:
                                price_str = parts[0].replace('$', '')
                                dollars_str = parts[1].replace('$', '').replace('B', '').replace('M', '').replace('K', '')
                                rank = parts[2]
                                
                                try:
                                    price = float(price_str)
                                    
                                    # Parse dollars (convert to actual value)
                                    if 'B' in parts[1]:
                                        dollars = float(dollars_str) * 1_000_000_000
                                    elif 'M' in parts[1]:
                                        dollars = float(dollars_str) * 1_000_000
                                    elif 'K' in parts[1]:
                                        dollars = float(dollars_str) * 1_000
                                    else:
                                        dollars = float(dollars_str)
                                    
                                    # Parse volume
                                    volume = 0
                                    if 'volume' in level:
                                        volume_str = level['volume'].replace('M', '').replace('K', '').replace('B', '')
                                        if 'B' in level['volume']:
                                            volume = int(float(volume_str) * 1_000_000_000)
                                        elif 'M' in level['volume']:
                                            volume = int(float(volume_str) * 1_000_000)
                                        elif 'K' in level['volume']:
                                            volume = int(float(volume_str) * 1_000)
                                        else:
                                            volume = int(float(volume_str))
                                    
                                    levels.append({
                                        "price": price,
                                        "volume": volume,
                                        "dollars": int(dollars),
                                        "rank": rank
                                    })
                                except (ValueError, TypeError):
                                    continue
                    
                    return levels
                else:
                    return []
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for {ticker} levels: {e}")
                return []
        else:
            print(f"Error fetching levels for {ticker}: {result.stderr}")
            return []
            
    except subprocess.TimeoutExpired:
        print(f"Timeout fetching levels for {ticker}")
        return []
    except Exception as e:
        print(f"Unexpected error fetching levels for {ticker}: {e}")
        return []
    finally:
        os.chdir(original_cwd)

def fetch_price_boxes_for_ticker(ticker, start_date, end_date):
    """Fetch price boxes for a single ticker"""
    script_path = Path("/Users/stephenbae/Projects/moe-bot/fetch_sweep_boxes.py")
    python_path = Path("/Users/stephenbae/Projects/moe-bot/.venv/bin/python")
    
    # Change to the project root directory
    original_cwd = os.getcwd()
    project_root = Path(__file__).parent.parent
    
    try:
        os.chdir(project_root)
        
        # Run the fetch script with --discord flag to get JSON output
        cmd = [
            str(python_path),
            str(script_path),
            ticker,
            '--start-date', start_date,
            '--end-date', end_date,
            '--discord',
            '--min-dollars', '18.0'  # 18M minimum
        ]
        
        def run_boxes_script():
            return subprocess.run(
                cmd,
                cwd="/Users/stephenbae/Projects/moe-bot",
                capture_output=True,
                text=True,
                timeout=180  # Increased timeout to 3 minutes for sweep data
            )
        
        # Use retry logic for the subprocess call
        result = retry_with_backoff(run_boxes_script, max_retries=2, base_delay=1.5)
        
        if result.returncode == 0:
            try:
                # The script outputs both console messages and JSON
                # We need to extract just the JSON portion (last line that starts with '{')
                output_lines = result.stdout.strip().split('\n')
                json_line = None
                
                # Find the JSON line (should start with '{' and end with '}')
                for line in reversed(output_lines):
                    line = line.strip()
                    if line.startswith('{') and line.endswith('}'):
                        json_line = line
                        break
                
                if json_line:
                    sweep_data = json.loads(json_line)
                    if sweep_data and sweep_data.get('success') and sweep_data.get('price_boxes'):
                        # Convert to simplified format
                        boxes = []
                        colors = ['blue', 'green', 'orange', 'red', 'purple', 'yellow', 'cyan', 'magenta']
                        
                        for i, box in enumerate(sweep_data['price_boxes']):
                            try:
                                boxes.append({
                                    "box_number": i + 1,
                                    "high_price": float(box.get('high_price', 0)),
                                    "low_price": float(box.get('low_price', 0)),
                                    "volume": int(box.get('total_volume', 0)),
                                    "dollars": int(box.get('total_dollars', 0)),
                                    "trades": int(box.get('trade_count', 0)),
                                    "date_range": box.get('date_range', f"{start_date} to {end_date}"),
                                    "color": colors[i % len(colors)]
                                })
                            except (ValueError, TypeError):
                                continue
                        
                        return boxes
                    else:
                        return []
                else:
                    return []
                    
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for {ticker} boxes: {e}")
                return []
        else:
            print(f"Error fetching boxes for {ticker}: {result.stderr}")
            return []
            
    except subprocess.TimeoutExpired:
        print(f"Timeout fetching boxes for {ticker}")
        return []
    except Exception as e:
        print(f"Unexpected error fetching boxes for {ticker}: {e}")
        return []
    finally:
        os.chdir(original_cwd)

def process_ticker(ticker, start_date, end_date, output_dir, batch_prints_cache=None, batch_levels_cache=None, batch_boxes_cache=None):
    """Process a single ticker and save its data"""
    # Remove verbose print statement since we have progress bar
    # print(f"Processing {ticker}...")
    
    # Process sequentially to avoid nested thread pool issues and resource leaks
    try:
        # Use batch caches if available (now works with XSRF token as of Jan 2026)
        if batch_prints_cache and ticker in batch_prints_cache and batch_prints_cache[ticker] is not None:
            prints = batch_prints_cache[ticker]
        else:
            prints = fetch_big_prints_for_ticker(ticker, start_date, end_date)
        
        # Use batch cache for levels (now works with XSRF token)
        if batch_levels_cache and ticker in batch_levels_cache and batch_levels_cache[ticker] is not None:
            levels = batch_levels_cache[ticker]
        else:
            levels = fetch_support_resistance_for_ticker(ticker, start_date, end_date)
        
        # Use batch cache for boxes
        if batch_boxes_cache and ticker in batch_boxes_cache and batch_boxes_cache[ticker] is not None:
            boxes = batch_boxes_cache[ticker]
        else:
            boxes = fetch_price_boxes_for_ticker(ticker, start_date, end_date)

    except Exception as e:
        print(f"\n✗ Error fetching data for {ticker}: {e}")
        return False
    
    # Create ticker data structure
    ticker_data = {
        "metadata": {
            "ticker": ticker,
            "generated_at": datetime.now(timezone.utc).isoformat() + "Z",
            "date_range": f"{start_date} to {end_date}",
            "source": "volumeleaders.com",
            "script": "populate_ticker_data.py"
        },
        "prints": prints,
        "levels": levels,
        "boxes": boxes
    }
    
    # Save to file
    output_file = output_dir / f"{ticker}.json"
    try:
        with open(output_file, 'w') as f:
            json.dump(ticker_data, f, indent=2)
        
        # Only show summary instead of verbose output
        # print(f"✓ Saved data for {ticker} ({len(prints)} prints, {len(levels)} levels, {len(boxes)} boxes)")
        return True
        
    except Exception as e:
        print(f"\n✗ Error saving {ticker}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Populate individual ticker data files')
    parser.add_argument('--tickers', nargs='+', help='Specific tickers to process (default: all base_tickers from volumeleaders_config.json)')
    parser.add_argument('--max-workers', type=int, default=2, help='Maximum concurrent workers (default: 2, optimized for reliability)')
    parser.add_argument('--days-back', type=int, default=90, help='Days to look back for data (default: 90)')
    parser.add_argument('--timeout', type=int, default=3600, help='Maximum timeout in seconds for the entire process')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(__file__).parent / 'ticker_data'
    output_dir.mkdir(exist_ok=True)
    
    # Get date range
    start_date, end_date = get_date_range(args.days_back)
    print(f"Date range: {start_date} to {end_date}")
    
    # Get ticker list
    if args.tickers:
        tickers = args.tickers
        print(f"Processing specified tickers: {', '.join(tickers)}")
    else:
        tickers = load_ticker_list()
        print(f"Processing all base_tickers: {len(tickers)} tickers")
    
    if not tickers:
        print("No tickers to process")
        sys.exit(1)
    
    # Pre-fetch big prints in batches for massive API call reduction
    batch_size = 50  # Process 50 tickers per API call
    batches = [tickers[i:i + batch_size] for i in range(0, len(tickers), batch_size)]
    num_batches = len(batches)
    
    print(f"\n🎯 BATCH PROCESSING MODE")
    print(f"   Fetching big prints for {len(tickers)} tickers in {num_batches} batches")
    print(f"   API calls reduction: {len(tickers)} → {num_batches} calls (-{100 * (1 - num_batches / len(tickers)):.1f}%)")
    
    # Fetch all big prints in batches
    batch_prints_cache = {}
    for i, batch in enumerate(batches, 1):
        print(f"   📦 Fetching batch {i}/{num_batches} ({len(batch)} tickers)...", end='', flush=True)
        try:
            batch_results = fetch_big_prints_batch(batch, start_date, end_date)
            batch_prints_cache.update(batch_results)
            print(f" ✓")
        except Exception as e:
            print(f" ✗ Error: {e}")
            # On batch failure, mark all tickers in batch for individual fetch
            for ticker in batch:
                batch_prints_cache[ticker] = None
        
        # Small delay between batches to be respectful
        if i < num_batches:
            time.sleep(1)
    
    print(f"✅ Big prints batch fetch complete! {len(batch_prints_cache)} tickers cached\n")
    
    # Fetch all support/resistance levels - NOTE: API only supports single ticker, so we iterate
    print(f"\n🎯 FETCHING SUPPORT/RESISTANCE LEVELS")
    print(f"   Fetching levels for {len(tickers)} tickers (one at a time - API limitation)")
    
    batch_levels_cache = {}
    for i, ticker in enumerate(tickers, 1):
        if i % 10 == 0 or i == len(tickers):
            print(f"   📊 Fetching levels {i}/{len(tickers)}...", flush=True)
        try:
            # Fetch single ticker at a time (API doesn't support true batch)
            batch_results = fetch_support_resistance_batch([ticker], start_date, end_date)
            batch_levels_cache.update(batch_results)
        except Exception as e:
            print(f" ✗ Error fetching {ticker}: {e}")
            batch_levels_cache[ticker] = None
        
        # Small delay every 10 tickers to avoid rate limiting
        if i % 10 == 0:
            time.sleep(0.5)
    
    print(f"✅ Levels fetch complete! {len(batch_levels_cache)} tickers cached\n")

    
    # Fetch all price boxes in batches
    print(f"\n🎯 FETCHING PRICE BOXES")
    print(f"   Fetching boxes for {len(tickers)} tickers in {num_batches} batches")
    print(f"   API calls reduction: {len(tickers)} → {num_batches} calls (-{100 * (1 - num_batches / len(tickers)):.1f}%)")
    
    batch_boxes_cache = {}
    for i, batch in enumerate(batches, 1):
        print(f"   📦 Fetching boxes batch {i}/{num_batches} ({len(batch)} tickers)...", end='', flush=True)
        try:
            batch_results = fetch_price_boxes_batch(batch, start_date, end_date)
            batch_boxes_cache.update(batch_results)
            print(f" ✓")
        except Exception as e:
            print(f" ✗ Error: {e}")
            for ticker in batch:
                batch_boxes_cache[ticker] = None
        
        if i < num_batches:
            time.sleep(1)
    
    print(f"✅ Boxes batch fetch complete! {len(batch_boxes_cache)} tickers cached\n")
    
    # Process tickers with controlled concurrency and progress bar
    successful = 0
    failed = 0
    
    print(f"🚀 Starting processing of {len(tickers)} tickers with {args.max_workers} workers...")
    print(f"📊 Progress updates will be shown every 10 completed tickers...")
    
    with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        # Submit all tasks with all batch caches
        future_to_ticker = {
            executor.submit(process_ticker, ticker, start_date, end_date, output_dir, 
                          batch_prints_cache, batch_levels_cache, batch_boxes_cache): ticker 
            for ticker in tickers
        }
        
        # Process completed tasks with progress bar and periodic updates
        completed = 0
        with tqdm(total=len(tickers), desc="Processing tickers", unit="ticker", 
                  bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}] {postfix}",
                  file=sys.stdout, dynamic_ncols=True) as pbar:
            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    if future.result():
                        successful += 1
                        pbar.set_postfix({"✓": successful, "✗": failed, "current": ticker})
                    else:
                        failed += 1
                        pbar.set_postfix({"✓": successful, "✗": failed, "current": ticker})
                except Exception as e:
                    print(f"\n✗ Exception processing {ticker}: {e}")
                    failed += 1
                    pbar.set_postfix({"✓": successful, "✗": failed, "current": ticker})
                
                completed += 1
                pbar.update(1)
                
                # Add small delay to avoid overwhelming the server and reduce resource pressure
                time.sleep(0.2)  # 200ms delay between completions to prevent resource exhaustion
                
                # Periodic garbage collection to prevent memory leaks
                if completed % 50 == 0:
                    gc.collect()
                
                # Print periodic progress updates for logs
                if completed % 10 == 0 or completed == len(tickers):
                    progress_pct = (completed / len(tickers)) * 100
                    print(f"\n📈 Progress Update: {completed}/{len(tickers)} tickers processed ({progress_pct:.1f}%) - ✓{successful} ✗{failed}")
                    sys.stdout.flush()  # Force output to appear in logs
    
    print(f"\n✅ Completed: {successful} successful, {failed} failed")
    print(f"📁 Output directory: {output_dir}")

if __name__ == "__main__":
    main() 