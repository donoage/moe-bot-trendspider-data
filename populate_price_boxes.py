#!/usr/bin/env python3
"""
Script to populate price_boxes.json with sweep box data 
for all tickers in the TrendSpider ticker list.
Supports incremental updates for specific tickers.
"""

import json
import subprocess
import sys
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path

def get_date_range(days_back=30):
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

def load_existing_data():
    """Load existing price_boxes.json data"""
    output_file = Path(__file__).parent / 'price_boxes.json'
    
    try:
        with open(output_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("No existing price_boxes.json found, creating new file")
        return {"metadata": {}, "price_boxes": []}
    except json.JSONDecodeError as e:
        print(f"Error reading existing data: {e}")
        return {"metadata": {}, "price_boxes": []}

def remove_ticker_data(existing_data, ticker):
    """Remove all data for a specific ticker from existing data"""
    existing_data['price_boxes'] = [box for box in existing_data['price_boxes'] if box.get('symbol') != ticker]
    return existing_data

def fetch_sweep_boxes_for_ticker(ticker, start_date, end_date):
    """Fetch sweep boxes for a single ticker using the existing script"""
    script_path = Path(__file__).parent.parent / 'fetch_sweep_boxes.py'
    python_path = Path(__file__).parent.parent / '.venv' / 'bin' / 'python3'
    
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
        
        print(f"Fetching sweep boxes for {ticker} from {start_date} to {end_date}...")
        
        result = subprocess.run(
            cmd,
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
                    return json.loads(json_line)
                else:
                    print(f"No JSON found in output for {ticker}")
                    print(f"Raw output: {result.stdout}")
                    return None
                    
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON response for {ticker}: {e}")
                print(f"Raw output: {result.stdout}")
                return None
        else:
            print(f"Error fetching data for {ticker}: {result.stderr}")
            return None
            
    except subprocess.TimeoutExpired:
        print(f"Timeout fetching data for {ticker}")
        return None
    except Exception as e:
        print(f"Unexpected error fetching data for {ticker}: {e}")
        return None
    finally:
        os.chdir(original_cwd)

def convert_to_price_boxes_format(ticker, sweep_data, start_date, end_date):
    """Convert the fetch_sweep_boxes.py output to price_boxes.json format with per-ticker box numbering"""
    converted_boxes = []
    
    if not sweep_data or not sweep_data.get('success') or not sweep_data.get('price_boxes'):
        return converted_boxes
    
    # Color scheme for boxes
    colors = ['blue', 'green', 'orange', 'red', 'purple', 'yellow', 'cyan', 'magenta']
    
    # Number boxes per ticker starting from 1
    for i, box in enumerate(sweep_data['price_boxes']):
        try:
            box_number = i + 1  # Start from 1 for each ticker
            
            # Create box structure matching the existing format
            converted_box = {
                "symbol": ticker,
                "type": "sweep_box",
                "box_number": box_number,
                "top_left": {
                    "timestamp": f"{start_date}T09:30:00Z",  # Market open
                    "price": float(box.get('high_price', 0))
                },
                "bottom_right": {
                    "timestamp": f"{end_date}T16:00:00Z",   # Market close
                    "price": float(box.get('low_price', 0))
                },
                "color": colors[box_number % len(colors)],
                "opacity": 0.3,
                "label": f"BOX {box_number}: {format_volume(box.get('total_volume', 0))} shares | {format_dollars(box.get('total_dollars', 0))} | {box.get('trade_count', 0)} trades",
                "volume": int(box.get('total_volume', 0)),
                "value": int(box.get('total_dollars', 0)),
                "trades": int(box.get('trade_count', 0)),
                "date_range": box.get('date_range', f"{start_date} to {end_date}")
            }
            
            converted_boxes.append(converted_box)
            
        except (KeyError, ValueError, TypeError) as e:
            print(f"Error converting box data for {ticker}: {e}")
            continue
    
    return converted_boxes

def format_volume(volume):
    """Format volume with K, M, B suffixes"""
    try:
        vol = int(volume)
        if vol >= 1000000000:
            return f"{vol/1000000000:.1f}B"
        elif vol >= 1000000:
            return f"{vol/1000000:.1f}M"
        elif vol >= 1000:
            return f"{vol/1000:.1f}K"
        else:
            return str(vol)
    except (ValueError, TypeError):
        return "0"

def format_dollars(dollars):
    """Format dollar amounts with K, M, B suffixes"""
    try:
        amount = int(dollars)
        if amount >= 1000000000:
            return f"${amount/1000000000:.1f}B"
        elif amount >= 1000000:
            return f"${amount/1000000:.1f}M"
        elif amount >= 1000:
            return f"${amount/1000:.1f}K"
        else:
            return f"${amount}"
    except (ValueError, TypeError):
        return "$0"

def save_price_boxes_data(all_boxes, start_date, end_date, incremental_tickers=None):
    """Save the compiled data to price_boxes.json"""
    output_file = Path(__file__).parent / 'price_boxes.json'
    
    # Create the output structure
    output_data = {
        "metadata": {
            "source": "volumeleaders.com",
            "generated_at": datetime.now().isoformat() + "Z",
            "description": "Price boxes (sweep zones) from VolumeLeaders showing support/resistance zones with volume data",
            "date_range": f"{start_date} to {end_date}",
            "criteria": "Sweep boxes from top trades per ticker over 30-day lookback period with per-ticker box numbering",
            "script": "populate_price_boxes.py"
        },
        "price_boxes": all_boxes
    }
    
    # Add incremental update info if applicable
    if incremental_tickers:
        output_data["metadata"]["last_incremental_update"] = {
            "tickers": incremental_tickers,
            "updated_at": datetime.now().isoformat() + "Z"
        }
    
    try:
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        if incremental_tickers:
            print(f"\n✅ Successfully updated {len(all_boxes)} price boxes (incremental update for {', '.join(incremental_tickers)}) to {output_file}")
        else:
            print(f"\n✅ Successfully saved {len(all_boxes)} price boxes to {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving data to {output_file}: {e}")
        return False

def main():
    """Main function to populate price_boxes.json"""
    parser = argparse.ArgumentParser(description='Populate price boxes data')
    parser.add_argument('--incremental', action='store_true', help='Incremental update mode')
    parser.add_argument('tickers', nargs='*', help='Specific tickers to update (for incremental mode)')
    
    args = parser.parse_args()
    
    if args.incremental and not args.tickers:
        print("❌ Incremental mode requires specific tickers")
        sys.exit(1)
    
    if args.incremental:
        print(f"🔄 Starting incremental TrendSpider price boxes update for: {', '.join(args.tickers)}")
        tickers_to_process = args.tickers
        
        # Load existing data
        existing_data = load_existing_data()
        
        # Remove old data for these tickers
        for ticker in tickers_to_process:
            existing_data = remove_ticker_data(existing_data, ticker)
        
        all_boxes = existing_data.get('price_boxes', [])
    else:
        print("🔄 Starting full TrendSpider price boxes population...")
        
        # Load ticker list
        tickers_to_process = load_ticker_list()
        if not tickers_to_process:
            print("❌ No tickers found in ticker_list.json")
            sys.exit(1)
        
        all_boxes = []
    
    print(f"📊 Processing {len(tickers_to_process)} tickers...")
    
    # Get date range
    start_date, end_date = get_date_range()
    print(f"📅 Date range: {start_date} to {end_date}")
    
    # Process each ticker
    successful_tickers = []
    failed_tickers = []
    
    for i, ticker in enumerate(tickers_to_process, 1):
        print(f"\n[{i}/{len(tickers_to_process)}] Processing {ticker}...")
        
        # Fetch sweep boxes for this ticker
        sweep_data = fetch_sweep_boxes_for_ticker(ticker, start_date, end_date)
        
        if sweep_data:
            # Convert to our format
            converted_boxes = convert_to_price_boxes_format(ticker, sweep_data, start_date, end_date)
            
            if converted_boxes:
                all_boxes.extend(converted_boxes)
                successful_tickers.append(ticker)
                print(f"✅ Added {len(converted_boxes)} price boxes for {ticker}")
            else:
                print(f"⚠️ No valid price boxes found for {ticker}")
                failed_tickers.append(ticker)
        else:
            print(f"❌ Failed to fetch data for {ticker}")
            failed_tickers.append(ticker)
    
    # Save the compiled data
    if save_price_boxes_data(all_boxes, start_date, end_date, args.tickers if args.incremental else None):
        print(f"\n🎉 Population completed!")
        print(f"✅ Successful: {len(successful_tickers)} tickers")
        if failed_tickers:
            print(f"❌ Failed: {len(failed_tickers)} tickers: {', '.join(failed_tickers)}")
        print(f"📊 Total price boxes in file: {len(all_boxes)}")
    else:
        print(f"\n❌ Failed to save data")
        sys.exit(1)

if __name__ == "__main__":
    main() 