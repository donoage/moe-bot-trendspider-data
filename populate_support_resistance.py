#!/usr/bin/env python3
"""
Script to populate support_resistance_levels.json with trade levels data 
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
    """Load existing support_resistance_levels.json data"""
    output_file = Path(__file__).parent / 'support_resistance_levels.json'
    
    try:
        with open(output_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("No existing support_resistance_levels.json found, creating new file")
        return {"metadata": {}, "levels": []}
    except json.JSONDecodeError as e:
        print(f"Error reading existing data: {e}")
        return {"metadata": {}, "levels": []}

def remove_ticker_data(existing_data, ticker):
    """Remove all data for a specific ticker from existing data"""
    existing_data['levels'] = [level for level in existing_data['levels'] if level.get('symbol') != ticker]
    return existing_data

def fetch_levels_for_ticker(ticker, min_date, max_date):
    """Fetch trade levels for a single ticker using the existing script"""
    script_path = Path(__file__).parent.parent / 'discord-bot-slash' / 'fetch_levels_for_slash.py'
    python_path = Path(__file__).parent.parent / '.venv' / 'bin' / 'python3'
    
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
            '--min-date', min_date,
            '--max-date', max_date
        ]
        
        print(f"Fetching levels for {ticker} from {min_date} to {max_date}...")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60  # 60 second timeout
        )
        
        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
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

def convert_to_support_resistance_format(ticker, levels_data, timestamp):
    """Convert the fetch_levels_for_slash.py output to support_resistance_levels.json format"""
    converted_levels = []
    
    if not levels_data or not levels_data.get('success') or not levels_data.get('levels'):
        return converted_levels
    
    # Take top 5 levels
    for i, level in enumerate(levels_data['levels'][:5]):
        try:
            # Extract price from formatted string like "$594.2:$16.94B:1"
            if 'formatted' in level:
                parts = level['formatted'].split(':')
                if len(parts) >= 3:
                    price_str = parts[0].replace('$', '')
                    dollars_str = parts[1].replace('$', '').replace('B', '').replace('M', '').replace('K', '')
                    rank = parts[2]
                    
                    # Parse price
                    try:
                        price = float(price_str)
                    except ValueError:
                        continue
                    
                    # Parse dollars (convert to actual value)
                    try:
                        if 'B' in parts[1]:
                            dollars = float(dollars_str) * 1_000_000_000
                        elif 'M' in parts[1]:
                            dollars = float(dollars_str) * 1_000_000
                        elif 'K' in parts[1]:
                            dollars = float(dollars_str) * 1_000
                        else:
                            dollars = float(dollars_str)
                    except ValueError:
                        dollars = 0
                    
                    # Parse volume from the volume field (e.g., "15.23M")
                    volume = 0
                    if 'volume' in level:
                        volume_str = level['volume'].replace('M', '').replace('K', '').replace('B', '')
                        try:
                            if 'B' in level['volume']:
                                volume = int(float(volume_str) * 1_000_000_000)
                            elif 'M' in level['volume']:
                                volume = int(float(volume_str) * 1_000_000)
                            elif 'K' in level['volume']:
                                volume = int(float(volume_str) * 1_000)
                            else:
                                volume = int(float(volume_str))
                        except (ValueError, TypeError):
                            volume = 0
                    
                    converted_level = {
                        "symbol": ticker,
                        "price": price,
                        "timestamp": timestamp,
                        "volume": volume,
                        "dollars": int(dollars),
                        "rank": rank
                    }
                    
                    converted_levels.append(converted_level)
            
        except (KeyError, ValueError, IndexError) as e:
            print(f"Error converting level data for {ticker}: {e}")
            continue
    
    return converted_levels

def save_support_resistance_data(all_levels, min_date, max_date, incremental_tickers=None):
    """Save the compiled data to support_resistance_levels.json"""
    output_file = Path(__file__).parent / 'support_resistance_levels.json'
    
    # Create the output structure
    output_data = {
        "metadata": {
            "source": "volumeleaders.com",
            "generated_at": datetime.now().isoformat() + "Z",
            "description": "Support and resistance levels derived from VolumeLeaders trade data with volume and dollar values",
            "date_range": f"{min_date} to {max_date}",
            "criteria": "Top 5 trade levels per ticker over 90-day lookback period",
            "script": "populate_support_resistance.py"
        },
        "levels": all_levels
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
            print(f"\n✅ Successfully updated {len(all_levels)} levels (incremental update for {', '.join(incremental_tickers)}) to {output_file}")
        else:
            print(f"\n✅ Successfully saved {len(all_levels)} levels to {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving data to {output_file}: {e}")
        return False

def main():
    """Main function to populate support_resistance_levels.json"""
    parser = argparse.ArgumentParser(description='Populate support resistance levels data')
    parser.add_argument('--incremental', action='store_true', help='Incremental update mode')
    parser.add_argument('tickers', nargs='*', help='Specific tickers to update (for incremental mode)')
    
    args = parser.parse_args()
    
    if args.incremental and not args.tickers:
        print("❌ Incremental mode requires specific tickers")
        sys.exit(1)
    
    if args.incremental:
        print(f"🔄 Starting incremental TrendSpider support/resistance levels update for: {', '.join(args.tickers)}")
        tickers_to_process = args.tickers
        
        # Load existing data
        existing_data = load_existing_data()
        
        # Remove old data for these tickers
        for ticker in tickers_to_process:
            existing_data = remove_ticker_data(existing_data, ticker)
        
        all_levels = existing_data.get('levels', [])
    else:
        print("🔄 Starting full TrendSpider support/resistance levels population...")
        
        # Load ticker list
        tickers_to_process = load_ticker_list()
        if not tickers_to_process:
            print("❌ No tickers found in ticker_list.json")
            sys.exit(1)
        
        all_levels = []
    
    print(f"📊 Processing {len(tickers_to_process)} tickers...")
    
    # Get date range
    min_date, max_date = get_date_range()
    print(f"📅 Date range: {min_date} to {max_date}")
    
    # Process each ticker
    timestamp = datetime.now().isoformat() + "Z"
    successful_tickers = []
    failed_tickers = []
    
    for i, ticker in enumerate(tickers_to_process, 1):
        print(f"\n[{i}/{len(tickers_to_process)}] Processing {ticker}...")
        
        # Fetch levels for this ticker
        levels_data = fetch_levels_for_ticker(ticker, min_date, max_date)
        
        if levels_data:
            # Convert to our format
            converted_levels = convert_to_support_resistance_format(ticker, levels_data, timestamp)
            
            if converted_levels:
                all_levels.extend(converted_levels)
                successful_tickers.append(ticker)
                print(f"✅ Added {len(converted_levels)} levels for {ticker}")
            else:
                print(f"⚠️ No valid levels found for {ticker}")
                failed_tickers.append(ticker)
        else:
            print(f"❌ Failed to fetch data for {ticker}")
            failed_tickers.append(ticker)
    
    # Save the compiled data
    if save_support_resistance_data(all_levels, min_date, max_date, args.tickers if args.incremental else None):
        print(f"\n🎉 Population completed!")
        print(f"✅ Successful: {len(successful_tickers)} tickers")
        if failed_tickers:
            print(f"❌ Failed: {len(failed_tickers)} tickers: {', '.join(failed_tickers)}")
        print(f"📊 Total levels in file: {len(all_levels)}")
    else:
        print(f"\n❌ Failed to save data")
        sys.exit(1)

if __name__ == "__main__":
    main() 