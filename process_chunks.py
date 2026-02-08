#!/usr/bin/env python3
"""
Process tickers in smaller chunks to avoid batch processing issues
"""

import json
import subprocess
import sys
import time
import gc
from pathlib import Path
from datetime import datetime
from io import StringIO

def load_base_tickers():
    """Load base_tickers from the volumeleaders_config.json file"""
    config_file = Path(__file__).parent.parent / 'moe-bot' / 'volumeleaders_config.json'
    
    try:
        with open(config_file, 'r') as f:
            data = json.load(f)
            base_tickers = data.get('base_tickers', [])
            print(f"Loaded {len(base_tickers)} base_tickers from volumeleaders_config.json")
            return base_tickers
    except FileNotFoundError:
        print(f"Error: volumeleaders_config.json not found at {config_file}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in volumeleaders_config.json: {e}")
        return []

def process_chunk(tickers_chunk, chunk_num, total_chunks, python_path=None, script_path=None):
    """Process a single chunk of tickers by calling populate_ticker_data.main() directly.
    
    This avoids spawning a subprocess, keeping everything in a single process
    to prevent macOS jetsam from killing the process coalition.
    """
    print(f"\n{'='*60}")
    print(f"🚀 PROCESSING CHUNK {chunk_num}/{total_chunks}")
    print(f"📊 Tickers: {', '.join(tickers_chunk[:5])}{'...' if len(tickers_chunk) > 5 else ''}")
    print(f"📈 Count: {len(tickers_chunk)} tickers")
    print(f"⏰ Started: {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*60}")
    sys.stdout.flush()
    
    start_time = time.time()
    
    print(f"🔄 Processing chunk {chunk_num}/{total_chunks} in-process (no subprocess)...")
    sys.stdout.flush()
    
    try:
        # Import populate_ticker_data and call main() directly
        # This keeps everything in a single process to avoid jetsam kills
        import populate_ticker_data
        
        # Simulate the CLI args that populate_ticker_data.main() expects
        original_argv = sys.argv
        sys.argv = ['populate_ticker_data.py', '--tickers'] + list(tickers_chunk) + ['--max-workers', '3', '--days-back', '90']
        
        try:
            populate_ticker_data.main()
            return_code = 0
        except SystemExit as e:
            return_code = e.code if e.code is not None else 0
        finally:
            sys.argv = original_argv
        
        elapsed_time = time.time() - start_time
        
        # Force garbage collection between chunks to keep memory low
        gc.collect()
        
        if return_code == 0:
            print(f"✅ Chunk {chunk_num}/{total_chunks} completed successfully!")
            print(f"⏱️  Time: {elapsed_time:.1f} seconds ({elapsed_time/60:.1f} minutes)")
            print(f"📊 Rate: {len(tickers_chunk)/elapsed_time:.2f} tickers/second")
            return True, len(tickers_chunk), elapsed_time
        else:
            print(f"❌ Chunk {chunk_num}/{total_chunks} failed!")
            print(f"Exit code: {return_code}")
            return False, 0, elapsed_time
            
    except Exception as e:
        elapsed_time = time.time() - start_time
        print(f"💥 Chunk {chunk_num}/{total_chunks} failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, 0, elapsed_time

def main():
    """Main function to process all tickers in chunks"""
    # Configuration
    CHUNK_SIZE = 50  # Process 50 tickers at a time (optimized for speed)
    PYTHON_PATH = "/Users/stephenbae/Projects/moe-bot/.venv/bin/python"
    SCRIPT_PATH = str(Path(__file__).parent / "populate_ticker_data.py")
    
    # Load all tickers
    all_tickers = load_base_tickers()
    if not all_tickers:
        print("❌ No tickers found!")
        sys.exit(1)
    
    # Split into chunks
    chunks = [all_tickers[i:i + CHUNK_SIZE] for i in range(0, len(all_tickers), CHUNK_SIZE)]
    total_chunks = len(chunks)
    
    print(f"\n🎯 CHUNK PROCESSING PLAN")
    print(f"📊 Total tickers: {len(all_tickers)}")
    print(f"📦 Chunk size: {CHUNK_SIZE}")
    print(f"🔢 Total chunks: {total_chunks}")
    print(f"⏱️  Estimated time: ~{total_chunks * 5} minutes")
    print(f"🚀 Starting at: {datetime.now().strftime('%H:%M:%S')}")
    print(f"🔄 Initializing chunk processing...")
    sys.stdout.flush()
    
    # Process each chunk
    successful_chunks = 0
    failed_chunks = 0
    total_processed = 0
    total_time = 0
    
    start_time = time.time()
    
    for i, chunk in enumerate(chunks, 1):
        success, processed_count, chunk_time = process_chunk(
            chunk, i, total_chunks, PYTHON_PATH, SCRIPT_PATH
        )
        
        if success:
            successful_chunks += 1
            total_processed += processed_count
        else:
            failed_chunks += 1
        
        total_time += chunk_time
        
        # Show overall progress
        overall_elapsed = time.time() - start_time
        remaining_chunks = total_chunks - i
        avg_time_per_chunk = overall_elapsed / i
        estimated_remaining = remaining_chunks * avg_time_per_chunk
        
        print(f"\n📊 OVERALL PROGRESS:")
        print(f"   ✅ Successful chunks: {successful_chunks}/{i}")
        print(f"   ❌ Failed chunks: {failed_chunks}/{i}")
        print(f"   📈 Tickers processed: {total_processed}/{len(all_tickers)}")
        print(f"   ⏱️  Elapsed: {overall_elapsed/60:.1f} minutes")
        print(f"   🔮 Estimated remaining: {estimated_remaining/60:.1f} minutes")
        print(f"   🎯 ETA: {datetime.fromtimestamp(time.time() + estimated_remaining).strftime('%H:%M:%S')}")
        
        # Small delay between chunks
        if i < total_chunks:
            print(f"⏸️  Waiting 5 seconds before next chunk...")
            time.sleep(5)
    
    # Final summary
    total_elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"🎉 PROCESSING COMPLETE!")
    print(f"{'='*60}")
    print(f"✅ Successful chunks: {successful_chunks}/{total_chunks}")
    print(f"❌ Failed chunks: {failed_chunks}/{total_chunks}")
    print(f"📈 Total tickers processed: {total_processed}/{len(all_tickers)}")
    print(f"⏱️  Total time: {total_elapsed/60:.1f} minutes")
    print(f"📊 Average rate: {total_processed/total_elapsed:.2f} tickers/second")
    print(f"🏁 Finished at: {datetime.now().strftime('%H:%M:%S')}")
    
    if failed_chunks > 0:
        print(f"\n⚠️  {failed_chunks} chunks failed. You may want to retry those manually.")
        sys.exit(1)
    else:
        print(f"\n🎊 All chunks completed successfully!")

if __name__ == "__main__":
    main()
