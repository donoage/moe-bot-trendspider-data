#!/usr/bin/env python3
"""
Monitor ticker_list.json for changes and automatically repopulate TrendSpider data files.
When changes are detected:
1. Repopulate price_boxes.json and support_resistance_levels.json (incremental for new tickers)
2. Copy files to /Users/stephenbae/Projects/moe-bot-trendspider-data/trendspider_data
3. Commit and push changes to git repository
"""

import os
import sys
import json
import time
import hashlib
import subprocess
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/Users/stephenbae/Projects/moe-bot/logs/ticker_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Paths
MAIN_PROJECT_DIR = "/Users/stephenbae/Projects/moe-bot"
REPO_DIR = "/Users/stephenbae/Projects/moe-bot-trendspider-data"
TICKER_LIST_FILE = f"{MAIN_PROJECT_DIR}/trendspider_data/ticker_list.json"
MAIN_TRENDSPIDER_DIR = f"{MAIN_PROJECT_DIR}/trendspider_data"
REPO_TRENDSPIDER_DIR = f"{REPO_DIR}/trendspider_data"
TICKER_CACHE_FILE = f"{MAIN_PROJECT_DIR}/logs/ticker_cache.json"

# Scripts to run for repopulation
POPULATE_SCRIPTS = {
    "support_resistance_levels.json": f"{MAIN_TRENDSPIDER_DIR}/populate_support_resistance.py",
    "price_boxes.json": f"{MAIN_TRENDSPIDER_DIR}/populate_price_boxes.py"
}

