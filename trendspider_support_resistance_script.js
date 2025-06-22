describe_indicator('Moebot VL Trendspider v5.3 (Compact)', 'overlay');

// Execution tracking
const executionId = Math.random().toString(36).substr(2, 9);
const currentTime = Date.now();
const randomDelay = Math.floor(Math.random() * 300) + 100;
const symbolHash = (typeof constants !== 'undefined' && constants.ticker) ? 
    constants.ticker.toUpperCase().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0) : 0;

console.log('🚀 Starting execution ID: ' + executionId + ' for ' + (typeof constants !== 'undefined' && constants.ticker ? constants.ticker.toUpperCase() : 'UNKNOWN'));

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

// Initialize empty array for fallback
const emptyLine = [];
for (let i = 0; i < close.length; i++) {
    emptyLine[i] = NaN;
}

try {
    const currentSymbol = constants.ticker.toUpperCase();
    const cacheBuster = Math.floor(Date.now() / 1000) + '_' + executionId + '_' + randomDelay + '_' + currentSymbol;
    const tickerDataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/ticker_data/' + currentSymbol + '.json?v=' + cacheBuster;
    
    console.log('[' + executionId + '] Loading data for ' + currentSymbol);
    
    const tickerResponse = await request.http(tickerDataUrl);
    
    if (tickerResponse.error) {
        console.error('HTTP Error loading ticker data:', tickerResponse.error);
        paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
    } else {
        const tickerData = tickerResponse;
        let paintedCount = 0;
        
        console.log('[' + executionId + '] Loaded data for ' + currentSymbol);
        
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
        
        // Process support/resistance levels
        const rawLevels = tickerData.levels || [];
        const consolidationThreshold = 0.1;
        const levels = consolidateLevels(rawLevels, consolidationThreshold);
        
        if (levels.length > 0) {
            levels.forEach(function(level, index) {
                // Dynamic color assignment for support/resistance levels
                let color = '#C0C0C0';    // Light grey for support/resistance levels
                
                const levelLine = [];
                for (let i = 0; i < close.length; i++) {
                    levelLine[i] = level.price;
                }
                
                let title = '$' + level.price.toFixed(2);
                if (level.consolidatedCount && level.consolidatedCount > 1) {
                    title += ' (Combined ' + level.consolidatedCount + ' levels)';
                } else if (level.rank && parseInt(level.rank) > 0) {
                    title += ' (Rank ' + level.rank + ')';
                }
                
                const paintedLine = paint(levelLine, {
                    title: title,
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });
                
                // Create projection array for future bars
                const projectionArray = [];
                for (let i = 0; i < projectionLength; i++) {
                    projectionArray[i] = level.price;
                }
                
                // Paint projection into the future
                const projectedLine = paint_projection(projectionArray, {
                    title: title + ' (Projection)',
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });
                
                if (showLabels && (level.volume || level.dollars)) {
                    let labelText = '';
                    
                    if (level.volume && level.dollars) {
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
                        paint_label_at_line(projectedLine, projectionLength - 1, labelText, {
                            color: color,
                            vertical_align: 'top'
                        });
                    }
                }
                
                paintedCount++;
            });
        }
        
        // Process price boxes
        const boxes = tickerData.boxes || [];
        if (boxes.length > 0 && showPriceBoxes) {
            const chartLength = close.length;
            const boxWidth = 15;
            const rightMargin = 10;
            
            boxes.forEach(function(box, index) {
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
                                    title: 'Line ' + box.box_number + ': $' + topPrice.toFixed(2),
                                    color: boxLineColor,
                                    linewidth: 2, // Slightly thicker for single lines
                                    linestyle: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                // Create projection for single line
                                const singleProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    singleProjectionArray[i] = topPrice;
                                }
                                
                                const singleProjectedLine = paint_projection(singleProjectionArray, {
                                    title: 'Line ' + box.box_number + ': $' + topPrice.toFixed(2) + ' (Projection)',
                                    color: boxLineColor,
                                    linewidth: 2,
                                    linestyle: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                if (showLabels) {
                                    const volumeText = formatNumber(box.volume || 0) + ' shares';
                                    const valueText = '$' + formatNumber(box.dollars || 0);
                                    const tradesText = (box.trades || 0) + ' trades';
                                    
                                    const labelText = '[LINE ' + box.box_number + ' $' + topPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                    paint_label_at_line(singleProjectedLine, projectionLength - 1, labelText, {
                                        color: boxLineColor,
                                        vertical_align: 'top'
                                    });
                                }
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
                                
                                // Create projections for top and bottom lines
                                const topProjectionArray = [];
                                const bottomProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    topProjectionArray[i] = topPrice;
                                    bottomProjectionArray[i] = bottomPrice;
                                }
                                
                                const topProjectedLine = paint_projection(topProjectionArray, {
                                    title: 'Line ' + box.box_number + ' High: $' + topPrice.toFixed(2) + ' (Projection)',
                                    color: boxLineColor,
                                    linewidth: 1,
                                    linestyle: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                const bottomProjectedLine = paint_projection(bottomProjectionArray, {
                                    title: 'Line ' + box.box_number + ' Low: $' + bottomPrice.toFixed(2) + ' (Projection)',
                                    color: boxLineColor,
                                    linewidth: 1,
                                    linestyle: 'solid',
                                    transparency: 1.0 - boxLinesOpacity
                                });
                                
                                if (showLabels) {
                                    const volumeText = formatNumber(box.volume || 0) + ' shares';
                                    const valueText = '$' + formatNumber(box.dollars || 0);
                                    const tradesText = (box.trades || 0) + ' trades';
                                    
                                    const highLabelText = '[LINE ' + box.box_number + ' HIGH $' + topPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                    paint_label_at_line(topProjectedLine, projectionLength - 1, highLabelText, {
                                        color: boxLineColor,
                                        vertical_align: 'top'
                                    });
                                    
                                    const lowLabelText = '[LINE ' + box.box_number + ' LOW $' + bottomPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                    paint_label_at_line(bottomProjectedLine, projectionLength - 1, lowLabelText, {
                                        color: boxLineColor,
                                        vertical_align: 'middle'
                                    });
                                }
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
                            
                            // Create projections for box top and bottom lines
                            const boxTopProjectionArray = [];
                            const boxBottomProjectionArray = [];
                            for (let i = 0; i < projectionLength; i++) {
                                boxTopProjectionArray[i] = topPrice;
                                boxBottomProjectionArray[i] = bottomPrice;
                            }
                            
                            const boxTopProjectedLine = paint_projection(boxTopProjectionArray, {
                                title: 'Box ' + box.box_number + ' Top: $' + topPrice.toFixed(2) + ' (Projection)',
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            const boxBottomProjectedLine = paint_projection(boxBottomProjectionArray, {
                                title: 'Box ' + box.box_number + ' Bottom: $' + bottomPrice.toFixed(2) + ' (Projection)',
                                color: boxLineColor,
                                linewidth: 1,
                                linestyle: 'solid',
                                transparency: 1.0 - boxLinesOpacity
                            });
                            
                            fill(topLine, bottomLine, fillColor, boxesOpacity, 'Box ' + box.box_number);
                            
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' shares';
                                const valueText = '$' + formatNumber(box.dollars || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                const labelText = '[BOX ' + box.box_number + ' $' + bottomPrice.toFixed(2) + '-$' + topPrice.toFixed(2) + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                
                                paint_label_at_line(boxTopProjectedLine, projectionLength - 1, labelText, {
                                    color: boxLineColor,
                                    vertical_align: 'top'
                                });
                            }
                        }
                        
                        paintedCount += 1;
                    }
                } catch (boxError) {
                    console.error('Error processing box ' + box.box_number + ':', boxError);
                }
            });
        }
        
        // Process prints
        const prints = tickerData.prints || [];
        
        if (prints.length > 0 && showPrints) {
            const printsByBar = {};
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const lastChartTime = time.length > 0 ? time[time.length - 1] : 0;
            
            prints.forEach(function(print, index) {
                try {
                    let barIndex = -1;
                    if (print.timestamp && print.timestamp > 0) {
                        const isAfterChartEnd = print.timestamp > lastChartTime;
                        
                        if (isAfterChartEnd) {
                            barIndex = time.length - 1;
                        } else {
                            let bestMatch = -1;
                            let bestDistance = Infinity;
                            
                            for (let i = 0; i < time.length; i++) {
                                const barTime = time[i];
                                const distance = Math.abs(barTime - print.timestamp);
                                
                                if (distance < bestDistance) {
                                    bestDistance = distance;
                                    bestMatch = i;
                                }
                            }
                            
                            barIndex = bestMatch;
                        }
                    } else {
                        barIndex = time.length - 1;
                    }
                    
                    if (barIndex >= 0 && barIndex < time.length) {
                        if (!printsByBar[barIndex]) {
                            printsByBar[barIndex] = [];
                        }
                        printsByBar[barIndex].push(print);
                    } else {
                        let fallbackBarIndex = time.length >= 10 ? time.length - Math.floor(Math.random() * 10) - 1 : time.length - 1;
                        if (!printsByBar[fallbackBarIndex]) {
                            printsByBar[fallbackBarIndex] = [];
                        }
                        printsByBar[fallbackBarIndex].push(print);
                    }
                } catch (printError) {
                    console.error('Error processing print:', printError);
                    const emergencyBarIndex = time.length > 0 ? time.length - 1 : 0;
                    if (!printsByBar[emergencyBarIndex]) {
                        printsByBar[emergencyBarIndex] = [];
                    }
                    printsByBar[emergencyBarIndex].push(print);
                }
            });
            
            // Track painted print lines to avoid duplicates
            const paintedPrintPrices = {};
            
            Object.keys(printsByBar).forEach(function(barIndexStr) {
                try {
                    const barIndex = parseInt(barIndexStr);
                    const barPrints = printsByBar[barIndex];
                    
                    barPrints.sort(function(a, b) {
                        const rankA = parseInt(a.rank) || 999;
                        const rankB = parseInt(b.rank) || 999;
                        return rankA - rankB;
                    });
                    
                    barPrints.forEach(function(print, stackIndex) {
                        const rankText = print.rank ? print.rank : '?';
                        const rankNumber = parseInt(print.rank) || 999;
                        let labelText = 'R' + rankText;
                        
                        // Draw horizontal line for prints ranked 10 or better (only once per price level)
                        if (rankNumber <= 10 && print.price) {
                            const priceKey = print.price.toFixed(2);
                            if (!paintedPrintPrices[priceKey]) {
                                paintedPrintPrices[priceKey] = true;
                                
                                const printLineArray = [];
                                for (let i = 0; i < close.length; i++) {
                                    printLineArray[i] = print.price;
                                }
                                
                                const printLine = paint(printLineArray, {
                                    title: 'Print R' + rankText + ': $' + print.price.toFixed(2),
                                    color: '#FFFF00', // Dynamic color assignment for prints - Yellow
                                    linewidth: 2, // Thicker line to stand out
                                    linestyle: 'solid', // Solid line instead of dashed
                                    transparency: 0.1 // More opaque (90% opacity)
                                });
                                
                                // Create projection for print line
                                const printProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    printProjectionArray[i] = print.price;
                                }
                                
                                const printProjectedLine = paint_projection(printProjectionArray, {
                                    title: 'Print R' + rankText + ': $' + print.price.toFixed(2) + ' (Projection)',
                                    color: '#FFFF00',
                                    linewidth: 2,
                                    linestyle: 'solid',
                                    transparency: 0.1
                                });
                                
                                // Add label to the print line
                                if (showLabels && printProjectedLine) {
                                    const dollarAmount = print.dollars ? ' ($' + formatNumber(print.dollars) + ')' : '';
                                    const printLabelText = 'Print R' + rankText + ' | $' + print.price.toFixed(2) + dollarAmount;
                                    paint_label_at_line(printProjectedLine, projectionLength - 1, printLabelText, {
                                        color: '#FFFF00', // Dynamic color assignment for print labels - Yellow
                                        vertical_align: 'bottom'
                                    });
                                }
                                
                                paintedCount++;
                            }
                        }
                        
                        if (barPrints.length > 1) {
                            if (stackIndex === 0) {
                                const allRanks = barPrints.map(p => 'R' + (p.rank || '?')).join(' | ');
                                labelText = allRanks;
                            } else {
                                labelText = '';
                            }
                        }
                        
                        if (labelText) {
                            try {
                                if (barIndex >= 0 && barIndex < high.length && high[barIndex] !== undefined && !isNaN(high[barIndex])) {
                                    try {
                                        // Position labels directly over the candle using the high price
                                        const labelPrice = high[barIndex];
                                        
                                        const anchorLine = [];
                                        for (let i = 0; i < close.length; i++) {
                                            if (i === barIndex) {
                                                anchorLine[i] = labelPrice;
                                            } else {
                                                anchorLine[i] = NaN;
                                            }
                                        }
                                        
                                        const visibleAnchor = paint(anchorLine, {
                                            title: 'PrintAnchor_' + executionId + '_' + labelText.replace(/[^a-zA-Z0-9|]/g, '').substring(0, 20) + '_B' + barIndex,
                                            color: '#FFFF00', // Dynamic color assignment for print anchors - Yellow
                                            linewidth: 1,
                                            linestyle: 'dotted',
                                            transparency: 0.99
                                        });
                                        
                                        if (visibleAnchor) {
                                            paint_label_at_line(visibleAnchor, barIndex, labelText, {
                                                color: '#FFFF00', // Dynamic color assignment for print anchor labels - Yellow
                                                vertical_align: 'top'
                                            });
                                        } else {
                                            const invisibleMarker = [];
                                            for (let i = 0; i < close.length; i++) {
                                                invisibleMarker[i] = (i === barIndex) ? labelPrice : NaN;
                                            }
                                            
                                            const invisibleLine = paint(invisibleMarker, {
                                                title: 'InvisibleFallback_' + executionId + '_' + barIndex,
                                                color: '#FFFFFF',
                                                linewidth: 1,
                                                transparency: 1.0
                                            });
                                            
                                            if (invisibleLine) {
                                                paint_label_at_line(invisibleLine, barIndex, labelText, {
                                                    color: '#FFFF00',
                                                    vertical_align: 'top'
                                                });
                                            }
                                        }
                                    } catch (paintError) {
                                        console.error('Paint error for label:', paintError);
                                        
                                        try {
                                            const emergencyAnchor = [...high];
                                            
                                            const emergencyLine = paint(emergencyAnchor, {
                                                title: 'Emergency_' + executionId + '_' + barIndex,
                                                color: '#FFFF00', // Dynamic color assignment for emergency print anchors - Yellow
                                                linewidth: 1,
                                                transparency: 0.99
                                            });
                                            
                                            if (emergencyLine) {
                                                paint_label_at_line(emergencyLine, barIndex, labelText, {
                                                    color: '#FF0000',
                                                    vertical_align: 'top'
                                                });
                                            }
                                        } catch (emergencyError) {
                                            console.error('Emergency fallback failed:', emergencyError);
                                        }
                                    }
                                }
                            } catch (labelError) {
                                console.error('Error creating label:', labelError);
                            }
                        }
                        
                        paintedCount++;
                    });
                } catch (barError) {
                    console.error('Error processing prints for bar:', barError);
                }
            });
        }
        
        if (paintedCount > 0) {
            console.log('[' + executionId + '] Total painted elements: ' + paintedCount);
        } else {
            console.log('[' + executionId + '] No data found for ' + currentSymbol);
            paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
        }
        
        console.log('🏁 Completed execution ID: ' + executionId);
    }
    
} catch (error) {
    console.error('Error loading data:', error);
    paint(emptyLine, { title: 'Script Error', color: '#FF0000' });
} 