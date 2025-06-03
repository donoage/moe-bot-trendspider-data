#!/bin/bash

# Setup script for TrendSpider ticker monitoring service
# This script installs and starts the launchd job to monitor ticker_list.json changes

set -e

echo "🎯 Setting up TrendSpider ticker monitoring service..."

# Paths
PLIST_SOURCE="$(pwd)/com.moebot.trendspider.ticker.monitor.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist"
MONITOR_SCRIPT="/Users/stephenbae/Projects/moe-bot/trendspider_data/monitor_ticker_changes.py"
LOGS_DIR="/Users/stephenbae/Projects/moe-bot/logs"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p "$LOGS_DIR"

# Check if monitoring script exists
if [ ! -f "$MONITOR_SCRIPT" ]; then
    echo "❌ Error: Monitoring script not found at $MONITOR_SCRIPT"
    exit 1
fi

# Make monitoring script executable
echo "🔧 Making monitoring script executable..."
chmod +x "$MONITOR_SCRIPT"

# Check if plist file exists
if [ ! -f "$PLIST_SOURCE" ]; then
    echo "❌ Error: plist file not found at $PLIST_SOURCE"
    exit 1
fi

# Create LaunchAgents directory if it doesn't exist
echo "📂 Creating LaunchAgents directory..."
mkdir -p "$HOME/Library/LaunchAgents"

# Stop service if already running
echo "🛑 Stopping existing service (if running)..."
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Copy plist file to LaunchAgents
echo "📋 Installing plist file..."
cp "$PLIST_SOURCE" "$PLIST_DEST"

# Set proper permissions
chmod 644 "$PLIST_DEST"

# Load and start the service
echo "🚀 Loading and starting service..."
launchctl load "$PLIST_DEST"

# Check if service is running
sleep 2
if launchctl list | grep -q "com.moebot.trendspider.ticker.monitor"; then
    echo "✅ Service started successfully!"
    echo ""
    echo "📊 Service details:"
    echo "  • Service name: com.moebot.trendspider.ticker.monitor"
    echo "  • Monitoring file: /Users/stephenbae/Projects/moe-bot/trendspider_data/ticker_list.json"
    echo "  • Log file: /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor.log"
    echo "  • Stdout log: /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stdout.log"
    echo "  • Stderr log: /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stderr.log"
    echo ""
    echo "🎯 The service will now automatically:"
    echo "  1. Monitor ticker_list.json for changes"
    echo "  2. Repopulate price_boxes.json and support_resistance_levels.json"
    echo "  3. Copy files to /Users/stephenbae/Projects/moe-bot-trendspider-data"
    echo "  4. Commit and push changes to git repository"
    echo ""
    echo "📋 Useful commands:"
    echo "  • Check status: launchctl list | grep ticker.monitor"
    echo "  • View logs: tail -f /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor.log"
    echo "  • Stop service: launchctl unload ~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist"
    echo "  • Start service: launchctl load ~/Library/LaunchAgents/com.moebot.trendspider.ticker.monitor.plist"
    echo "  • Test manually: python3 /Users/stephenbae/Projects/moe-bot/trendspider_data/monitor_ticker_changes.py --once"
else
    echo "❌ Service failed to start. Check the logs for details:"
    echo "  • Error log: /Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_stderr.log"
    echo "  • System log: launchctl error for com.moebot.trendspider.ticker.monitor"
fi 