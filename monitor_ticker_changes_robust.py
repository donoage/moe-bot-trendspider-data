#!/usr/bin/env python3
"""
Robust TrendSpider ticker monitor with batching and resume capability.
Handles memory pressure by processing tickers in small batches and can resume from failures.
"""

import os
import sys
import json
import time
import hashlib
import subprocess
import logging
import argparse
import gc
import psutil
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/Users/stephenbae/Projects/moe-bot/logs/ticker_monitor_robust.log'),
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
PROGRESS_FILE = f"{MAIN_PROJECT_DIR}/logs/ticker_monitor_progress.json"
BATCH_SIZE = 50  # Process 50 tickers at a time
MEMORY_THRESHOLD_MB = 1000  # Stop if memory usage exceeds 1GB

class RobustTickerMonitor:
    def __init__(self, batch_size=BATCH_SIZE, max_workers=1):
        self.batch_size = batch_size
        self.max_workers = max_workers
        self.progress_file = PROGRESS_FILE
        self.processed_tickers = set()
        self.failed_tickers = set()
        self.load_progress()
        
    def load_progress(self):
        """Load progress from previous run"""
        try:
            if os.path.exists(self.progress_file):
                with open(self.progress_file, 'r') as f:
                    data = json.load(f)
                    self.processed_tickers = set(data.get('processed', []))
                    self.failed_tickers = set(data.get('failed', []))
                    logger.info(f"Loaded progress: {len(self.processed_tickers)} processed, {len(self.failed_tickers)} failed")
        except Exception as e:
            logger.warning(f"Could not load progress: {e}")
            self.processed_tickers = set()
            self.failed_tickers = set()
    
    def save_progress(self):
        """Save current progress"""
        try:
            progress_data = {
                'processed': list(self.processed_tickers),
                'failed': list(self.failed_tickers),
                'last_update': datetime.now().isoformat()
            }
            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save progress: {e}")
    
    def clear_progress(self):
        """Clear progress file for fresh start"""
        try:
            if os.path.exists(self.progress_file):
                os.remove(self.progress_file)
            self.processed_tickers = set()
            self.failed_tickers = set()
            logger.info("Progress cleared for fresh start")
        except Exception as e:
            logger.error(f"Could not clear progress: {e}")
    
    def check_memory_usage(self):
        """Check current memory usage"""
        try:
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            
            # Get system memory info
            system_memory = psutil.virtual_memory()
            available_mb = system_memory.available / 1024 / 1024
            
            logger.info(f"Memory usage: {memory_mb:.1f}MB, Available: {available_mb:.1f}MB")
            
            # Return True if we should continue, False if memory is too high
            return memory_mb < MEMORY_THRESHOLD_MB and available_mb > 200
        except Exception as e:
            logger.warning(f"Could not check memory: {e}")
            return True
    
    def force_cleanup(self):
        """Force garbage collection and cleanup"""
        gc.collect()
        time.sleep(2)  # Give system time to cleanup
    
    def load_ticker_list(self):
        """Load base_tickers from the volumeleaders_config.json file"""
        config_file = Path(MAIN_PROJECT_DIR) / 'volumeleaders_config.json'
        
        try:
            with open(config_file, 'r') as f:
                data = json.load(f)
                base_tickers = data.get('base_tickers', [])
                logger.info(f"Loaded {len(base_tickers)} base_tickers from volumeleaders_config.json")
                return base_tickers
        except FileNotFoundError:
            logger.error(f"Error: volumeleaders_config.json not found at {config_file}")
            return []
        except json.JSONDecodeError as e:
            logger.error(f"Error: Invalid JSON in volumeleaders_config.json: {e}")
            return []
    
    def process_ticker_batch(self, ticker_batch):
        """Process a batch of tickers"""
        logger.info(f"Processing batch of {len(ticker_batch)} tickers")
        
        # Check memory before processing
        if not self.check_memory_usage():
            logger.warning("Memory usage too high, forcing cleanup")
            self.force_cleanup()
            
            # Check again after cleanup
            if not self.check_memory_usage():
                logger.error("Memory usage still too high after cleanup, stopping batch")
                return False
        
        # Create command for populate_ticker_data.py
        cmd = [
            sys.executable,
            f"{MAIN_TRENDSPIDER_DIR}/populate_ticker_data.py",
            "--max-workers", str(self.max_workers),
            "--tickers"
        ] + ticker_batch
        
        try:
            # Run the populate script for this batch
            logger.info(f"Running populate_ticker_data.py for {len(ticker_batch)} tickers")
            result = subprocess.run(
                cmd,
                cwd=MAIN_TRENDSPIDER_DIR,
                capture_output=True,
                text=True,
                timeout=1800  # 30 minute timeout per batch
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully processed batch of {len(ticker_batch)} tickers")
                self.processed_tickers.update(ticker_batch)
                return True
            else:
                logger.error(f"Batch processing failed with return code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
                self.failed_tickers.update(ticker_batch)
                return False
                
        except subprocess.TimeoutExpired:
            logger.error(f"Batch processing timed out after 30 minutes")
            self.failed_tickers.update(ticker_batch)
            return False
        except Exception as e:
            logger.error(f"Error processing batch: {e}")
            self.failed_tickers.update(ticker_batch)
            return False
        finally:
            # Always force cleanup after each batch
            self.force_cleanup()
    
    def copy_files_to_repo(self):
        """Copy generated files to the repository"""
        try:
            logger.info("Copying files to repository...")
            
            # Ensure repo directory exists
            os.makedirs(REPO_TRENDSPIDER_DIR, exist_ok=True)
            
            # Copy ticker_data directory
            source_ticker_data = f"{MAIN_TRENDSPIDER_DIR}/ticker_data"
            dest_ticker_data = f"{REPO_TRENDSPIDER_DIR}/ticker_data"
            
            if os.path.exists(source_ticker_data):
                subprocess.run([
                    "rsync", "-av", "--delete",
                    f"{source_ticker_data}/",
                    f"{dest_ticker_data}/"
                ], check=True)
                logger.info("Successfully copied ticker_data to repository")
            
            return True
        except Exception as e:
            logger.error(f"Error copying files to repository: {e}")
            return False
    
    def commit_and_push(self):
        """Commit and push changes to git repository"""
        try:
            logger.info("Committing and pushing changes...")
            
            # Change to repo directory
            os.chdir(REPO_DIR)
            
            # Add all changes
            subprocess.run(["git", "add", "."], check=True)
            
            # Check if there are changes to commit
            result = subprocess.run(
                ["git", "diff", "--cached", "--quiet"],
                capture_output=True
            )
            
            if result.returncode != 0:  # There are changes
                # Commit changes
                commit_message = f"Automated ticker data update - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                subprocess.run(["git", "commit", "-m", commit_message], check=True)
                
                # Push changes
                subprocess.run(["git", "push"], check=True)
                logger.info("Successfully committed and pushed changes")
            else:
                logger.info("No changes to commit")
            
            return True
        except Exception as e:
            logger.error(f"Error committing and pushing: {e}")
            return False
    
    def run_full_refresh(self, clear_progress=False):
        """Run full refresh with batching and resume capability"""
        if clear_progress:
            self.clear_progress()
        
        # Load ticker list
        all_tickers = self.load_ticker_list()
        if not all_tickers:
            logger.error("No tickers loaded, exiting")
            return False
        
        # Filter out already processed tickers (unless clearing progress)
        if not clear_progress:
            remaining_tickers = [t for t in all_tickers if t not in self.processed_tickers]
        else:
            remaining_tickers = all_tickers
        
        logger.info(f"Total tickers: {len(all_tickers)}")
        logger.info(f"Already processed: {len(self.processed_tickers)}")
        logger.info(f"Remaining to process: {len(remaining_tickers)}")
        
        if not remaining_tickers:
            logger.info("All tickers already processed!")
            return True
        
        # Process tickers in batches
        total_batches = (len(remaining_tickers) + self.batch_size - 1) // self.batch_size
        successful_batches = 0
        
        for i in range(0, len(remaining_tickers), self.batch_size):
            batch_num = i // self.batch_size + 1
            batch = remaining_tickers[i:i + self.batch_size]
            
            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} tickers)")
            
            # Process the batch
            if self.process_ticker_batch(batch):
                successful_batches += 1
                logger.info(f"Batch {batch_num} completed successfully")
            else:
                logger.error(f"Batch {batch_num} failed")
            
            # Save progress after each batch
            self.save_progress()
            
            # Check memory and system health
            if not self.check_memory_usage():
                logger.warning("Memory usage too high, stopping processing")
                break
            
            # Small delay between batches to let system recover
            time.sleep(5)
        
        # Final summary
        total_processed = len(self.processed_tickers)
        total_failed = len(self.failed_tickers)
        
        logger.info(f"Processing complete!")
        logger.info(f"Successfully processed: {total_processed}/{len(all_tickers)} tickers")
        logger.info(f"Failed: {total_failed} tickers")
        logger.info(f"Successful batches: {successful_batches}/{total_batches}")
        
        # Copy files and commit if we processed anything
        if total_processed > 0:
            if self.copy_files_to_repo():
                self.commit_and_push()
        
        # Clear progress if we completed successfully
        if total_processed == len(all_tickers):
            logger.info("All tickers processed successfully, clearing progress")
            self.clear_progress()
            return True
        else:
            logger.info("Some tickers remain unprocessed, progress saved for next run")
            return False

def main():
    parser = argparse.ArgumentParser(description='Robust TrendSpider ticker monitor')
    parser.add_argument('--full-refresh', action='store_true', help='Run full refresh of all tickers')
    parser.add_argument('--clear-progress', action='store_true', help='Clear progress and start fresh')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Number of tickers per batch')
    parser.add_argument('--max-workers', type=int, default=1, help='Maximum worker threads')
    parser.add_argument('--resume', action='store_true', help='Resume from previous progress')
    
    args = parser.parse_args()
    
    # Create monitor instance
    monitor = RobustTickerMonitor(
        batch_size=args.batch_size,
        max_workers=args.max_workers
    )
    
    if args.full_refresh or args.resume:
        success = monitor.run_full_refresh(clear_progress=args.clear_progress)
        sys.exit(0 if success else 1)
    else:
        logger.info("No action specified. Use --full-refresh or --resume")
        sys.exit(1)

if __name__ == "__main__":
    main() 