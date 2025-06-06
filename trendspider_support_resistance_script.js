describe_indicator('Moebot VL Trendspider v4 new', 'overlay');

// Configuration - these can be modified directly in the code
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = true; // Show price boxes
const showPrints = true; // Show individual prints - enabled to display print bubbles
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 2;
const showLabels = true; // Show text labels with volume and dollar info

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
    // Get current symbol and construct URL for ticker-specific data
    const currentSymbol = constants.ticker.toUpperCase();
    const tickerDataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/ticker_data/' + currentSymbol + '.json';
    
    console.log('Loading data for ' + currentSymbol + ' from: ' + tickerDataUrl);
    
    // Load the ticker-specific data
    const tickerResponse = await request.http(tickerDataUrl);
    
    if (tickerResponse.error) {
        console.error('HTTP Error loading ticker data:', tickerResponse.error);
        paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
    } else {
        const tickerData = tickerResponse;
        let paintedCount = 0;
        
        console.log('Loaded data for ' + currentSymbol + ':', tickerData.metadata);
        
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
                    transparency: 0 // Ensure no transparency that might cause auto-fill
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
                        
                        // Use consistent purple styling for all box elements
                        const boxLineColor = '#9966CC'; // Consistent purple for all box lines
                        const fillColor = '#9966CC'; // Same purple for fills
                        
                        if (useLines) {
                            // Create two separate horizontal lines when price range is too large
                            const topLine = paint(horizontal_line(topPrice, boxStartIndex, boxEndIndex), {
                                title: 'Line ' + box.box_number + ' High: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 0
                            });
                            
                            const bottomLine = paint(horizontal_line(bottomPrice, boxStartIndex, boxEndIndex), {
                                title: 'Line ' + box.box_number + ' Low: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 0
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
                            const topLine = paint(horizontal_line(topPrice, boxStartIndex, boxEndIndex), {
                                title: 'Box ' + box.box_number + ' Top: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 0
                            });
                            
                            const bottomLine = paint(horizontal_line(bottomPrice, boxStartIndex, boxEndIndex), {
                                title: 'Box ' + box.box_number + ' Bottom: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 0
                            });
                            
                            // Fill the area between top and bottom lines with lower opacity
                            fill(topLine, bottomLine, fillColor, 0.1, 'Box ' + box.box_number); // Reduced from 0.2 to 0.1
                            
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
        
        console.log('Processing prints for display as candle labels');
        
        if (prints.length > 0 && showPrints) {
            console.log('Found ' + prints.length + ' prints for ' + currentSymbol);
            
            // Group prints by bar index (day) to handle stacking
            const printsByBar = {};
            
            // First pass: determine bar index for each print
            prints.forEach(function(print, index) {
                console.log('Processing print #' + index + ': Rank ' + (print.rank || '?') + ' at $' + print.price.toFixed(2) + ' timestamp: ' + print.timestamp);
                
                // Convert timestamp to bar index using session-based matching
                let barIndex = -1;
                if (print.timestamp && print.timestamp > 0) {
                    console.log('Looking for timestamp ' + print.timestamp + ' in chart with ' + time.length + ' bars');
                    
                    // Find the daily candle that contains this timestamp
                    for (let i = 0; i < time.length; i++) {
                        if (i < time.length - 1) {
                            // Check if timestamp falls between current bar and next bar
                            if (print.timestamp >= time[i] && print.timestamp < time[i + 1]) {
                                barIndex = i;
                                console.log('Found exact match at bar ' + i + ' (between ' + time[i] + ' and ' + time[i + 1] + ')');
                                break;
                            }
                        } else {
                            // For the last bar, check if timestamp is after it
                            if (print.timestamp >= time[i]) {
                                barIndex = i;
                                console.log('Found match at last bar ' + i + ' (timestamp >= ' + time[i] + ')');
                                break;
                            }
                        }
                    }
                    
                    // If no exact match found, find closest bar
                    if (barIndex === -1) {
                        let closestDistance = Infinity;
                        let closestBar = -1;
                        for (let i = 0; i < time.length; i++) {
                            const distance = Math.abs(time[i] - print.timestamp);
                            if (distance < closestDistance) {
                                closestDistance = distance;
                                closestBar = i;
                            }
                        }
                        barIndex = closestBar;
                        console.log('No exact match, using closest bar ' + barIndex + ' (distance: ' + closestDistance + ' seconds)');
                    }
                    
                    // Special handling for very recent timestamps - force to most recent bar if within last 24 hours
                    if (print.timestamp > time[time.length - 1] - 86400) { // Within last 24 hours
                        const originalBarIndex = barIndex;
                        barIndex = time.length - 1; // Force to most recent bar
                        console.log('Recent timestamp detected, moved from bar ' + originalBarIndex + ' to most recent bar ' + barIndex);
                    }
                } else {
                    // If no timestamp, place on the most recent candle
                    barIndex = close.length - 1;
                    console.log('No timestamp, using most recent bar: ' + barIndex);
                }
                
                if (barIndex >= 0 && barIndex < close.length) {
                    if (!printsByBar[barIndex]) {
                        printsByBar[barIndex] = [];
                    }
                    printsByBar[barIndex].push(print);
                    console.log('Added print R' + (print.rank || '?') + ' to bar ' + barIndex);
                } else {
                    console.log('❌ Invalid barIndex ' + barIndex + ' for print R' + (print.rank || '?'));
                }
            });
            
            // Second pass: process prints grouped by bar with stacking
            Object.keys(printsByBar).forEach(function(barIndexStr) {
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
                    // Create a horizontal line at the print price for this specific bar
                    const printLine = [];
                    for (let i = 0; i < close.length; i++) {
                        if (i === barIndex) {
                            printLine[i] = print.price;
                        } else {
                            printLine[i] = NaN;
                        }
                    }
                    
                    // Paint the print line
                    const printPaintedLine = paint(printLine, {
                        title: 'Print R' + (print.rank || '?') + ' - $' + print.price.toFixed(2),
                        color: '#FF0000',
                        linewidth: 2,
                        linestyle: 'solid',
                        transparency: 0
                    });
                    
                    // Create simple rank-only label
                    const rankText = print.rank ? print.rank : '?';
                    let labelText = 'R' + rankText;
                    
                    // If multiple prints on same day, combine them into one label
                    if (barPrints.length > 1) {
                        if (stackIndex === 0) {
                            // For the first print, show all ranks combined
                            const allRanks = barPrints.map(p => 'R' + (p.rank || '?')).join(' ');
                            labelText = allRanks;
                        } else {
                            // Skip individual labels for subsequent prints to avoid overlap
                            labelText = '';
                        }
                    }
                    
                    // Add label directly over the candle (only if labelText is not empty)
                    if (labelText) {
                        // Position label at the high of the candle for better visibility
                        const labelLine = [];
                        for (let i = 0; i < close.length; i++) {
                            if (i === barIndex) {
                                labelLine[i] = high[i]; // Position at candle high
                            } else {
                                labelLine[i] = NaN;
                            }
                        }
                        
                        const labelPaintedLine = paint(labelLine, {
                            title: 'Label for ' + labelText,
                            color: 'transparent', // Make the line invisible
                            linewidth: 0,
                            transparency: 1
                        });
                        
                        paint_label_at_line(labelPaintedLine, barIndex, labelText, {
                            color: '#00FF00', // Bright green
                            vertical_align: 'bottom' // Position above the high
                        });
                    }
                    
                    console.log('✅ Placed print R' + (print.rank || '?') + ' at bar ' + barIndex + ': $' + print.price.toFixed(2) + 
                               (barPrints.length > 1 ? ' (stacked with ' + (barPrints.length - 1) + ' others)' : ''));
                    
                    paintedCount++;
                });
            });
        }
        
        // Display summary information
        if (paintedCount > 0) {
            console.log('Total painted elements: ' + paintedCount);
        } else {
            console.log('No data found for ' + currentSymbol);
            paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
        }
    }
    
} catch (error) {
    console.error('Error loading data:', error);
    paint(emptyLine, { title: 'Script Error', color: '#FF0000' });
} 