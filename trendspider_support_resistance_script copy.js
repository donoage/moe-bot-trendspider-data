describe_indicator('Moebot VL Trendspider v5.5.4 (Fresh Load)', 'overlay');

// Execution tracking and fresh load mechanisms
const executionId = Math.random().toString(36).substr(2, 9);
const currentTime = Date.now();
const randomDelay = Math.floor(Math.random() * 300) + 100;
const symbolHash = (typeof constants !== 'undefined' && constants.ticker) ? 
    constants.ticker.toUpperCase().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0) : 0;

// Force fresh load tracking
const tickerChangeDetector = constants.ticker + '_' + Math.floor(Date.now() / 60000); // Changes every minute
const scriptInstanceId = executionId + '_' + symbolHash + '_' + currentTime;

console.log('🚀 Starting execution ID: ' + executionId + ' for ' + (typeof constants !== 'undefined' && constants.ticker ? constants.ticker.toUpperCase() : 'UNKNOWN'));
console.log('📊 Ticker change detector: ' + tickerChangeDetector);
console.log('🔄 Script instance ID: ' + scriptInstanceId);

// Configuration
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = true;
const showPrints = true;
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 2;
const showLabels = true;
const levelsOpacity = 0.7;
const boxesOpacity = 0.1;
const boxLinesOpacity = 0.8;

// Projection configuration - number of bars to project into the future
const projectionLength = 15; // Project lines 15 bars into the future

// Helper functions
function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    else if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    else if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function timestampToBarIndex(timestamp) {
    const targetTime = Date.parse(timestamp);
    for (let i = 0; i < time.length; i++) {
        if (time[i] * 1000 >= targetTime) return Math.max(0, i);
    }
    return time.length - 1;
}

function getColorWithOpacity(colorHex, opacity) {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
}

// Binary search function for optimization (avoiding 'new' keyword)
function binarySearchBounds(arr, target) {
    let left = 0;
    let right = arr.length - 1;
    let result = -1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid] <= target) {
            result = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    return result;
}

// Optimized data landing function using land_data_onto_candles
function landDataOntoCandles(dataArray, timestampArray) {
    // Create arrays for the data to be landed onto candles
    const landedData = [];
    const landedTimestamps = [];
    
    // Convert data for land_data_onto_candles function
    for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] && timestampArray[i]) {
            landedData.push(dataArray[i]);
            landedTimestamps.push(timestampArray[i]);
        }
    }
    
    // Use land_data_onto_candles for performance optimization
    if (typeof land_data_onto_candles !== 'undefined' && landedData.length > 0) {
        try {
            return land_data_onto_candles(landedData, landedTimestamps);
        } catch (e) {
            console.warn('land_data_onto_candles failed, falling back to manual mapping:', e);
            return manualDataMapping(dataArray, timestampArray);
        }
    } else {
        return manualDataMapping(dataArray, timestampArray);
    }
}

// Fallback manual data mapping
function manualDataMapping(dataArray, timestampArray) {
    const mappedData = [];
    
    for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] && timestampArray[i]) {
            // Use binary search for better performance
            const barIndex = binarySearchBounds(time, timestampArray[i]);
            if (barIndex >= 0) {
                mappedData.push({
                    data: dataArray[i],
                    barIndex: barIndex
                });
            }
        }
    }
    
    return mappedData;
}

// Initialize empty array for fallback and clear any previous state
const emptyLine = [];
for (let i = 0; i < close.length; i++) {
    emptyLine[i] = NaN;
}

// Force fresh execution state - no global state persistence
// Each script execution is completely independent
console.log('[' + executionId + '] 🔄 Fresh execution state - no cached data from previous runs');