def get_file_hash(filepath):
    """Get MD5 hash of a file for change detection"""
    try:
        with open(filepath, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.error(f"Error calculating hash for {filepath}: {e}")
        return None

def load_ticker_list():
    """Load current ticker list"""
    try:
        with open(TICKER_LIST_FILE, 'r') as f:
            data = json.load(f)
            tickers = data.get('tickers', [])
            logger.info(f"Current ticker list: {', '.join(tickers)}")
            return tickers
    except Exception as e:
        logger.error(f"Error loading ticker list: {e}")
        return []

def load_ticker_cache():
    """Load the cached ticker list from previous run"""
    try:
        with open(TICKER_CACHE_FILE, 'r') as f:
            data = json.load(f)
            return data.get('tickers', [])
    except FileNotFoundError:
        logger.info("No ticker cache found, treating all tickers as new")
        return []
    except Exception as e:
        logger.error(f"Error loading ticker cache: {e}")
        return []

def save_ticker_cache(tickers):
    """Save current ticker list to cache"""
    try:
        cache_data = {
            "tickers": tickers,
            "last_updated": datetime.now().isoformat()
        }
        with open(TICKER_CACHE_FILE, 'w') as f:
            json.dump(cache_data, f, indent=2)
        logger.debug(f"Saved ticker cache with {len(tickers)} tickers")
    except Exception as e:
        logger.error(f"Error saving ticker cache: {e}")

def detect_ticker_changes(current_tickers, cached_tickers):
    """Detect new and removed tickers"""
    current_set = set(current_tickers)
    cached_set = set(cached_tickers)
    
    new_tickers = list(current_set - cached_set)
    removed_tickers = list(cached_set - current_set)
    
    return new_tickers, removed_tickers

def run_populate_script_for_tickers(script_path, data_file, tickers=None, full_refresh=False):
    """Run a populate script for specific tickers or full refresh"""
    try:
        if full_refresh or not tickers:
            logger.info(f"Running full populate script for {data_file}...")
            cmd = [sys.executable, script_path]
        else:
            logger.info(f"Running incremental populate script for {data_file} with tickers: {', '.join(tickers)}")
            cmd = [sys.executable, script_path, '--incremental'] + tickers
        
        # Change to the script directory
        script_dir = os.path.dirname(script_path)
        
        # Run the script with proper environment
        result = subprocess.run(
            cmd,
            cwd=script_dir,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Successfully populated {data_file}")
            logger.debug(f"Script output: {result.stdout}")
            return True
        else:
            logger.error(f"❌ Failed to populate {data_file}")
            logger.error(f"Error output: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Timeout running populate script for {data_file}")
        return False
    except Exception as e:
        logger.error(f"❌ Error running populate script for {data_file}: {e}")
        return False

def copy_files_to_repo():
    """Copy JSON files from main project to repository"""
    files_to_copy = [
        "ticker_list.json",
        "support_resistance_levels.json", 
        "price_boxes.json"
    ]
    
    copied_files = []
    
    for filename in files_to_copy:
        src_file = f"{MAIN_TRENDSPIDER_DIR}/{filename}"
        dst_file = f"{REPO_TRENDSPIDER_DIR}/{filename}"
        
        try:
            if os.path.exists(src_file):
                # Ensure destination directory exists
                os.makedirs(os.path.dirname(dst_file), exist_ok=True)
                
                # Copy file
                subprocess.run(['cp', src_file, dst_file], check=True)
                logger.info(f"📁 Copied {filename} to repository")
                copied_files.append(filename)
            else:
                logger.warning(f"⚠️ Source file not found: {src_file}")
                
        except Exception as e:
            logger.error(f"❌ Error copying {filename}: {e}")
    
    return copied_files

def commit_and_push_changes(copied_files, new_tickers=None, removed_tickers=None, full_refresh=False):
    """Commit and push changes to git repository"""
    try:
        # Change to repository directory
        os.chdir(REPO_DIR)
        
        # Add the copied files
        for filename in copied_files:
            subprocess.run(['git', 'add', f'trendspider_data/{filename}'], check=True)
        
        # Check if there are any changes to commit
        result = subprocess.run(['git', 'diff', '--cached', '--quiet'], capture_output=True)
        
        if result.returncode != 0:  # There are changes to commit
            # Create commit message
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            tickers = load_ticker_list()
            
            if full_refresh:
                commit_msg = f"Weekly refresh: TrendSpider data - {len(tickers)} tickers ({timestamp})"
            elif new_tickers or removed_tickers:
                changes = []
                if new_tickers:
                    changes.append(f"Added: {', '.join(new_tickers)}")
                if removed_tickers:
                    changes.append(f"Removed: {', '.join(removed_tickers)}")
                commit_msg = f"Incremental update: {' | '.join(changes)} - {len(tickers)} total tickers ({timestamp})"
            else:
                commit_msg = f"Auto-update TrendSpider data - {len(tickers)} tickers ({timestamp})"
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
            logger.info(f"📝 Committed changes: {commit_msg}")
            
            # Push to remote
            subprocess.run(['git', 'push', 'origin', 'main'], check=True)
            logger.info("🚀 Pushed changes to repository")
            
            return True
        else:
            logger.info("ℹ️ No changes to commit")
            return False
            
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Git operation failed: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Error during git operations: {e}")
        return False

def repopulate_data_files(new_tickers=None, full_refresh=False):
    """Repopulate TrendSpider data files (incremental or full)"""
    if full_refresh:
        logger.info("🔄 Starting full data repopulation (weekly refresh)...")
    elif new_tickers:
        logger.info(f"🔄 Starting incremental data repopulation for new tickers: {', '.join(new_tickers)}")
    else:
        logger.info("🔄 Starting data repopulation...")
    
    success_count = 0
    total_scripts = len(POPULATE_SCRIPTS)
    
    for data_file, script_path in POPULATE_SCRIPTS.items():
        if os.path.exists(script_path):
            if run_populate_script_for_tickers(script_path, data_file, new_tickers, full_refresh):
                success_count += 1
        else:
            logger.error(f"❌ Populate script not found: {script_path}")
    
    if success_count == total_scripts:
        logger.info(f"✅ Successfully repopulated all {total_scripts} data files")
        return True
    else:
        logger.warning(f"⚠️ Only {success_count}/{total_scripts} data files were successfully repopulated")
        return success_count > 0

def monitor_ticker_changes():
    """Main monitoring loop"""
    logger.info("🎯 Starting TrendSpider ticker monitoring...")
    logger.info(f"📂 Monitoring file: {TICKER_LIST_FILE}")
    logger.info(f"📁 Repository directory: {REPO_DIR}")
    logger.info("⏰ Check interval: 10 minutes")
    
    last_hash = None
    last_tickers = None
    
    while True:
        try:
            # Check if ticker list file exists
            if not os.path.exists(TICKER_LIST_FILE):
                logger.warning(f"⚠️ Ticker list file not found: {TICKER_LIST_FILE}")
                time.sleep(600)  # Wait 10 minutes
                continue
            
            # Calculate current hash
            current_hash = get_file_hash(TICKER_LIST_FILE)
            current_tickers = load_ticker_list()
            
            # Check for changes
            if current_hash != last_hash and last_hash is not None:
                logger.info("🔍 Ticker list change detected!")
                logger.info(f"Previous tickers: {last_tickers}")
                logger.info(f"Current tickers: {current_tickers}")
                
                # Detect what changed
                cached_tickers = load_ticker_cache()
                new_tickers, removed_tickers = detect_ticker_changes(current_tickers, cached_tickers)
                
                if new_tickers:
                    logger.info(f"📈 New tickers detected: {', '.join(new_tickers)}")
                if removed_tickers:
                    logger.info(f"📉 Removed tickers: {', '.join(removed_tickers)}")
                
                # Repopulate data files (incremental for new tickers only)
                if repopulate_data_files(new_tickers=new_tickers if new_tickers else None):
                    # Update ticker cache
                    save_ticker_cache(current_tickers)
                    
                    # Copy files to repository
                    copied_files = copy_files_to_repo()
                    
                    if copied_files:
                        # Commit and push changes
                        if commit_and_push_changes(copied_files, new_tickers, removed_tickers):
                            logger.info("🎉 Successfully completed ticker change processing!")
                        else:
                            logger.warning("⚠️ Data repopulated and copied, but git operations failed")
                    else:
                        logger.warning("⚠️ Data repopulated but file copying failed")
                else:
                    logger.error("❌ Data repopulation failed, skipping git operations")
            
            # Update tracking variables
            last_hash = current_hash
            last_tickers = current_tickers
            
            # Wait 10 minutes before next check
            logger.debug("💤 Sleeping for 10 minutes until next check...")
            time.sleep(600)
            
        except KeyboardInterrupt:
            logger.info("🛑 Monitoring stopped by user")
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error in monitoring loop: {e}")
            time.sleep(600)  # Wait 10 minutes on errors

def run_once():
    """Run a single repopulation cycle (triggered by file change or scheduled)"""
    # Check if this is likely a scheduled run vs file change trigger
    # We'll use a more reliable method: check if there are actual ticker changes
    current_tickers = load_ticker_list()
    cached_tickers = load_ticker_cache()
    new_tickers, removed_tickers = detect_ticker_changes(current_tickers, cached_tickers)
    
    # Determine if this is a scheduled run or file change
    is_scheduled_run = False
    
    # If no ticker changes but the job is running, it's likely a scheduled run
    if not new_tickers and not removed_tickers and cached_tickers:
        is_scheduled_run = True
        logger.info("🗓️ TrendSpider ticker monitor - Weekly scheduled refresh")
        logger.info("📅 Running weekly data refresh (Sunday 9 PM)")
    elif new_tickers or removed_tickers:
        logger.info("🔄 Ticker list change detected - starting incremental update...")
        if new_tickers:
            logger.info(f"📈 New tickers detected: {', '.join(new_tickers)}")
        if removed_tickers:
            logger.info(f"📉 Removed tickers: {', '.join(removed_tickers)}")
    else:
        # First run (no cache) - treat as full refresh
        logger.info("🔄 First run detected - performing full data population...")
        is_scheduled_run = True
    
    logger.info(f"Current ticker list ({len(current_tickers)} tickers): {', '.join(current_tickers)}")
    
    if is_scheduled_run:
        # Weekly refresh or first run - repopulate everything
        if repopulate_data_files(full_refresh=True):
            save_ticker_cache(current_tickers)
            copied_files = copy_files_to_repo()
            if copied_files:
                if commit_and_push_changes(copied_files, full_refresh=True):
                    logger.info("🎉 Successfully completed weekly refresh!")
                else:
                    logger.warning("⚠️ Data repopulated and copied, but git operations failed")
            else:
                logger.warning("⚠️ Data repopulated but file copying failed")
        else:
            logger.error("❌ Data repopulation failed, skipping git operations")
    else:
        # File change trigger - incremental update for new tickers only
        if new_tickers:
            if repopulate_data_files(new_tickers=new_tickers):
                save_ticker_cache(current_tickers)
                copied_files = copy_files_to_repo()
                if copied_files:
                    if commit_and_push_changes(copied_files, new_tickers, removed_tickers):
                        logger.info("🎉 Successfully completed incremental update!")
                    else:
                        logger.warning("⚠️ Data repopulated and copied, but git operations failed")
                else:
                    logger.warning("⚠️ Data repopulated but file copying failed")
            else:
                logger.error("❌ Data repopulation failed, skipping git operations")
        else:
            # Only removals, just update cache
            logger.info("ℹ️ Only ticker removals detected, updating cache")
            save_ticker_cache(current_tickers)

if __name__ == "__main__":
    # Create logs directory if it doesn't exist
    os.makedirs("/Users/stephenbae/Projects/moe-bot/logs", exist_ok=True)
    
    # Check command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        logger.info("🎯 TrendSpider ticker monitor triggered by file change")
        run_once()
    else:
        logger.info("🎯 Starting TrendSpider ticker monitoring in continuous mode...")
        logger.info("⚠️ Note: For event-driven execution, use --once flag")
        monitor_ticker_changes() 