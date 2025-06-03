#!/usr/bin/env python3
"""
Script to populate price_boxes.json with sweep box data 
for all tickers in the TrendSpider ticker list.
"""

import json
import subprocess
import sys
import os
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

def save_price_boxes_data(all_boxes, start_date, end_date):
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
            "data_source": "Moe Bot - VolumeLeaders.com",
            "script": "populate_price_boxes.py"
        },
        "price_boxes": all_boxes
    }
    
    try:
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\n✅ Successfully saved {len(all_boxes)} price boxes to {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving data to {output_file}: {e}")
        return False

def main():
    """Main function to populate price_boxes.json"""
    print("🔄 Starting TrendSpider price boxes population...")
    
    # Load ticker list
    tickers = load_ticker_list()
    if not tickers:
        print("❌ No tickers found in ticker_list.json")
        sys.exit(1)
    
    print(f"📋 Found {len(tickers)} tickers: {', '.join(tickers)}")
    
    # Get date range (30 days back)
    start_date, end_date = get_date_range(30)
    print(f"📅 Date range: {start_date} to {end_date}")
    print(f"📦 Using per-ticker box numbering (each ticker starts from box 1)")
    
    # Fetch data for each ticker
    all_boxes = []
    successful_tickers = []
    failed_tickers = []
    
    for ticker in tickers:
        print(f"\n🔍 Processing {ticker}...")
        
        sweep_data = fetch_sweep_boxes_for_ticker(ticker, start_date, end_date)
        
        if sweep_data and sweep_data.get('success'):
            converted_boxes = convert_to_price_boxes_format(
                ticker, sweep_data, start_date, end_date
            )
            if converted_boxes:
                all_boxes.extend(converted_boxes)
                successful_tickers.append(ticker)
                print(f"✅ {ticker}: Added {len(converted_boxes)} price boxes (numbered 1-{len(converted_boxes)})")
            else:
                print(f"⚠️ {ticker}: No valid price boxes found")
                failed_tickers.append(ticker)
        else:
            error_msg = sweep_data.get('error', 'Unknown error') if sweep_data else 'No response'
            print(f"❌ {ticker}: Failed - {error_msg}")
            failed_tickers.append(ticker)
    
    # Save the results
    print(f"\n📊 Summary:")
    print(f"  • Successful: {len(successful_tickers)} tickers")
    print(f"  • Failed: {len(failed_tickers)} tickers")
    print(f"  • Total price boxes: {len(all_boxes)}")
    
    if successful_tickers:
        print(f"  • Success: {', '.join(successful_tickers)}")
    
    if failed_tickers:
        print(f"  • Failed: {', '.join(failed_tickers)}")
    
    if all_boxes:
        if save_price_boxes_data(all_boxes, start_date, end_date):
            print("\n🎯 TrendSpider price boxes population complete!")
        else:
            print("\n❌ Failed to save price boxes data")
            sys.exit(1)
    else:
        print("\n⚠️ No price boxes data collected - nothing to save")
        sys.exit(1)

if __name__ == "__main__":
    main() 