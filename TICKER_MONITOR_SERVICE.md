# TrendSpider Ticker Monitor Service

This service automatically monitors the `ticker_list.json` file for changes and repopulates the TrendSpider data files when changes are detected.

## Overview

The service performs the following actions when ticker list changes are detected:

1. **Monitor** - Watches `/Users/stephenbae/Projects/moe-bot/trendspider_data/ticker_list.json` for file changes
2. **Repopulate** - Runs populate scripts for `support_resistance_levels.json` and `price_boxes.json`
3. **Copy** - Copies updated files to `/Users/stephenbae/Projects/moe-bot-trendspider-data/trendspider_data/`
4. **Commit & Push** - Automatically commits and pushes changes to the git repository

## Files

### Core Files
- **Monitor Script**: `/Users/stephenbae/Projects/moe-bot/trendspider_data/monitor_ticker_changes.py`
- **LaunchD Plist**: `~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist`
- **Setup Script**: `/Users/stephenbae/Projects/moe-bot/setup_ticker_monitor.sh`

### Log Files
- **Main Log**: `/Users/stephenbae/Projects/moe-bot/logs/ticker_monitor.log`
- **Stdout Log**: `/Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stdout.log`
- **Stderr Log**: `/Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stderr.log`

## Installation

Run the setup script from the main project directory:

```bash
cd /Users/stephenbae/Projects/moe-bot
./setup_ticker_monitor.sh
```

## Service Management

### Check Service Status
```bash
launchctl list | grep ticker.monitor
```

### View Live Logs
```bash
tail -f /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor.log
```

### Stop Service
```bash
launchctl unload ~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist
```

### Start Service
```bash
launchctl load ~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist
```

### Manual Test Run
```bash
python3 /Users/stephenbae/Projects/moe-bot/trendspider_data/monitor_ticker_changes.py --once
```

## Service Configuration

### LaunchD Properties
- **Label**: `com.moebot.trendspider.ticker.monitor`
- **Process Type**: Background
- **Keep Alive**: Yes (restarts on crashes)
- **Run At Load**: Yes (starts automatically)
- **Watch Paths**: Monitors `ticker_list.json` for file changes
- **Throttle Interval**: 10 seconds (prevents rapid restarts)
- **Nice Level**: 1 (lower priority)

### Environment
- **Python**: Uses virtual environment at `/Users/stephenbae/Projects/moe-bot/.venv/bin/python3`
- **Working Directory**: `/Users/stephenbae/Projects/moe-bot/trendspider_data`
- **PATH**: Includes virtual environment bin directory
- **PYTHONPATH**: Set to main project directory

## Monitoring Behavior

### Change Detection
- Monitors file using MD5 hash comparison
- Checks every 30 seconds
- Ignores initial startup (no action on first hash calculation)

### Error Handling
- 5-minute timeout for populate scripts
- Graceful handling of missing files
- Continues operation on individual script failures
- Extended retry intervals on unexpected errors

### Git Operations
- Only commits if there are actual changes
- Auto-generates commit messages with timestamp and ticker count
- Pushes to `origin main` branch
- Handles authentication via existing git configuration

## Troubleshooting

### Service Not Starting
1. Check if plist file exists: `ls ~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist`
2. Verify script permissions: `ls -la /Users/stephenbae/Projects/moe-bot/trendspider_data/monitor_ticker_changes.py`
3. Check error logs: `cat /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stderr.log`

### Populate Scripts Failing
1. Test individual scripts manually:
   ```bash
   cd /Users/stephenbae/Projects/moe-bot/trendspider_data
   python3 populate_support_resistance.py
   python3 populate_price_boxes.py
   ```
2. Check cookies file exists: `ls /Users/stephenbae/Projects/moe-bot/cookies.json`
3. Verify network connectivity to VolumeLeaders API

### Git Operations Failing
1. Check git configuration: `cd /Users/stephenbae/Projects/moe-bot-trendspider-data && git status`
2. Verify authentication: `git remote -v`
3. Ensure repository is clean: `git diff`

## Performance Notes

- Service runs as background process with lower priority
- Populate scripts have 5-minute timeout protection
- File monitoring uses efficient hash-based change detection
- Git operations only occur when actual changes are detected
- Log rotation should be configured for long-term operation

## Dependencies

- Python 3 with virtual environment
- Git with configured authentication
- VolumeLeaders API access (cookies.json)
- TrendSpider populate scripts
- Network connectivity for API calls and git push operations 