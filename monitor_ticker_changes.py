#!/usr/bin/env python3
"""
Monitor volumeleaders_config.json for changes and automatically update per-ticker TrendSpider data files.
When changes are detected:
1. Update individual ticker files using populate_ticker_data.py
2. Commit and push changes to git repository
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
CONFIG_FILE = f"{MAIN_PROJECT_DIR}/volumeleaders_config.json"
TICKER_CACHE_FILE = f"{MAIN_PROJECT_DIR}/logs/ticker_cache.json"
POPULATE_SCRIPT = f"{REPO_DIR}/populate_ticker_data.py"
CHUNK_SCRIPT = f"{REPO_DIR}/process_chunks.py"
PYTHON_PATH = f"{MAIN_PROJECT_DIR}/.venv/bin/python3"

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

def load_base_tickers():
    """Load current base_tickers from volumeleaders_config.json"""
    try:
        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
            tickers = data.get('base_tickers', [])
            logger.info(f"Current base_tickers count: {len(tickers)}")
            return tickers
    except Exception as e:
        logger.error(f"Error loading base_tickers: {e}")
        return []

def load_ticker_cache():
    """Load the cached ticker list from previous run"""
    try:
        with open(TICKER_CACHE_FILE, 'r') as f:
            data = json.load(f)
            return data.get('base_tickers', [])
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
            "base_tickers": tickers,
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

def update_ticker_data(tickers=None, full_refresh=False):
    """Update ticker data using populate_ticker_data.py"""
    try:
        if full_refresh or not tickers:
            logger.info(f"Running full ticker data update using chunk processing...")
            cmd = [PYTHON_PATH, CHUNK_SCRIPT]
        else:
            # Batch large ticker lists to avoid OOM kills
            BATCH_SIZE = 100
            if len(tickers) > BATCH_SIZE:
                logger.info(f"Running batched incremental update for {len(tickers)} tickers ({(len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE} batches of {BATCH_SIZE})")
                for i in range(0, len(tickers), BATCH_SIZE):
                    batch = tickers[i:i + BATCH_SIZE]
                    batch_num = i // BATCH_SIZE + 1
                    total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
                    logger.info(f"Processing batch {batch_num}/{total_batches}: {len(batch)} tickers")
                    batch_cmd = [PYTHON_PATH, POPULATE_SCRIPT, '--tickers'] + batch + ['--max-workers', '3']
                    batch_result = subprocess.run(
                        batch_cmd,
                        cwd=REPO_DIR,
                        capture_output=True,
                        text=True,
                        encoding='utf-8',
                        errors='replace',
                        timeout=600,  # 10 min per batch
                    )
                    if batch_result.returncode != 0:
                        logger.error(f"Batch {batch_num} failed (exit {batch_result.returncode})")
                        if batch_result.stderr:
                            for line in batch_result.stderr.strip().split('\n')[-5:]:
                                logger.error(f"  {line}")
                    else:
                        logger.info(f"Batch {batch_num}/{total_batches} done")
                logger.info(f"All {(len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE} batches complete")
                return True

            logger.info(f"Running incremental update for {len(tickers)} tickers: {', '.join(tickers[:10])}{'...' if len(tickers) > 10 else ''}")
            cmd = [PYTHON_PATH, POPULATE_SCRIPT, '--tickers'] + tickers + ['--max-workers', '3']
        
        # For full refresh, call process_chunks.main() directly (no subprocess)
        # This keeps everything in a single process to avoid macOS jetsam kills
        if full_refresh:
            logger.info(f"🚀 Starting full refresh with chunk processing...")
            ticker_count = len(load_base_tickers())
            estimated_minutes = ticker_count // 10  # ~10 tickers per minute with chunk processing
            logger.info(f"⏱️  Estimated time: ~{estimated_minutes} minutes for {ticker_count} tickers in chunks")
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚀 Starting chunk processing of {ticker_count} tickers...")
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 📦 Processing in chunks of 50 tickers each")
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⏱️  Estimated completion time: ~{estimated_minutes} minutes")
            sys.stdout.flush()
            
            # Import and call process_chunks.main() directly instead of subprocess
            # This avoids the 3-process tree that macOS jetsam targets
            try:
                # Ensure the repo dir is importable
                if REPO_DIR not in sys.path:
                    sys.path.insert(0, REPO_DIR)
                import process_chunks
                process_chunks.main()
                
                completion_time = datetime.now().strftime('%H:%M:%S')
                print(f"[{completion_time}] ✅ Chunk processing completed successfully!")
                print(f"[{completion_time}] 📊 All {ticker_count} tickers processed in chunks")
                logger.info(f"✅ Successfully updated ticker data")
                return True
            except SystemExit as e:
                exit_code = e.code if e.code is not None else 0
                if exit_code == 0:
                    completion_time = datetime.now().strftime('%H:%M:%S')
                    print(f"[{completion_time}] ✅ Chunk processing completed successfully!")
                    logger.info(f"✅ Successfully updated ticker data")
                    return True
                else:
                    failure_time = datetime.now().strftime('%H:%M:%S')
                    print(f"[{failure_time}] ❌ Chunk processing failed (exit code: {exit_code})")
                    logger.error(f"❌ Failed to update ticker data (exit code: {exit_code})")
                    return False
            except Exception as e:
                failure_time = datetime.now().strftime('%H:%M:%S')
                print(f"[{failure_time}] ❌ Chunk processing failed with exception: {e}")
                logger.error(f"❌ Failed to update ticker data: {e}")
                import traceback
                traceback.print_exc()
                return False
                
        else:
            # For incremental updates, use the existing capture method
            result = subprocess.run(
                cmd,
                cwd=REPO_DIR,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',  # Replace invalid UTF-8 characters instead of failing
                timeout=7200  # 2 hour timeout for large updates
            )
            
            if result.returncode == 0:
                logger.info(f"✅ Successfully updated ticker data")
                # Only log first few lines of output to avoid encoding issues in logs
                if result.stdout:
                    output_lines = result.stdout.split('\n')
                    for line in output_lines[-10:]:  # Show last 10 lines
                        if line.strip():
                            logger.debug(f"Script output: {line.strip()}")
                return True
            else:
                logger.error(f"❌ Failed to update ticker data")
                if result.stderr:
                    # Handle stderr with encoding safety
                    stderr_lines = result.stderr.split('\n')
                    for line in stderr_lines[-5:]:  # Show last 5 error lines
                        if line.strip():
                            logger.error(f"Error output: {line.strip()}")
                return False
            
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Timeout updating ticker data")
        return False
    except UnicodeDecodeError as e:
        logger.error(f"❌ Encoding error updating ticker data: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Error updating ticker data: {e}")
        return False

def cleanup_removed_tickers(removed_tickers):
    """Remove ticker files for tickers that are no longer in the list"""
    ticker_data_dir = Path(REPO_DIR) / "ticker_data"
    removed_files = []
    
    for ticker in removed_tickers:
        ticker_file = ticker_data_dir / f"{ticker}.json"
        if ticker_file.exists():
            try:
                ticker_file.unlink()
                logger.info(f"🗑️ Removed ticker file: {ticker}.json")
                removed_files.append(f"ticker_data/{ticker}.json")
            except Exception as e:
                logger.error(f"❌ Error removing {ticker}.json: {e}")
    
    return removed_files

def commit_and_push_changes(new_tickers=None, removed_tickers=None, full_refresh=False):
    """Commit and push changes to git repository"""
    try:
        # Change to repository directory
        os.chdir(REPO_DIR)
        
        # Add all ticker data files
        subprocess.run(['git', 'add', 'ticker_data/'], check=True)
        
        # Check if there are any changes to commit
        result = subprocess.run(['git', 'diff', '--cached', '--quiet'], capture_output=True)
        
        if result.returncode != 0:  # There are changes to commit
            # Create commit message
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            current_tickers = load_base_tickers()
            
            if full_refresh:
                commit_msg = f"Daily refresh: TrendSpider per-ticker data - {len(current_tickers)} tickers ({timestamp})"
            elif new_tickers or removed_tickers:
                changes = []
                if new_tickers:
                    changes.append(f"Added: {', '.join(new_tickers[:5])}{'...' if len(new_tickers) > 5 else ''}")
                if removed_tickers:
                    changes.append(f"Removed: {', '.join(removed_tickers[:5])}{'...' if len(removed_tickers) > 5 else ''}")
                commit_msg = f"Incremental update: {' | '.join(changes)} - {len(current_tickers)} total tickers ({timestamp})"
            else:
                commit_msg = f"TrendSpider data update - {len(current_tickers)} tickers ({timestamp})"
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
            logger.info(f"📝 Committed changes: {commit_msg}")
            
            # Push to remote
            subprocess.run(['git', 'push'], check=True)
            logger.info(f"🚀 Pushed changes to remote repository")
            
            return True
        else:
            logger.info("📋 No changes to commit")
            return False
            
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Git operation failed: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Error committing changes: {e}")
        return False

def process_ticker_changes(new_tickers=None, removed_tickers=None, full_refresh=False):
    """Process ticker changes by updating data and committing"""
    success = True
    
    # Remove files for removed tickers first
    if removed_tickers:
        cleanup_removed_tickers(removed_tickers)
    
    # Update ticker data
    if new_tickers or full_refresh:
        if not update_ticker_data(new_tickers, full_refresh):
            success = False
    
    # Commit and push changes
    if success:
        commit_and_push_changes(new_tickers, removed_tickers, full_refresh)
    
    return success

def monitor_ticker_changes():
    """Main monitoring loop"""
    logger.info("🔍 Starting ticker change monitoring...")
    
    last_hash = None
    
    while True:
        try:
            # Check if config file has changed
            current_hash = get_file_hash(CONFIG_FILE)
            
            if current_hash is None:
                logger.error(f"❌ Cannot read config file: {CONFIG_FILE}")
                time.sleep(60)
                continue
            
            if last_hash is None:
                last_hash = current_hash
                logger.info("📋 Initial config file hash recorded")
                # Load initial cache
                current_tickers = load_base_tickers()
                save_ticker_cache(current_tickers)
                time.sleep(30)
                continue
            
            if current_hash != last_hash:
                logger.info("📝 Config file changed, processing updates...")
                
                # Load current and cached tickers
                current_tickers = load_base_tickers()
                cached_tickers = load_ticker_cache()
                
                # Detect changes
                new_tickers, removed_tickers = detect_ticker_changes(current_tickers, cached_tickers)
                
                if new_tickers or removed_tickers:
                    logger.info(f"📊 Changes detected - New: {len(new_tickers)}, Removed: {len(removed_tickers)}")
                    
                    # Process changes
                    if process_ticker_changes(new_tickers, removed_tickers):
                        # Update cache with new ticker list
                        save_ticker_cache(current_tickers)
                        logger.info("✅ Successfully processed ticker changes")
                    else:
                        logger.error("❌ Failed to process ticker changes")
                else:
                    logger.info("📋 Config file changed but no ticker changes detected")
                    save_ticker_cache(current_tickers)
                
                last_hash = current_hash
            
            time.sleep(30)  # Check every 30 seconds
            
        except KeyboardInterrupt:
            logger.info("🛑 Monitoring stopped by user")
            break
        except Exception as e:
            logger.error(f"❌ Error in monitoring loop: {e}")
            time.sleep(60)  # Wait longer on error

def run_once():
    """Run ticker change detection once and exit"""
    logger.info("🔄 Running one-time ticker change check...")
    
    try:
        # Load current and cached tickers
        current_tickers = load_base_tickers()
        cached_tickers = load_ticker_cache()
        
        # Detect changes
        new_tickers, removed_tickers = detect_ticker_changes(current_tickers, cached_tickers)
        
        if new_tickers or removed_tickers:
            logger.info(f"📊 Changes detected - New: {len(new_tickers)}, Removed: {len(removed_tickers)}")
            
            # Process changes
            if process_ticker_changes(new_tickers, removed_tickers):
                # Update cache with new ticker list
                save_ticker_cache(current_tickers)
                logger.info("✅ Successfully processed ticker changes")
                return True
            else:
                logger.error("❌ Failed to process ticker changes")
                return False
        else:
            logger.info("📋 No ticker changes detected")
            save_ticker_cache(current_tickers)  # Update cache timestamp
            return True
            
    except Exception as e:
        logger.error(f"❌ Error in one-time check: {e}")
        return False

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Monitor volumeleaders_config.json for ticker changes')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--full-refresh', action='store_true', help='Force full refresh of all tickers')
    
    args = parser.parse_args()
    
    if args.full_refresh:
        logger.info("🔄 Running full refresh of all tickers...")
        current_tickers = load_base_tickers()
        if process_ticker_changes(full_refresh=True):
            save_ticker_cache(current_tickers)
            logger.info("✅ Full refresh completed successfully")
        else:
            logger.error("❌ Full refresh failed")
            sys.exit(1)
    elif args.once:
        if not run_once():
            sys.exit(1)
    else:
        monitor_ticker_changes()

if __name__ == "__main__":
    main() 