try {
    const currentSymbol = constants.ticker.toUpperCase();
    
    // Enhanced cache busting for fresh loads on ticker change
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const timestampMinutes = Math.floor(Date.now() / 60000); // Changes every minute
    const browserCacheBuster = Math.random().toString(36).substr(2, 12);
    
    // Multi-layer cache busting approach
    const cacheBuster = [
        timestampSeconds,
        executionId,
        randomDelay,
        currentSymbol,
        symbolHash,
        timestampMinutes,
        browserCacheBuster,
        scriptInstanceId.substr(-8) // Last 8 chars of instance ID
    ].join('_');
    
    const tickerDataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/ticker_data/' + currentSymbol + '.json?v=' + cacheBuster + '&t=' + timestampSeconds + '&r=' + browserCacheBuster;
    
    console.log('[' + executionId + '] Loading data for ' + currentSymbol);
    console.log('[' + executionId + '] Cache buster: ' + cacheBuster.substr(0, 50) + '...');
    
    // Use simple HTTP request - cache busting handled via URL parameters
    const tickerResponse = await request.http(tickerDataUrl);
    
    if (tickerResponse.error) {
        console.error('HTTP Error loading ticker data:', tickerResponse.error);
        console.error('URL attempted:', tickerDataUrl.substr(0, 100) + '...');
        paint(emptyLine, { name: 'No_Data', color: '#888888' });
    } else {
        const tickerData = tickerResponse;
        let paintedCount = 0;
        
        console.log('[' + executionId + '] ✅ Successfully loaded fresh data for ' + currentSymbol);
        console.log('[' + executionId + '] Data timestamp check:', tickerData.last_updated || 'No timestamp available');
        
        // Dynamically determine max counts from actual ticker data
        const rawLevels = tickerData.levels || [];
        const rawBoxes = tickerData.boxes || [];
        const rawPrints = tickerData.prints || [];
        
        // Set dynamic maximums based on actual data (with reasonable limits for performance)
        const MAX_LEVELS = Math.min(rawLevels.length, 25); // Max 25 levels for performance
        const MAX_BOXES = Math.min(rawBoxes.length, 15);   // Max 15 boxes for performance
        const MAX_PRINTS = Math.min(rawPrints.length, 20); // Max 20 prints for performance
        
        console.log('[' + executionId + '] Dynamic limits: Levels=' + MAX_LEVELS + ', Boxes=' + MAX_BOXES + ', Prints=' + MAX_PRINTS);
        
        // Generate static line names based on actual data counts
        const LEVEL_NAMES = [];
        const BOX_NAMES = [];
        const PRINT_NAMES = [];
        
        for (let i = 0; i < MAX_LEVELS; i++) {
            LEVEL_NAMES.push('Level_' + (i + 1));
        }
        for (let i = 0; i < MAX_BOXES; i++) {
            BOX_NAMES.push('Box_' + (i + 1));
        }
        for (let i = 0; i < MAX_PRINTS; i++) {
            PRINT_NAMES.push('Print_' + (i + 1));
        }
        
        // Consolidation functions
        function consolidateLevels(levels, consolidationThreshold) {
            if (!levels || levels.length === 0) return [];
            
            const sortedLevels = [...levels].sort((a, b) => a.price - b.price);
            const consolidated = [];
            let currentGroup = [sortedLevels[0]];
            
            for (let i = 1; i < sortedLevels.length; i++) {
                const level = sortedLevels[i];
                const groupAvgPrice = currentGroup.reduce((sum, l) => sum + l.price, 0) / currentGroup.length;
                const priceDistance = Math.abs(level.price - groupAvgPrice);
                const distancePercent = priceDistance / groupAvgPrice * 100;
                const absoluteThreshold = 0.21;
                const withinAbsoluteThreshold = priceDistance <= absoluteThreshold;
                const withinPercentThreshold = distancePercent <= consolidationThreshold;
                
                if (withinPercentThreshold || withinAbsoluteThreshold) {
                    currentGroup.push(level);
                } else {
                    consolidated.push(consolidateGroup(currentGroup));
                    currentGroup = [level];
                }
            }
            
            if (currentGroup.length > 0) {
                consolidated.push(consolidateGroup(currentGroup));
            }
            
            return consolidated;
        }
        
        function consolidateGroup(group) {
            if (group.length === 1) return group[0];
            
            let totalVolume = 0;
            let weightedPriceSum = 0;
            let totalDollars = 0;
            let bestRank = 999999;
            
            group.forEach(level => {
                const levelVolume = level.volume || 0;
                const levelDollars = level.dollars || 0;
                const levelRank = parseInt(level.rank) || 999999;
                
                totalVolume += levelVolume;
                totalDollars += levelDollars;
                
                if (levelVolume > 0) {
                    weightedPriceSum += level.price * levelVolume;
                } else {
                    weightedPriceSum += level.price;
                }
                
                if (levelRank < bestRank) {
                    bestRank = levelRank;
                }
            });
            
            let consolidatedPrice;
            if (totalVolume > 0) {
                consolidatedPrice = weightedPriceSum / totalVolume;
            } else {
                consolidatedPrice = group.reduce((sum, l) => sum + l.price, 0) / group.length;
            }
            
            return {
                price: consolidatedPrice,
                volume: totalVolume,
                dollars: totalDollars,
                rank: bestRank === 999999 ? '' : bestRank.toString(),
                consolidatedCount: group.length,
                originalPrices: group.map(l => l.price),
                allRanks: group.map(l => l.rank).filter(r => r && parseInt(r) > 0)
            };
        }
        
        // Process support/resistance levels with performance optimization
        const consolidationThreshold = 0.1;
        const levels = consolidateLevels(rawLevels, consolidationThreshold);
        
        // Limit levels to dynamic maximum
        const processedLevels = levels.slice(0, MAX_LEVELS);
        
        if (processedLevels.length > 0) {
            processedLevels.forEach(function(level, index) {
                // Dynamic color assignment for support/resistance levels
                let color = '#C0C0C0';    // Light grey for support/resistance levels
                
                const levelLine = [];
                for (let i = 0; i < close.length; i++) {
                    levelLine[i] = level.price;
                }
                
                const paintedLine = paint(levelLine, {
                    name: LEVEL_NAMES[index],
                    color: color,
                    thickness: lineWidth,
                    style: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });
                
                // Create projection array for future bars
                const projectionArray = [];
                for (let i = 0; i < projectionLength; i++) {
                    projectionArray[i] = level.price;
                }
                
                // Paint projection into the future
                const projectedLine = paint_projection(projectionArray, {
                    name: LEVEL_NAMES[index] + '_Proj',
                    color: color,
                    thickness: lineWidth,
                    style: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });
                
                paintedCount++;
            });
        }
        
        // Process price boxes with performance optimization
        const processedBoxes = rawBoxes.slice(0, MAX_BOXES);
        
        if (processedBoxes.length > 0 && showPriceBoxes) {
            const chartLength = close.length;
            const boxWidth = 15;
            const rightMargin = 10;
            
            processedBoxes.forEach(function(box, index) {
                try {
                    const boxEndIndex = chartLength - 1;
                    const boxStartIndex = chartLength - rightMargin - boxWidth - (index * 5);
                    
                    if (boxStartIndex >= 0 && boxEndIndex >= 0 && boxStartIndex < boxEndIndex) {
                        const topPrice = box.high_price;
                        const bottomPrice = box.low_price;
                        const priceRange = topPrice - bottomPrice;
                        const midPrice = (topPrice + bottomPrice) / 2;
                        
                        // Determine if this should be a line or a box
                        const isSinglePricePoint = (priceRange === 0); // Same high and low price
                        const priceThreshold = Math.max(0.50, midPrice * 0.05);
                        const hasLargePriceRange = priceRange > priceThreshold;
                        
                        // Use lines when: 1) Same price point, OR 2) Very large price range
                        const useLines = isSinglePricePoint || hasLargePriceRange;
                        
                        // Dynamic color assignment for price boxes
                        const boxLineColor = '#00BFFF';     // Deep Sky Blue for price boxes
                        const fillColor = boxLineColor;
                        
                        if (useLines) {
                            // For single price points, only draw one line
                            if (isSinglePricePoint) {
                                // Single line at the price level
                                const lineArray = [];
                                
                                for (let i = 0; i < close.length; i++) {
                                    if (i >= boxStartIndex && i <= boxEndIndex) {
                                        lineArray[i] = topPrice; // Use topPrice (same as bottomPrice)
                                    } else {
                                        lineArray[i] = NaN;
                                    }
                                }
                                
                                const singleLine = paint(lineArray, {
                                    name: BOX_NAMES[index],
                                    color: boxLineColor,
                                    thickness: 2, // Slightly thicker for single lines
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                // Create projection for single line
                                const singleProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    singleProjectionArray[i] = topPrice;
                                }
                                
                                const singleProjectedLine = paint_projection(singleProjectionArray, {
                                    name: BOX_NAMES[index] + '_Proj',
                                    color: boxLineColor,
                                    thickness: 2,
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                            } else {
                                // Two separate lines for large price ranges
                                const topLineArray = [];
                                const bottomLineArray = [];
                                
                                for (let i = 0; i < close.length; i++) {
                                    if (i >= boxStartIndex && i <= boxEndIndex) {
                                        topLineArray[i] = topPrice;
                                        bottomLineArray[i] = bottomPrice;
                                    } else {
                                        topLineArray[i] = NaN;
                                        bottomLineArray[i] = NaN;
                                    }
                                }
                                
                                const topLine = paint(topLineArray, {
                                    name: BOX_NAMES[index] + '_Top',
                                    color: boxLineColor,
                                    thickness: 1,
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                const bottomLine = paint(bottomLineArray, {
                                    name: BOX_NAMES[index] + '_Bottom',
                                    color: boxLineColor,
                                    thickness: 1,
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                // Create projections for top and bottom lines
                                const topProjectionArray = [];
                                const bottomProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    topProjectionArray[i] = topPrice;
                                    bottomProjectionArray[i] = bottomPrice;
                                }
                                
                                const topProjectedLine = paint_projection(topProjectionArray, {
                                    name: BOX_NAMES[index] + '_Top_Proj',
                                    color: boxLineColor,
                                    thickness: 1,
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                const bottomProjectedLine = paint_projection(bottomProjectionArray, {
                                    name: BOX_NAMES[index] + '_Bottom_Proj',
                                    color: boxLineColor,
                                    thickness: 1,
                                    style: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                            }
                        } else {
                            const topLineArray = [];
                            const bottomLineArray = [];
                            
                            for (let i = 0; i < close.length; i++) {
                                if (i >= boxStartIndex && i <= boxEndIndex) {
                                    topLineArray[i] = topPrice;
                                    bottomLineArray[i] = bottomPrice;
                                } else {
                                    topLineArray[i] = NaN;
                                    bottomLineArray[i] = NaN;
                                }
                            }
                            
                            const topLine = paint(topLineArray, {
                                name: BOX_NAMES[index] + '_Top',
                                color: boxLineColor,
                                thickness: 1,
                                style: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            const bottomLine = paint(bottomLineArray, {
                                name: BOX_NAMES[index] + '_Bottom',
                                color: boxLineColor,
                                thickness: 1,
                                style: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            // Create projections for box top and bottom lines
                            const boxTopProjectionArray = [];
                            const boxBottomProjectionArray = [];
                            for (let i = 0; i < projectionLength; i++) {
                                boxTopProjectionArray[i] = topPrice;
                                boxBottomProjectionArray[i] = bottomPrice;
                            }
                            
                            const boxTopProjectedLine = paint_projection(boxTopProjectionArray, {
                                name: BOX_NAMES[index] + '_Top_Proj',
                                color: boxLineColor,
                                thickness: 1,
                                style: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            const boxBottomProjectedLine = paint_projection(boxBottomProjectionArray, {
                                name: BOX_NAMES[index] + '_Bottom_Proj',
                                color: boxLineColor,
                                thickness: 1,
                                style: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            fill(topLine, bottomLine, fillColor, boxesOpacity, BOX_NAMES[index] + '_Fill');
                        }
                        
                        paintedCount += 1;
                    }
                } catch (boxError) {
                    console.error('Error processing box ' + box.box_number + ':', boxError);
                }
            });
        }
        
        // Process prints with performance optimization using land_data_onto_candles
        const processedPrints = rawPrints.slice(0, MAX_PRINTS);
        
        if (processedPrints.length > 0 && showPrints) {
            // Extract print data and timestamps for optimization
            const printPrices = [];
            const printTimestamps = [];
            
            processedPrints.forEach(function(print) {
                if (print.price && print.timestamp) {
                    printPrices.push(print.price);
                    printTimestamps.push(print.timestamp);
                }
            });
            
            // Use optimized data landing
            const landedPrintData = landDataOntoCandles(printPrices, printTimestamps);
            
            // Track painted print lines to avoid duplicates
            const paintedPrintPrices = {};
            let printLineIndex = 0;
            
            processedPrints.forEach(function(print, index) {
                if (printLineIndex >= MAX_PRINTS) return;
                
                const rankNumber = parseInt(print.rank) || 999;
                
                // Draw horizontal line for prints ranked 5 or better (only once per price level)
                if (rankNumber <= 5 && print.price) {
                    const priceKey = print.price.toFixed(2);
                    if (!paintedPrintPrices[priceKey]) {
                        paintedPrintPrices[priceKey] = true;
                        
                        const printLineArray = [];
                        for (let i = 0; i < close.length; i++) {
                            printLineArray[i] = print.price;
                        }
                        
                        const printLine = paint(printLineArray, {
                            name: PRINT_NAMES[printLineIndex],
                            color: '#FFFF00', // Yellow for prints
                            thickness: 2, // Thicker line to stand out
                            style: 'solid', // Solid line instead of dashed
                            transparency: 0.1 // More opaque (90% opacity)
                        });
                        
                        // Create projection for print line
                        const printProjectionArray = [];
                        for (let i = 0; i < projectionLength; i++) {
                            printProjectionArray[i] = print.price;
                        }
                        
                        const printProjectedLine = paint_projection(printProjectionArray, {
                            name: PRINT_NAMES[printLineIndex] + '_Proj',
                            color: '#FFFF00',
                            thickness: 2,
                            style: 'solid',
                            transparency: 0.1
                        });
                        
                        paintedCount++;
                        printLineIndex++;
                    }
                }
            });
        }
        
        if (paintedCount > 0) {
            console.log('[' + executionId + '] Total painted elements: ' + paintedCount);
        } else {
            console.log('[' + executionId + '] No data found for ' + currentSymbol);
            paint(emptyLine, { name: 'No_Data', color: '#888888' });
        }
        
        console.log('🏁 Completed execution ID: ' + executionId + ' with fresh data load');
        console.log('📈 Final ticker: ' + currentSymbol + ' | Instance: ' + scriptInstanceId.substr(-8));
    }
    
} catch (error) {
    console.error('Error loading data:', error);
    paint(emptyLine, { name: 'Script_Error', color: '#FF0000' });
} 