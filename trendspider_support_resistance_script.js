describe_indicator('Moebot VL Trendspider v4.9 (Auto Refresh)', 'overlay');

// Execution tracking with timestamp-based debouncing
const executionId = Math.random().toString(36).substr(2, 9);
const currentTime = Date.now();

// Add a small random delay to reduce simultaneous execution likelihood
const randomDelay = Math.floor(Math.random() * 300) + 100; // 100-400ms random delay

// Force refresh mechanism - include symbol in execution tracking
const symbolHash = (typeof constants !== 'undefined' && constants.ticker) ? 
    constants.ticker.toUpperCase().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0) : 0;

console.log('🚀 Starting execution ID: ' + executionId + ' (delay: ' + randomDelay + 'ms, time: ' + currentTime + ', symbolHash: ' + symbolHash + ')');
console.log('📊 Chart symbol detected: ' + (typeof constants !== 'undefined' && constants.ticker ? constants.ticker.toUpperCase() : 'UNKNOWN'));

// Configuration - these can be modified directly in the code
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = true; // Show price boxes
const showPrints = true; // Show individual prints - labels only, no red lines
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 2;
const showLabels = true; // Show text labels with volume and dollar info

// Opacity/Transparency settings (0.0 = fully transparent, 1.0 = fully opaque)
const levelsOpacity = 0.7; // Opacity for support/resistance levels
const boxesOpacity = 0.3; // Opacity for price boxes
const boxLinesOpacity = 0.8; // Opacity for box border lines

