#!/usr/bin/env python3
"""
Monitor ticker_list.json for changes and automatically repopulate TrendSpider data files.
When changes are detected:
1. Repopulate price_boxes.json and support_resistance_levels.json
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

def run_populate_script(script_path, data_file):
    """Run a populate script and return success status"""
    try:
        logger.info(f"Running populate script for {data_file}...")
        
        # Change to the script directory
        script_dir = os.path.dirname(script_path)
        
        # Run the script with proper environment
        result = subprocess.run(
            [sys.executable, script_path],
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

def commit_and_push_changes(copied_files):
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

def repopulate_data_files():
    """Repopulate all TrendSpider data files"""
    logger.info("🔄 Starting data repopulation...")
    
    success_count = 0
    total_scripts = len(POPULATE_SCRIPTS)
    
    for data_file, script_path in POPULATE_SCRIPTS.items():
        if os.path.exists(script_path):
            if run_populate_script(script_path, data_file):
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
    
    last_hash = None
    last_tickers = None
    
    while True:
        try:
            # Check if ticker list file exists
            if not os.path.exists(TICKER_LIST_FILE):
                logger.warning(f"⚠️ Ticker list file not found: {TICKER_LIST_FILE}")
                time.sleep(30)
                continue
            
            # Calculate current hash
            current_hash = get_file_hash(TICKER_LIST_FILE)
            current_tickers = load_ticker_list()
            
            # Check for changes
            if current_hash != last_hash and last_hash is not None:
                logger.info("🔍 Ticker list change detected!")
                logger.info(f"Previous tickers: {last_tickers}")
                logger.info(f"Current tickers: {current_tickers}")
                
                # Repopulate data files
                if repopulate_data_files():
                    # Copy files to repository
                    copied_files = copy_files_to_repo()
                    
                    if copied_files:
                        # Commit and push changes
                        if commit_and_push_changes(copied_files):
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
            
            # Wait before next check (30 seconds)
            time.sleep(30)
            
        except KeyboardInterrupt:
            logger.info("🛑 Monitoring stopped by user")
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error in monitoring loop: {e}")
            time.sleep(60)  # Wait longer on errors

def run_once():
    """Run a single repopulation cycle (for testing)"""
    logger.info("🔄 Running single repopulation cycle...")
    
    if repopulate_data_files():
        copied_files = copy_files_to_repo()
        if copied_files:
            commit_and_push_changes(copied_files)
            logger.info("✅ Single cycle completed successfully")
        else:
            logger.warning("⚠️ Single cycle completed with file copy issues")
    else:
        logger.error("❌ Single cycle failed during data repopulation")

if __name__ == "__main__":
    # Create logs directory if it doesn't exist
    os.makedirs("/Users/stephenbae/Projects/moe-bot/logs", exist_ok=True)
    
    # Check command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        run_once()
    else:
        monitor_ticker_changes() 