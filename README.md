# TrendSpider Ticker Data System

This directory contains scripts for managing individual ticker data files optimized for hundreds of tickers. Each ticker gets its own JSON file with the structure: `{prints, levels, boxes}`.

## File Structure

```
trendspider_data/
├── ticker_data/           # Individual ticker JSON files
│   ├── AAPL.json         # Apple data
│   ├── MSFT.json         # Microsoft data
│   └── ...               # One file per ticker
├── populate_ticker_data.py   # Main data population script
├── manage_ticker_data.py     # Management utilities
└── ticker_list.json          # List of tickers to process
```

## Data Structure

Each ticker file (`TICKER.json`) contains:

```json
{
  "metadata": {
    "ticker": "AAPL",
    "generated_at": "2025-06-03T08:45:11.804010Z",
    "date_range": "2025-03-05 to 2025-06-03",
    "source": "volumeleaders.com",
    "script": "populate_ticker_data.py"
  },
  "prints": [
    {
      "timestamp": "",
      "price": 218.27,
      "volume": 24502675,
      "dollars": 5348198872,
      "rank": 14,
      "conditions": "",
      "exchange": "",
      "is_dark_pool": false,
      "relative_size": 0.0,
      "vcd": 0.0
    }
  ],
  "levels": [
    {
      "price": 228.2,
      "volume": 191630000,
      "dollars": 43730000000,
      "rank": "1"
    }
  ],
  "boxes": [
    {
      "box_number": 1,
      "high_price": 208.52,
      "low_price": 189.6,
      "volume": 412249,
      "dollars": 82939970,
      "trades": 4,
      "date_range": "2025-04-03 to 2025-05-12",
      "color": "blue"
    }
  ]
}
```

## Usage

### Populate All Tickers

```bash
# Process all tickers from ticker_list.json
python populate_ticker_data.py

# Process with custom settings
python populate_ticker_data.py --max-workers 5 --days-back 60
```

### Populate Specific Tickers

```bash
# Update just a few tickers
python populate_ticker_data.py --tickers AAPL MSFT GOOGL

# Single ticker update
python populate_ticker_data.py --tickers AAPL --max-workers 1
```

### Management Commands

```bash
# List all ticker files with stats
python manage_ticker_data.py list

# Update specific tickers
python manage_ticker_data.py update AAPL MSFT GOOGL

# Find tickers with specific data
python manage_ticker_data.py find prints --min-count 5
python manage_ticker_data.py find boxes --min-count 3
python manage_ticker_data.py find levels --min-count 1

# Get data for a single ticker
python manage_ticker_data.py get AAPL

# Clean old files (older than 7 days)
python manage_ticker_data.py clean --days 7

# Export all data for TrendSpider import
python manage_ticker_data.py export combined_data.json
```

## Benefits for Hundreds of Tickers

### Performance
- **Individual files** - Only load data for tickers you need
- **Parallel processing** - Update multiple tickers concurrently
- **Selective updates** - Update only changed tickers
- **Fast lookups** - Direct file access by ticker symbol

### Scalability
- **No file size limits** - Each ticker file stays small
- **Independent processing** - No conflicts between ticker updates
- **Easy distribution** - Files can be split across systems
- **Incremental updates** - Update subsets without affecting others

### Management
- **Easy cleanup** - Remove old files by date
- **Data analysis** - Find tickers with specific criteria
- **Export flexibility** - Combine data as needed for different tools
- **File-level caching** - TrendSpider can cache individual ticker files

## Data Sources

- **Big Prints**: VolumeLeaders.com API (rank 30 or better, top 10 per ticker)
- **Support/Resistance Levels**: VolumeLeaders trade levels (top 5 per ticker)
- **Price Boxes**: Sweep box data (18M+ dollar minimum)

## Rate Limiting

The scripts include built-in rate limiting:
- 0.5 second delay between API calls per ticker
- Configurable max concurrent workers (default: 3)
- Timeout protection (60s for levels, 120s for boxes)

## Example Workflows

### Daily Update
```bash
# Update all tickers with current data
python populate_ticker_data.py --days-back 90

# Clean old files
python manage_ticker_data.py clean --days 3
```

### Selective Update
```bash
# Update only high-volume tickers
python manage_ticker_data.py update AAPL MSFT GOOGL AMZN TSLA

# Find and update tickers missing recent data
python manage_ticker_data.py find prints --min-count 0  # Find tickers with no prints
```

### TrendSpider Integration
```bash
# Export combined data for TrendSpider import
python manage_ticker_data.py export trendspider_import.json

# Or load individual ticker files directly in TrendSpider
# Files are located in: ticker_data/SYMBOL.json
```

## Migration from Old System

The old consolidated files (`big_prints.json`, `price_boxes.json`, `support_resistance_levels.json`) can be kept for compatibility, but the new per-ticker system is recommended for hundreds of tickers.

To migrate existing workflows:
1. Use `populate_ticker_data.py` instead of the individual populate scripts
2. Use `manage_ticker_data.py` for file management
3. Load individual ticker files or use the export function for bulk data 