// Helper function to format numbers
function formatNumber(num) {
    // Add safety check for undefined/null values
    if (num === undefined || num === null || isNaN(num)) {
        return '0';
    }
    
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Helper function to convert timestamp to bar index
function timestampToBarIndex(timestamp) {
    const targetTime = Date.parse(timestamp);
    
    // Find the closest bar index to the timestamp
    for (let i = 0; i < time.length; i++) {
        if (time[i] * 1000 >= targetTime) {
            return Math.max(0, i);
        }
    }
    return time.length - 1;
}

// Helper function to get color with opacity
function getColorWithOpacity(colorHex, opacity) {
    // Convert hex to rgba for opacity support
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
}

// Helper function to convert timestamp to readable date string
function timestampToDateString(timestamp) {
    // Convert Unix timestamp (seconds) to approximate date
    // This is a simplified conversion for debugging purposes
    try {
        const days = Math.floor(timestamp / 86400);
        const startDate = 1970; // Unix epoch year
        const daysPerYear = 365.25;
        const year = Math.floor(days / daysPerYear) + startDate;
        
        const dayOfYear = days % Math.floor(daysPerYear);
        const month = Math.floor(dayOfYear / 30.44) + 1; // Approximate month
        const day = Math.floor(dayOfYear % 30.44) + 1; // Approximate day
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[Math.min(Math.max(month - 1, 0), 11)];
        
        return monthName + ' ' + day + ', ' + year;
    } catch (e) {
        return 'Date Error';
    }
}

// Initialize empty array for fallback
    // Create empty line array using traditional loop
    const emptyLine = [];
    for (let i = 0; i < close.length; i++) {
        emptyLine[i] = NaN;
    }

try {
    // Note: Random delay is built into the cache buster and execution ID for collision avoidance
    // Get current symbol and construct URL for ticker-specific data with cache busting
    const currentSymbol = constants.ticker.toUpperCase();
    const cacheBuster = Math.floor(Date.now() / 1000) + '_' + executionId + '_' + randomDelay + '_' + currentSymbol; // Unix timestamp + execution ID + delay + symbol for cache busting
    const tickerDataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/ticker_data/' + currentSymbol + '.json?v=' + cacheBuster;
    
    console.log('[' + executionId + '] Loading data for ' + currentSymbol + ' from: ' + tickerDataUrl);
    console.log('[' + executionId + '] Cache buster timestamp: ' + cacheBuster);
    
    // Load the ticker-specific data
    const tickerResponse = await request.http(tickerDataUrl);
    
    if (tickerResponse.error) {
        console.error('HTTP Error loading ticker data:', tickerResponse.error);
        paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
    } else {
        const tickerData = tickerResponse;
        let paintedCount = 0;
        
        console.log('[' + executionId + '] Loaded data for ' + currentSymbol + ':', tickerData.metadata);
        
        // Log data freshness information
        if (tickerData.metadata && tickerData.metadata.generated_at) {
            try {
                // Handle the Z suffix properly for UTC timezone
                const generatedAtStr = tickerData.metadata.generated_at.replace('Z', '');
                const dataTimestamp = Math.floor(Date.parse(generatedAtStr) / 1000);
                const currentTime = Math.floor(Date.now() / 1000);
                const dataAge = currentTime - dataTimestamp;
                console.log('Data age: ' + Math.floor(dataAge / 60) + ' minutes (' + dataAge + ' seconds)');
                console.log('Data generated at: ' + tickerData.metadata.generated_at);
                console.log('Parsed timestamp: ' + dataTimestamp + ', Current: ' + currentTime);
            } catch (e) {
                console.log('Error parsing data timestamp: ' + e);
                console.log('Data generated at: ' + tickerData.metadata.generated_at);
            }
        }
        
        // Function to consolidate nearby levels
        function consolidateLevels(levels, consolidationThreshold) {
            if (!levels || levels.length === 0) return [];
            
            // Sort levels by price
            const sortedLevels = [...levels].sort((a, b) => a.price - b.price);
            const consolidated = [];
            
            let currentGroup = [sortedLevels[0]];
            
            for (let i = 1; i < sortedLevels.length; i++) {
                const level = sortedLevels[i];
                const groupAvgPrice = currentGroup.reduce((sum, l) => sum + l.price, 0) / currentGroup.length;
                
                // Check if this level is close enough to the current group
                const priceDistance = Math.abs(level.price - groupAvgPrice);
                const distancePercent = priceDistance / groupAvgPrice * 100;
                
                // For higher-priced stocks, also allow consolidation within 21 cents
                const absoluteThreshold = 0.21; // 21 cents
                const withinAbsoluteThreshold = priceDistance <= absoluteThreshold;
                const withinPercentThreshold = distancePercent <= consolidationThreshold;
                
                if (withinPercentThreshold || withinAbsoluteThreshold) {
                    // Add to current group
                    currentGroup.push(level);
                } else {
                    // Consolidate current group and start new one
                    consolidated.push(consolidateGroup(currentGroup));
                    currentGroup = [level];
                }
            }
            
            // Don't forget the last group
            if (currentGroup.length > 0) {
                consolidated.push(consolidateGroup(currentGroup));
            }
            
            return consolidated;
        }
        
        // Function to consolidate a group of levels into a single level
        function consolidateGroup(group) {
            if (group.length === 1) return group[0];
            
            // Calculate weighted average price based on volume or use simple average
            let totalVolume = 0;
            let weightedPriceSum = 0;
            let totalDollars = 0;
            let bestRank = 999999; // Start with high number, find lowest
            
            group.forEach(level => {
                const levelVolume = level.volume || 0;
                const levelDollars = level.dollars || 0;
                const levelRank = parseInt(level.rank) || 999999;
                
                totalVolume += levelVolume;
                totalDollars += levelDollars;
                
                if (levelVolume > 0) {
                    weightedPriceSum += level.price * levelVolume;
                } else {
                    // If no volume data, treat equally
                    weightedPriceSum += level.price;
                }
                
                if (levelRank < bestRank) {
                    bestRank = levelRank;
                }
            });
            
            // Calculate consolidated price
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
        
        // Process support/resistance levels with consolidation
        const rawLevels = tickerData.levels || [];
        
        // Consolidation threshold as percentage (e.g., 0.1% means levels within 0.1% of each other will be combined)
        const consolidationThreshold = 0.1; // You can adjust this value
        
        const levels = consolidateLevels(rawLevels, consolidationThreshold);
        
        console.log('Level consolidation: ' + rawLevels.length + ' original levels -> ' + levels.length + ' consolidated levels');
        if (levels.length > 0) {
            console.log('Found ' + levels.length + ' levels for ' + currentSymbol);
            
            levels.forEach(function(level, index) {
                // Use light blue color for all support/resistance levels
                let color = '#87CEEB'; // Light blue for all levels
                
                // Create horizontal line at the price level - match exact chart length
                // Create level line array using traditional loop
                const levelLine = [];
                for (let i = 0; i < close.length; i++) {
                    levelLine[i] = level.price;
                }
                
                // Create title with price and rank information
                let title = '$' + level.price.toFixed(2);
                if (level.consolidatedCount && level.consolidatedCount > 1) {
                    title += ' (Combined ' + level.consolidatedCount + ' levels)';
                } else if (level.rank && parseInt(level.rank) > 0) {
                    title += ' (Rank ' + level.rank + ')';
                }
                
                // Paint the level with appropriate styling
                const paintedLine = paint(levelLine, {
                    title: title,
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'dashed',
                    transparency: 1.0 - levelsOpacity // Convert opacity to transparency (1.0 - opacity)
                });
                
                // Add text label with volume and dollar information
                if (showLabels && (level.volume || level.dollars)) {
                    let labelText = '';
                    
                    if (level.volume && level.dollars) {
                        // Both volume and dollars available - show price, shares, dollars, and rank/consolidation info
                        let priceText = '$' + level.price.toFixed(2);
                        if (level.consolidatedCount && level.consolidatedCount > 1 && level.originalPrices) {
                            const originalPricesText = level.originalPrices.map(p => '$' + p.toFixed(2)).join(', ');
                            priceText = '$' + level.price.toFixed(2) + ' (' + originalPricesText + ')';
                        }
                        const sharesText = formatNumber(level.volume) + ' shares';
                        const dollarsText = '$' + formatNumber(level.dollars);
                        
                        let suffixText = '';
                        if (level.consolidatedCount && level.consolidatedCount > 1) {
                            suffixText = 'Combined ' + level.consolidatedCount + ' levels';
                            if (level.allRanks && level.allRanks.length > 0) {
                                suffixText += ' | Ranks ' + level.allRanks.join(', ');
                            }
                        } else if (level.rank && parseInt(level.rank) > 0) {
                            suffixText = 'Rank ' + level.rank;
                        }
                        
                        labelText = priceText + ' | ' + sharesText + ' | ' + dollarsText + (suffixText ? ' | ' + suffixText : '');
                    } else if (level.dollars) {
                        // Only dollars available - show price and dollars
                        let priceText = '$' + level.price.toFixed(2);
                        if (level.consolidatedCount && level.consolidatedCount > 1 && level.originalPrices) {
                            const originalPricesText = level.originalPrices.map(p => '$' + p.toFixed(2)).join(', ');
                            priceText = '$' + level.price.toFixed(2) + ' (' + originalPricesText + ')';
                        }
                        const dollarsText = '$' + formatNumber(level.dollars);
                        
                        let suffixText = '';
                        if (level.consolidatedCount && level.consolidatedCount > 1) {
                            suffixText = 'Combined ' + level.consolidatedCount + ' levels';
                            if (level.allRanks && level.allRanks.length > 0) {
                                suffixText += ' | Ranks ' + level.allRanks.join(', ');
                            }
                        } else if (level.rank && parseInt(level.rank) > 0) {
                            suffixText = 'Rank ' + level.rank;
                        }
                        
                        labelText = priceText + ' | ' + dollarsText + (suffixText ? ' | ' + suffixText : '');
                    } else if (level.volume) {
                        // Only volume available - show price and volume
                        let priceText = '$' + level.price.toFixed(2);
                        if (level.consolidatedCount && level.consolidatedCount > 1 && level.originalPrices) {
                            const originalPricesText = level.originalPrices.map(p => '$' + p.toFixed(2)).join(', ');
                            priceText = '$' + level.price.toFixed(2) + ' (' + originalPricesText + ')';
                        }
                        const sharesText = formatNumber(level.volume) + ' shares';
                        
                        let suffixText = '';
                        if (level.consolidatedCount && level.consolidatedCount > 1) {
                            suffixText = 'Combined ' + level.consolidatedCount + ' levels';
                            if (level.allRanks && level.allRanks.length > 0) {
                                suffixText += ' | Ranks ' + level.allRanks.join(', ');
                            }
                        } else if (level.rank && parseInt(level.rank) > 0) {
                            suffixText = 'Rank ' + level.rank;
                        }
                        
                        labelText = priceText + ' | ' + sharesText + (suffixText ? ' | ' + suffixText : '');
                    }
                    
                    if (labelText) {
                        // Use the exact same color as the line
                        paint_label_at_line(paintedLine, close.length - 1, labelText, {
                            color: color,
                            vertical_align: 'top'
                        });
                    }
                }
                
                paintedCount++;
            });
        }
        
        // Process price boxes if available
        const boxes = tickerData.boxes || [];
        if (boxes.length > 0 && showPriceBoxes) {
            console.log('Found ' + boxes.length + ' price boxes for ' + currentSymbol);
            
            // Simplified box positioning to ensure all boxes are visible
            const chartLength = close.length;
            const boxWidth = 15; // Fixed width for reliability
            const rightMargin = 10; // Small margin from right edge
            
            console.log('Box positioning: chartLength=' + chartLength + ', boxWidth=' + boxWidth + ', totalBoxes=' + boxes.length);
            
            boxes.forEach(function(box, index) {
                try {
                    // Position boxes to extend all the way to the right, but stagger the start positions
                    const boxEndIndex = chartLength - 1; // Always extend to the very right
                    const boxStartIndex = chartLength - rightMargin - boxWidth - (index * 5); // Increased stagger spacing to 5 bars
                    
                    console.log('Box ' + box.box_number + ' positioning: start=' + boxStartIndex + ', end=' + boxEndIndex);
                    
                    // Ensure we have valid indices
                    if (boxStartIndex >= 0 && boxEndIndex >= 0 && boxStartIndex < boxEndIndex) {
                        // Get box dimensions from high_price and low_price
                        const topPrice = box.high_price;
                        const bottomPrice = box.low_price;
                        const priceRange = topPrice - bottomPrice;
                        const midPrice = (topPrice + bottomPrice) / 2;
                        
                        // Calculate threshold for when to use lines instead of filled box
                        // Use 5% of the mid-price as threshold, or minimum $0.50
                        const priceThreshold = Math.max(0.50, midPrice * 0.05);
                        const useLines = priceRange > priceThreshold;
                        
                        console.log('Box ' + box.box_number + ' price analysis: range=$' + priceRange.toFixed(2) + 
                                   ', threshold=$' + priceThreshold.toFixed(2) + ', useLines=' + useLines +
                                   ', topPrice=$' + topPrice + ', bottomPrice=$' + bottomPrice);
                        console.log('📦 Box ' + box.box_number + ' will be rendered as: ' + (useLines ? 'SEPARATE LINES' : 'FILLED BOX'));
                        
                        // Use consistent purple styling for all box elements
                        const boxLineColor = '#9966CC'; // Consistent purple for all box lines
                        const fillColor = '#9966CC'; // Same purple for fills
                        
                        console.log('Box ' + box.box_number + ' using colors: line=' + boxLineColor + ', fill=' + fillColor);
                        
                        if (useLines) {
                            // Create two separate box-like lines when price range is too large
                            // Create arrays for top and bottom lines that span only the box duration
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
                                title: 'Line ' + box.box_number + ' High: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            const bottomLine = paint(bottomLineArray, {
                                title: 'Line ' + box.box_number + ' Low: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            // Add labels for both lines
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' shares';
                                const valueText = '$' + formatNumber(box.dollars || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                
                                // Calculate middle position of box
                                const boxMiddleIndex = Math.floor((boxStartIndex + boxEndIndex) / 2);
                                
                                // Label for high line
                                const highLabelText = '[LINE ' + box.box_number + ' HIGH $' + topPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                paint_label_at_line(topLine, boxMiddleIndex, highLabelText, {
                                    color: boxLineColor,
                                    vertical_align: 'top'
                                });
                                
                                // Label for low line  
                                const lowLabelText = '[LINE ' + box.box_number + ' LOW $' + bottomPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                paint_label_at_line(bottomLine, boxMiddleIndex, lowLabelText, {
                                    color: boxLineColor,
                                    vertical_align: 'middle'
                                });
                            }
                            
                            console.log('Drew separate lines for box ' + box.box_number + ' (range too large): high=$' + topPrice.toFixed(2) + ', low=$' + bottomPrice.toFixed(2));
                        } else {
                            // Create filled box when price range is reasonable
                            // Create arrays for top and bottom lines that span only the box duration
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
                                title: 'Box ' + box.box_number + ' Top: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            const bottomLine = paint(bottomLineArray, {
                                title: 'Box ' + box.box_number + ' Bottom: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            // Fill the area between top and bottom lines with configurable opacity
                            fill(topLine, bottomLine, fillColor, boxesOpacity, 'Box ' + box.box_number);
                            
                            // Add single label for filled box
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' shares';
                                const valueText = '$' + formatNumber(box.dollars || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                const labelText = '[BOX ' + box.box_number + ' $' + bottomPrice.toFixed(2) + '-$' + topPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                
                                // Calculate middle position of box
                                const boxMiddleIndex = Math.floor((boxStartIndex + boxEndIndex) / 2);
                                
                                paint_label_at_line(topLine, boxMiddleIndex, labelText, {
                                    color: boxLineColor,
                                    vertical_align: 'top'
                                });
                            }
                            
                            console.log('Drew filled box ' + box.box_number + ' (range acceptable): high=$' + topPrice.toFixed(2) + ', low=$' + bottomPrice.toFixed(2));
                        }
                        
                        paintedCount += 1; // Count the painted element
                        console.log('Successfully painted box ' + box.box_number + ' from bar ' + boxStartIndex + ' to ' + boxEndIndex + 
                                   ' with prices: top=' + topPrice + ', bottom=' + bottomPrice);
                    } else {
                        console.log('Skipping box ' + box.box_number + ' - invalid indices: start=' + boxStartIndex + ', end=' + boxEndIndex + 
                                   ' (chartLength=' + chartLength + ')');
                    }
                } catch (boxError) {
                    console.error('Error processing box ' + box.box_number + ':', boxError);
                }
            });
        }
        
        // Process individual prints as text labels on candles if enabled
        const prints = tickerData.prints || [];
        
        console.log('[' + executionId + '] Processing prints for display as candle labels');
        console.log('[' + executionId + '] Current time (for debugging): ' + Math.floor(Date.now() / 1000));
        console.log('[' + executionId + '] Chart time range: ' + (time.length > 0 ? time[0] + ' to ' + time[time.length - 1] : 'empty'));
        
        if (prints.length > 0 && showPrints) {
            console.log('[' + executionId + '] Found ' + prints.length + ' prints for ' + currentSymbol);
            
            // Log all print ranks for debugging
            const printRanks = prints.map(p => 'R' + (p.rank || '?')).join(', ');
            console.log('[' + executionId + '] Print ranks: ' + printRanks);
            
            // Log details for all prints to help debug any missing ones
            prints.forEach(function(print, index) {
                console.log('[' + executionId + '] 🎯 PRINT ' + index + ': Rank ' + (print.rank || '?') + ' at $' + print.price.toFixed(2) + ' (timestamp: ' + print.timestamp + ')');
            });
            
            // Group prints by bar index (day) to handle stacking
            const printsByBar = {};
            
            // Get current time for recent print detection
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const lastChartTime = time.length > 0 ? time[time.length - 1] : 0;
            
            // First pass: determine bar index for each print with improved logic
            prints.forEach(function(print, index) {
                try {
                    console.log('Processing print #' + index + ': Rank ' + (print.rank || '?') + ' at $' + print.price.toFixed(2) + ' timestamp: ' + print.timestamp);
                
                // Convert timestamp to bar index using improved matching
                let barIndex = -1;
                if (print.timestamp && print.timestamp > 0) {
                    console.log('Looking for timestamp ' + print.timestamp + ' in chart with ' + time.length + ' bars');
                    console.log('Chart time range: ' + time[0] + ' to ' + time[time.length - 1]);
                    
                    // Check if this print is after the chart's end time (truly recent)
                    const isAfterChartEnd = print.timestamp > lastChartTime;
                    
                    // Only use recent print logic for prints that are actually after chart end
                    // Remove the "very recent" logic that was incorrectly grouping prints
                    if (isAfterChartEnd) {
                        // For prints after chart end, place on the most recent bar
                        barIndex = time.length - 1;
                        console.log('🔥 RECENT PRINT detected - placing on most recent bar ' + barIndex + ' (timestamp: ' + print.timestamp + ', current: ' + currentTimestamp + ', chart end: ' + lastChartTime + ', isAfterChartEnd: ' + isAfterChartEnd + ')');
                    } else {
                        // For prints within chart timeframe, find the best matching bar
                        let bestMatch = -1;
                        let bestDistance = Infinity;
                        
                        // First pass: Look for exact or very close matches (within 1 hour)
                        for (let i = 0; i < time.length; i++) {
                            const barTime = time[i];
                            const distance = Math.abs(barTime - print.timestamp);
                            
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestMatch = i;
                            }
                        }
                        
                        barIndex = bestMatch;
                        const distanceHours = Math.floor(bestDistance / 3600);
                        const distanceDays = Math.floor(bestDistance / 86400);
                        
                        if (bestDistance <= 3600) {
                            console.log('Found excellent match at bar ' + barIndex + ' (distance: ' + bestDistance + ' seconds, ' + distanceHours + ' hours)');
                        } else if (bestDistance <= 86400) {
                            console.log('Found good match at bar ' + barIndex + ' (distance: ' + bestDistance + ' seconds, ' + distanceHours + ' hours)');
                        } else {
                            console.log('Found closest available bar ' + barIndex + ' (distance: ' + bestDistance + ' seconds, ' + distanceDays + ' days)');
                        }
                    }
                } else {
                    // If no timestamp, place on the most recent candle
                    barIndex = time.length - 1;
                    console.log('No timestamp, using most recent bar: ' + barIndex);
                }
                
                // Ensure barIndex is valid
                if (barIndex >= 0 && barIndex < time.length) {
                    if (!printsByBar[barIndex]) {
                        printsByBar[barIndex] = [];
                    }
                    printsByBar[barIndex].push(print);
                    console.log('✅ Added print R' + (print.rank || '?') + ' to bar ' + barIndex + ' (chart bar time: ' + (time[barIndex] || 'unknown') + ')');
                } else {
                    console.log('❌ Invalid barIndex ' + barIndex + ' for print R' + (print.rank || '?') + ' - applying fallback strategy');
                    
                    // Multiple fallback strategies to ensure the print is placed somewhere
                    let fallbackBarIndex = -1;
                    
                    // Strategy 1: Try last 10 bars
                    if (time.length >= 10) {
                        fallbackBarIndex = time.length - Math.floor(Math.random() * 10) - 1;
                        console.log('🔧 FALLBACK 1: Using recent bar ' + fallbackBarIndex);
                    } else if (time.length > 0) {
                        // Strategy 2: Use last available bar
                        fallbackBarIndex = time.length - 1;
                        console.log('🔧 FALLBACK 2: Using last bar ' + fallbackBarIndex);
                    } else {
                        // Strategy 3: Use bar 0 if chart is empty (shouldn't happen)
                        fallbackBarIndex = 0;
                        console.log('🔧 FALLBACK 3: Using bar 0 (emergency fallback)');
                    }
                    
                    if (!printsByBar[fallbackBarIndex]) {
                        printsByBar[fallbackBarIndex] = [];
                    }
                                         printsByBar[fallbackBarIndex].push(print);
                     console.log('🔧 FALLBACK SUCCESS: Placed print R' + (print.rank || '?') + ' on bar ' + fallbackBarIndex);
                 }
                } catch (printError) {
                    console.error('❌ Error processing print #' + index + ' (Rank ' + (print.rank || '?') + '):', printError);
                    // Still try to place it somewhere as a last resort
                    const emergencyBarIndex = time.length > 0 ? time.length - 1 : 0;
                    if (!printsByBar[emergencyBarIndex]) {
                        printsByBar[emergencyBarIndex] = [];
                    }
                    printsByBar[emergencyBarIndex].push(print);
                    console.log('🚨 EMERGENCY: Placed print R' + (print.rank || '?') + ' on bar ' + emergencyBarIndex + ' due to error');
                }
             });
            
            // Second pass: process prints grouped by bar with stacking
            Object.keys(printsByBar).forEach(function(barIndexStr) {
                try {
                    const barIndex = parseInt(barIndexStr);
                    const barPrints = printsByBar[barIndex];
                
                // Sort prints by rank (best rank first) for consistent stacking order
                barPrints.sort(function(a, b) {
                    const rankA = parseInt(a.rank) || 999;
                    const rankB = parseInt(b.rank) || 999;
                    return rankA - rankB;
                });
                
                console.log('Processing ' + barPrints.length + ' prints for bar ' + barIndex);
                
                barPrints.forEach(function(print, stackIndex) {
                    // No red lines - only labels
                    
                    // Create simple rank-only label
                    const rankText = print.rank ? print.rank : '?';
                    let labelText = 'R' + rankText;
                    
                    // If multiple prints on same day, combine them into one label
                    if (barPrints.length > 1) {
                        if (stackIndex === 0) {
                            // For the first print, show all ranks combined with | separator
                            const allRanks = barPrints.map(p => 'R' + (p.rank || '?')).join(' | ');
                            labelText = allRanks;
                        } else {
                            // Skip individual labels for subsequent prints to avoid overlap
                            labelText = '';
                        }
                    }
                    
                    // Add label directly over the candle (only if labelText is not empty)
                    if (labelText) {
                        try {
                            console.log('🏷️ Creating label "' + labelText + '" at bar ' + barIndex + ' (high: ' + (high[barIndex] || 'undefined') + ')');
                            
                            // Ensure we have valid data for the bar
                            if (barIndex >= 0 && barIndex < high.length && high[barIndex] !== undefined && !isNaN(high[barIndex])) {
                                try {
                                    // Create a completely invisible anchor point using the existing candle high
                                    // We'll use the high price array directly as our anchor
                                    const labelPrice = high[barIndex] * 1.01; // Position above candle high
                                    
                                    // Create an invisible single-point marker
                                    const invisibleMarker = [];
                                    for (let i = 0; i < close.length; i++) {
                                        if (i === barIndex) {
                                            invisibleMarker[i] = labelPrice;
                                        } else {
                                            invisibleMarker[i] = NaN;
                                        }
                                    }
                                    
                                    // Paint with full transparency (completely invisible)
                                    const invisibleLine = paint(invisibleMarker, {
                                        title: 'Invisible_' + executionId + '_' + labelText.replace(/[^a-zA-Z0-9]/g, '') + '_Bar' + barIndex,
                                        color: '#FFFFFF', // White color (will be invisible anyway)
                                        linewidth: 1,
                                        linestyle: 'solid',
                                        transparency: 1.0 // Completely transparent/invisible
                                    });
                                    
                                    // Add the label to this invisible anchor
                                    if (invisibleLine) {
                                        paint_label_at_line(invisibleLine, barIndex, labelText, {
                                            color: '#FFFF00', // Bright yellow for visibility
                                            vertical_align: 'bottom' // Position above the invisible anchor
                                        });
                                        
                                        console.log('✅ Label "' + labelText + '" placed at bar ' + barIndex + ' with invisible anchor');
                                    } else {
                                        console.log('❌ Failed to create invisible anchor for label "' + labelText + '" at bar ' + barIndex);
                                    }
                                } catch (paintError) {
                                    console.error('❌ Paint error for label "' + labelText + '" at bar ' + barIndex + ':', paintError);
                                    console.error('❌ Paint error details: barIndex=' + barIndex + ', high[barIndex]=' + (high[barIndex] || 'undefined') + ', close.length=' + close.length);
                                    // Try a simpler fallback approach
                                    try {
                                        console.log('🔧 Attempting fallback invisible label placement for "' + labelText + '"');
                                        // Create a completely invisible fallback anchor
                                        const fallbackLine = [];
                                        for (let i = 0; i < close.length; i++) {
                                            fallbackLine[i] = (i === barIndex) ? high[barIndex] * 1.01 : NaN;
                                        }
                                        const fallbackPaintedLine = paint(fallbackLine, {
                                            title: 'FallbackInvisible_' + executionId + '_R' + (print.rank || '?'),
                                            color: '#FFFFFF', // White (invisible)
                                            linewidth: 1,
                                            transparency: 1.0 // Completely invisible
                                        });
                                        if (fallbackPaintedLine) {
                                            paint_label_at_line(fallbackPaintedLine, barIndex, labelText, {
                                                color: '#FFFF00',
                                                vertical_align: 'bottom'
                                            });
                                            console.log('🔧 Fallback invisible label placement successful for "' + labelText + '"');
                                        }
                                    } catch (fallbackError) {
                                        console.error('❌ Fallback invisible label placement also failed for "' + labelText + '":', fallbackError);
                                    }
                                }
                            } else {
                                console.log('❌ Invalid bar data for label "' + labelText + '" at bar ' + barIndex + ' - skipping label');
                            }
                        } catch (labelError) {
                            console.error('❌ Error creating label "' + labelText + '" at bar ' + barIndex + ':', labelError);
                        }
                    }
                    
                    console.log('✅ Placed print R' + (print.rank || '?') + ' at bar ' + barIndex + ': $' + print.price.toFixed(2) + 
                               (barPrints.length > 1 ? ' (stacked with ' + (barPrints.length - 1) + ' others)' : ''));
                    
                    paintedCount++;
                });
                } catch (barError) {
                    console.error('❌ Error processing prints for bar ' + barIndexStr + ':', barError);
                }
            });
            
            // Summary of print processing
            const totalPrintsProcessed = Object.keys(printsByBar).reduce((sum, barIndex) => sum + printsByBar[barIndex].length, 0);
            console.log('[' + executionId + '] 📊 PRINT PROCESSING SUMMARY:');
            console.log('[' + executionId + '] - Total prints in data: ' + prints.length);
            console.log('[' + executionId + '] - Total prints processed: ' + totalPrintsProcessed);
            console.log('[' + executionId + '] - Bars with prints: ' + Object.keys(printsByBar).length);
            console.log('[' + executionId + '] - Print distribution: ' + Object.keys(printsByBar).map(barIndex => 'Bar ' + barIndex + ': ' + printsByBar[barIndex].length + ' prints').join(', '));
        }
        
        // Display summary information
        if (paintedCount > 0) {
            console.log('[' + executionId + '] Total painted elements: ' + paintedCount);
        } else {
            console.log('[' + executionId + '] No data found for ' + currentSymbol);
            paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
        }
        
        const executionDuration = Date.now() - currentTime;
        console.log('🏁 Completed execution ID: ' + executionId + ' (duration: ' + executionDuration + 'ms)');
        
        // Warn if execution was very fast (might indicate multiple rapid executions)
        if (executionDuration < 100) {
            console.log('⚠️ Very fast execution detected - this might indicate multiple simultaneous runs');
        }
        
        // Log completion with unique identifier for tracking
        console.log('📋 Execution ' + executionId + ' completed successfully with ' + paintedCount + ' elements painted');
    }
    
} catch (error) {
    console.error('Error loading data:', error);
    paint(emptyLine, { title: 'Script Error', color: '#FF0000' });
} 