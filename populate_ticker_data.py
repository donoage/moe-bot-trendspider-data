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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from tqdm import tqdm

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

def get_cookies():
    """Load cookies from cookies.json file"""
    try:
        cookies_file = Path("/Users/stephenbae/Projects/moe-bot/cookies.json")
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
        
        result = subprocess.run(
            cmd,
            cwd="/Users/stephenbae/Projects/moe-bot",
            capture_output=True,
            text=True,
            timeout=60  # 60 second timeout
        )
        
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
        
        result = subprocess.run(
            cmd,
            cwd="/Users/stephenbae/Projects/moe-bot",
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout for sweep data
        )
        
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

def process_ticker(ticker, start_date, end_date, output_dir):
    """Process a single ticker and save its data"""
    # Remove verbose print statement since we have progress bar
    # print(f"Processing {ticker}...")
    
    # Fetch all data types for this ticker
    prints = fetch_big_prints_for_ticker(ticker, start_date, end_date)
    levels = fetch_support_resistance_for_ticker(ticker, start_date, end_date)
    boxes = fetch_price_boxes_for_ticker(ticker, start_date, end_date)
    
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
    parser.add_argument('--max-workers', type=int, default=3, help='Maximum concurrent workers (default: 3)')
    parser.add_argument('--days-back', type=int, default=90, help='Days to look back for data (default: 90)')
    
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
    
    # Process tickers with controlled concurrency and progress bar
    successful = 0
    failed = 0
    
    print(f"\n🚀 Starting processing of {len(tickers)} tickers with {args.max_workers} workers...")
    print(f"📊 Progress updates will be shown every 10 completed tickers...")
    
    with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        # Submit all tasks
        future_to_ticker = {
            executor.submit(process_ticker, ticker, start_date, end_date, output_dir): ticker 
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
                
                # Print periodic progress updates for logs
                if completed % 10 == 0 or completed == len(tickers):
                    progress_pct = (completed / len(tickers)) * 100
                    print(f"\n📈 Progress Update: {completed}/{len(tickers)} tickers processed ({progress_pct:.1f}%) - ✓{successful} ✗{failed}")
                    sys.stdout.flush()  # Force output to appear in logs
    
    print(f"\n✅ Completed: {successful} successful, {failed} failed")
    print(f"📁 Output directory: {output_dir}")

if __name__ == "__main__":
    main() 