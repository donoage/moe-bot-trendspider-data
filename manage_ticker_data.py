#!/usr/bin/env python3
"""
Management utilities for individual ticker data files.
Provides tools to list, update, clean, and analyze ticker data.
"""

import json
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
import subprocess

def list_ticker_files(output_dir):
    """List all ticker files with metadata"""
    ticker_files = list(output_dir.glob("*.json"))
    
    if not ticker_files:
        print("No ticker files found")
        return
    
    print(f"Found {len(ticker_files)} ticker files:")
    print("-" * 80)
    print(f"{'TICKER':<8} {'GENERATED':<20} {'PRINTS':<7} {'LEVELS':<7} {'BOXES':<6}")
    print("-" * 80)
    
    for file_path in sorted(ticker_files):
        ticker = file_path.stem
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                generated = data.get('metadata', {}).get('generated_at', 'Unknown')[:19]
                prints_count = len(data.get('prints', []))
                levels_count = len(data.get('levels', []))
                boxes_count = len(data.get('boxes', []))
                
                print(f"{ticker:<8} {generated:<20} {prints_count:<7} {levels_count:<7} {boxes_count:<6}")
        except Exception as e:
            print(f"{ticker:<8} ERROR: {e}")

def update_tickers(tickers, output_dir, max_workers=3):
    """Update specific tickers using the populate script"""
    script_path = Path(__file__).parent / 'populate_ticker_data.py'
    python_path = Path(__file__).parent.parent / '.venv' / 'bin' / 'python3'
    
    cmd = [
        str(python_path),
        str(script_path),
        '--tickers'
    ] + tickers + [
        '--max-workers', str(max_workers)
    ]
    
    print(f"Updating tickers: {', '.join(tickers)}")
    
    result = subprocess.run(cmd, cwd=Path(__file__).parent)
    return result.returncode == 0

def clean_old_files(output_dir, days_old=7):
    """Remove ticker files older than specified days"""
    cutoff_date = datetime.now() - timedelta(days=days_old)
    
    ticker_files = list(output_dir.glob("*.json"))
    removed_count = 0
    
    for file_path in ticker_files:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                generated_str = data.get('metadata', {}).get('generated_at', '')
                
                if generated_str:
                    # Parse ISO format timestamp
                    generated_dt = datetime.fromisoformat(generated_str.replace('Z', '+00:00'))
                    
                    if generated_dt.replace(tzinfo=None) < cutoff_date:
                        file_path.unlink()
                        print(f"Removed old file: {file_path.name}")
                        removed_count += 1
        except Exception as e:
            print(f"Error processing {file_path.name}: {e}")
    
    print(f"Removed {removed_count} files older than {days_old} days")

def get_ticker_data(ticker, output_dir):
    """Get data for a specific ticker"""
    ticker_file = output_dir / f"{ticker.upper()}.json"
    
    if not ticker_file.exists():
        print(f"No data file found for {ticker}")
        return None
    
    try:
        with open(ticker_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading data for {ticker}: {e}")
        return None

def find_tickers_with_data(output_dir, data_type, min_count=1):
    """Find tickers that have a minimum amount of specific data type"""
    ticker_files = list(output_dir.glob("*.json"))
    matching_tickers = []
    
    for file_path in ticker_files:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                count = len(data.get(data_type, []))
                
                if count >= min_count:
                    matching_tickers.append({
                        'ticker': file_path.stem,
                        'count': count,
                        'generated_at': data.get('metadata', {}).get('generated_at', '')
                    })
        except Exception as e:
            print(f"Error reading {file_path.name}: {e}")
    
    # Sort by count (descending)
    matching_tickers.sort(key=lambda x: x['count'], reverse=True)
    return matching_tickers

def export_trendspider_format(output_dir, export_file):
    """Export all ticker data in TrendSpider import format"""
    ticker_files = list(output_dir.glob("*.json"))
    
    all_data = {
        "metadata": {
            "exported_at": datetime.now().isoformat() + "Z",
            "source": "ticker_data_files",
            "ticker_count": len(ticker_files),
            "description": "Combined ticker data for TrendSpider import"
        },
        "tickers": {}
    }
    
    for file_path in ticker_files:
        ticker = file_path.stem
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                all_data["tickers"][ticker] = {
                    "prints": data.get('prints', []),
                    "levels": data.get('levels', []),
                    "boxes": data.get('boxes', []),
                    "last_updated": data.get('metadata', {}).get('generated_at', '')
                }
        except Exception as e:
            print(f"Error reading {file_path.name}: {e}")
    
    try:
        with open(export_file, 'w') as f:
            json.dump(all_data, f, indent=2)
        print(f"Exported {len(all_data['tickers'])} tickers to {export_file}")
        return True
    except Exception as e:
        print(f"Error exporting data: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Manage ticker data files')
    parser.add_argument('--data-dir', default='ticker_data', help='Directory containing ticker files')
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List all ticker files')
    
    # Update command
    update_parser = subparsers.add_parser('update', help='Update specific tickers')
    update_parser.add_argument('tickers', nargs='+', help='Tickers to update')
    update_parser.add_argument('--max-workers', type=int, default=3, help='Max concurrent workers')
    
    # Clean command
    clean_parser = subparsers.add_parser('clean', help='Remove old ticker files')
    clean_parser.add_argument('--days', type=int, default=7, help='Remove files older than N days')
    
    # Get command
    get_parser = subparsers.add_parser('get', help='Get data for specific ticker')
    get_parser.add_argument('ticker', help='Ticker symbol')
    
    # Find command
    find_parser = subparsers.add_parser('find', help='Find tickers with specific data')
    find_parser.add_argument('data_type', choices=['prints', 'levels', 'boxes'], help='Data type to search for')
    find_parser.add_argument('--min-count', type=int, default=1, help='Minimum count required')
    
    # Export command
    export_parser = subparsers.add_parser('export', help='Export all data for TrendSpider')
    export_parser.add_argument('output_file', help='Output file path')
    
    args = parser.parse_args()
    
    # Set up paths
    output_dir = Path(__file__).parent / args.data_dir
    
    if not output_dir.exists():
        print(f"Data directory {output_dir} does not exist")
        sys.exit(1)
    
    # Execute commands
    if args.command == 'list':
        list_ticker_files(output_dir)
    
    elif args.command == 'update':
        success = update_tickers(args.tickers, output_dir, args.max_workers)
        sys.exit(0 if success else 1)
    
    elif args.command == 'clean':
        clean_old_files(output_dir, args.days)
    
    elif args.command == 'get':
        data = get_ticker_data(args.ticker, output_dir)
        if data:
            print(json.dumps(data, indent=2))
    
    elif args.command == 'find':
        tickers = find_tickers_with_data(output_dir, args.data_type, args.min_count)
        if tickers:
            print(f"Tickers with {args.min_count}+ {args.data_type}:")
            print("-" * 50)
            for ticker_info in tickers:
                print(f"{ticker_info['ticker']:<8} {ticker_info['count']:<5} items")
        else:
            print(f"No tickers found with {args.min_count}+ {args.data_type}")
    
    elif args.command == 'export':
        success = export_trendspider_format(output_dir, args.output_file)
        sys.exit(0 if success else 1)
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 