# Top Daily Watchlist Generator

This folder contains the scripts to generate high-probability watchlists based on market data sources.

## Core Files

- `generate_high_probability_watchlist.py` - Main script for generating watchlists
- `watchlist_utils.py` - Shared utility functions for watchlist generation
- `load_vl_levels.py` - Functions to load VolumeLeaders trade level data
- `fetch_vl_levels.py` - Functions to fetch VolumeLeaders trade level data

## Usage

```bash
# Generate a standard high-probability watchlist
python generate_high_probability_watchlist.py

# Generate only the elite watchlist (top 5 tickers)
python generate_high_probability_watchlist.py --elite-only

# Generate both standard and elite watchlists
python generate_high_probability_watchlist.py --generate-all

# Include ETFs in the watchlist (they're excluded by default)
python generate_high_probability_watchlist.py --include-etfs
```

## MSD and ClusterBomb Labeling System

This project maintains tracking systems for two key market signals:

1. **Market Structure Detection (MSD)** signals
2. **Cluster Bomb** events (multiple dark pool trades on the same day)

Tickers that show these signals are automatically labeled in Discord alerts.

### Project Structure

#### Key Directories

- **`setup_scripts/`** - Installation and setup scripts
- **`plist_scripts/`** - Shell scripts used by launchd job files
- **`logs/`** - Centralized logs from all system components
- **`data/`** - Data files including trade information
- **`marketsurge/`** - Market surge detection functionality

#### How to Configure System Jobs

Launchd job files (plist) are configured to use scripts in the `plist_scripts/` directory. To reload all jobs after making changes:

```bash
./plist_scripts/reload_launchd_jobs.sh
```

#### Deprecated Scripts

Some scripts in the `plist_scripts` directory are kept for reference but are no longer actively used:

- **`marketsurge_launcher.sh`** - Replaced by directly calling `marketsurge/send_to_discord.py --find-tickers` from launchd jobs
- **`trade_levels_cron.sh`** - Replaced by `discord-bot/vl_trade_level_touches.js` which is called by the vltradeleveltouches launchd job

### Setup Scripts

All installation and setup scripts have been organized in the `setup_scripts/` directory. See the README in that directory for details on each script and its purpose.

### MSD Ticker History

The system maintains a rolling 3-month history of stocks that have shown Market Structure Detection (MSD) signals. This data is stored in `msd_ticker_history.json` in the project root directory.

#### How MSD Tracking Works

- Both daily (`msd_report.js`) and weekly (`msd_weekly_report.js`) MSD reports contribute to this history
- The history tracks:
  - When each ticker was first and last seen with an MSD
  - Total number of appearances in MSD reports
  - Total trade count across all appearances
  - Detailed data for each date a ticker appeared, including ranks and trade counts
- Data older than 3 months is automatically pruned
- Tickers with recent MSD activity (within 30 days) are labeled with ✨ *MSD* ✨ in Discord alerts

### ClusterBomb Tracking

The system also tracks tickers that have multiple dark pool trades on the same day, identified as "cluster bombs". This data is stored in `clusterbomb_ticker_history.json`.

#### How ClusterBomb Tracking Works

- The system scans `sent_trades_*.pkl` files for tickers with multiple trades on the same day
- These tickers are recorded with details on:
  - When they were first and last seen
  - How many times they've appeared
  - Total number of trades
  - Whether they were "hot" (3+ trades in a day)
- Tickers with recent cluster bombs (within 30 days) are labeled with 💣 *ClusterBomb* 💣 in Discord alerts

### Integrated Discord Alerts

Both labeling systems are integrated into:

1. **Volume Leaders alerts** - JavaScript-based (`vl_trade_level_touches.js`)
2. **Analyst Upgrades alerts** - Python-based (`unusual_whales_analyst_upgrades.py`)
3. **Market Surge alerts** - Python-based (`marketsurge/send_to_discord.py`)

### Example Data Formats

#### MSD History
```json
{
  "tickers": {
    "AAPL": {
      "lastSeen": "2025-05-03",
      "firstSeen": "2025-04-20",
      "appearances": 5,
      "totalTrades": 47,
      "appearances_by_date": {
        "2025-04-20": {
          "rank1": "1",
          "rank2": "3",
          "tradeCount": 12,
          "isHot": true
        },
        "2025-05-03": {
          "rank1": "2",
          "rank2": "5",
          "tradeCount": 8,
          "isHot": false
        }
      }
    }
  }
}
```

#### ClusterBomb History
```json
{
  "tickers": {
    "NVDA": {
      "firstSeen": "2025-05-02",
      "lastSeen": "2025-05-03",
      "appearances": 2,
      "totalTrades": 5,
      "appearances_by_date": {
        "2025-05-02": {
          "tradeCount": 2,
          "isHot": false
        },
        "2025-05-03": {
          "tradeCount": 3,
          "isHot": true
        }
      }
    }
  }
}
```

## History Data

This project includes historical data for tracking stocks:

1. **MSD Ticker History** (msd_ticker_history.json)
   - Contains 132 tickers with history from 2025-02-03 to 2025-05-02
   - Data is fetched using `fetch_historical_msd.js` script

2. **ClusterBomb Ticker History** (clusterbomb_ticker_history.json)
   - Contains 102 tickers with history from 2025-03-05 to 2025-05-02
   - Generated from sent_trades pickle files created during normal operation
   - Can be updated using `update_clusterbomb_history.py`


This script will update MSD data and process existing ClusterBomb data to ensure both datasets have recent history.

## Market Surge Scripts

Various scripts to fetch data from MarketSurge service:

- `marketsurge/40-eps.py` - Fetches stocks with EPS 40+ growth
- `marketsurge/45-sales.py` - Fetches stocks with Sales 45+ growth
- `marketsurge/90-90-90.py` - Fetches stocks with 90-90-90 ratings
- `marketsurge/bases-forming.py` - Fetches stocks that are currently forming bases
- `marketsurge/breakingout-today.py` - Fetches stocks breaking out today
- `marketsurge/downturn-strength.py` - Fetches stocks showing strength in downturns
- `marketsurge/massive-volume.py` - Fetches stocks with massive volume
- `marketsurge/recent-breakouts.py` - Fetches recent breakout stocks
- `marketsurge/solid-leaders.py` - Fetches solid leading stocks
- `marketsurge/the-best.py` - Fetches the best-performing stocks
- `marketsurge/tight-areas.py` - Fetches stocks in tight trading areas
- `marketsurge/top-10-groups.py` - Fetches top 10 industry groups
- `marketsurge/top-gainers.py` - Fetches top gaining stocks

Use these scripts with the following options:

```
python marketsurge/tight-areas.py --save          # Save the data to a JSON file
python marketsurge/tight-areas.py --tickers-only  # Save only tickers to a text file
python marketsurge/tight-areas.py --output custom_filename.json  # Specify custom output filename
```

If you get a 401 Unauthorized error, refresh your cookies:

```
python refresh_cookies.py
``` 