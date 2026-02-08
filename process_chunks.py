#!/usr/bin/env python3
"""
Process tickers in smaller chunks to avoid batch processing issues
"""

import json
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime

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

def process_chunk(tickers_chunk, chunk_num, total_chunks, python_path, script_path):
    """Process a single chunk of tickers"""
    print(f"\n{'='*60}")
    print(f"🚀 PROCESSING CHUNK {chunk_num}/{total_chunks}")
    print(f"📊 Tickers: {', '.join(tickers_chunk[:5])}{'...' if len(tickers_chunk) > 5 else ''}")
    print(f"📈 Count: {len(tickers_chunk)} tickers")
    print(f"⏰ Started: {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'='*60}")
    sys.stdout.flush()
    
    cmd = [
        python_path,
        script_path,
        '--tickers'
    ] + tickers_chunk + [
        '--max-workers', '3',
        '--days-back', '90'
    ]
    
    start_time = time.time()
    
    print(f"🔄 Executing command: {' '.join(cmd[:3])} [tickers...] {' '.join(cmd[-4:])}")
    print(f"⏳ Processing chunk {chunk_num}/{total_chunks}...")
    sys.stdout.flush()
    
    try:
        # Use Popen for real-time output streaming
        process = subprocess.Popen(
            cmd,
            cwd=str(Path(__file__).parent),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Stream output in real-time with heartbeat (cap stored lines to avoid memory bloat)
        output_lines = []
        MAX_KEPT_LINES = 20
        last_heartbeat = time.time()
        heartbeat_interval = 30  # Show heartbeat every 30 seconds
        
        while True:
            line = process.stdout.readline()
            if line:
                line = line.rstrip()
                output_lines.append(line)
                if len(output_lines) > MAX_KEPT_LINES:
                    output_lines = output_lines[-MAX_KEPT_LINES:]
                last_heartbeat = time.time()  # Reset heartbeat timer
                # Show progress indicators immediately
                if any(indicator in line for indicator in [
                    'Processing tickers:', '📈 Progress Update:', '✅ Completed:', 
                    '🎯 BATCH PROCESSING', '🎯 FETCHING', 'Date range:'
                ]):
                    print(f"   📊 {line}")
                    sys.stdout.flush()
            elif process.poll() is not None:
                break
            else:
                # Show heartbeat if no output for a while
                current_time = time.time()
                if current_time - last_heartbeat > heartbeat_interval:
                    elapsed = current_time - start_time
                    print(f"   💓 Chunk {chunk_num}/{total_chunks} still processing... ({elapsed/60:.1f}m elapsed)")
                    sys.stdout.flush()
                    last_heartbeat = current_time
                time.sleep(1)  # Small delay to prevent busy waiting
        
        # Wait for process to complete
        try:
            return_code = process.wait(timeout=300)  # 5 minute timeout per chunk
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait()
            raise subprocess.TimeoutExpired(cmd, 600)
        
        # Create a result-like object for compatibility
        class Result:
            def __init__(self, returncode, stdout, stderr=""):
                self.returncode = returncode
                self.stdout = "\n".join(output_lines)
                self.stderr = stderr
        
        result = Result(return_code, "\n".join(output_lines))
        
        elapsed_time = time.time() - start_time
        
        if result.returncode == 0:
            print(f"✅ Chunk {chunk_num}/{total_chunks} completed successfully!")
            print(f"⏱️  Time: {elapsed_time:.1f} seconds ({elapsed_time/60:.1f} minutes)")
            print(f"📊 Rate: {len(tickers_chunk)/elapsed_time:.2f} tickers/second")
            
            # Show last few lines of output for progress info
            if result.stdout:
                lines = result.stdout.strip().split('\n')
                for line in lines[-3:]:
                    if line.strip() and ('✅ Completed:' in line or 'Progress Update:' in line):
                        print(f"📈 {line.strip()}")
            
            return True, len(tickers_chunk), elapsed_time
        else:
            print(f"❌ Chunk {chunk_num}/{total_chunks} failed!")
            print(f"Exit code: {result.returncode}")
            if result.stderr:
                print(f"Error: {result.stderr[:500]}")
            return False, 0, elapsed_time
            
    except subprocess.TimeoutExpired:
        print(f"⏰ Chunk {chunk_num}/{total_chunks} timed out after 10 minutes")
        return False, 0, 600
    except Exception as e:
        print(f"💥 Chunk {chunk_num}/{total_chunks} failed with exception: {e}")
        return False, 0, 0

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
