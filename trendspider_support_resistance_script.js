describe_indicator('Moebot VL Trendspider v5.9.1 (Fixed Line Style Error)', 'overlay');

// Execution tracking and fresh load mechanisms
const executionId = Math.random().toString(36).substr(2, 9);
const currentTime = Date.now();
const randomDelay = Math.floor(Math.random() * 300) + 100;
const symbolHash = (typeof constants !== 'undefined' && constants.ticker) ?
    constants.ticker.toUpperCase().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0) : 0;

// Force fresh load tracking
const tickerChangeDetector = constants.ticker + '_' + Math.floor(Date.now() / 60000); // Changes every minute
const scriptInstanceId = executionId + '_' + symbolHash + '_' + currentTime;



// Configuration
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = false;
const showPrints = true;
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 1;
const showLabels = true;
const levelsOpacity = 0.7;

// Performance optimization: Predefined limits based on data analysis
const MAX_LEVELS = 10;           // Typically 5 levels per ticker, allow some buffer
const MAX_PRINTS = 15;           // Typically 0-10 prints per ticker, allow buffer
const MAX_TOTAL_PAINTED_LINES = 40; // Total limit to prevent performance issues (reduced since boxes removed)

// Projection configuration - number of bars to project into the future
const projectionLength = 60; // Project lines 50 bars into the future

// Performance tracking
let totalPaintedLines = 0;
let performanceStartTime = Date.now();

// Helper functions
function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    else if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    else if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// timestampToBarIndex function removed - now using TrendSpider's optimized land_points_onto_series

function getColorWithOpacity(colorHex, opacity) {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
}

// Performance check function
function canPaintMore() {
    return totalPaintedLines < MAX_TOTAL_PAINTED_LINES;
}

// Increment painted lines counter
function incrementPaintedLines() {
    totalPaintedLines++;
    return totalPaintedLines;
}

// Initialize empty array for fallback and clear any previous state
const emptyLine = [];
for (let i = 0; i < close.length; i++) {
    emptyLine[i] = NaN;
}

// Force fresh execution state - no global state persistence
// Each script execution is completely independent


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



    // Use simple HTTP request - cache busting handled via URL parameters
    const tickerResponse = await request.http(tickerDataUrl);

    if (tickerResponse.error) {
        console.error('HTTP Error loading ticker data:', tickerResponse.error);
        console.error('URL attempted:', tickerDataUrl.substr(0, 100) + '...');
        paint(emptyLine, { name: 'NoData', color: '#888888' });
        incrementPaintedLines();
    } else {
        const tickerData = tickerResponse;



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

        // Process support/resistance levels with limits
        const rawLevels = tickerData.levels || [];
        const consolidationThreshold = 0.1;
        let levels = consolidateLevels(rawLevels, consolidationThreshold);

        // Apply performance limit for levels
        if (levels.length > MAX_LEVELS) {

            levels = levels.slice(0, MAX_LEVELS);
        }

        if (levels.length > 0 && canPaintMore()) {
            levels.forEach(function (level, index) {
                if (!canPaintMore()) {

                    return;
                }

                // Dynamic color assignment for support/resistance levels
                let color = '#87CEEB';    // Light blue for support/resistance levels

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
                    name: 'Level_' + (index + 1),
                    color: color,
                    thickness: lineWidth,
                    style: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });

                incrementPaintedLines();

                // Create projection array for future bars
                const projectionArray = [];
                for (let i = 0; i < projectionLength; i++) {
                    projectionArray[i] = level.price;
                }

                // Paint projection into the future
                const projectedLine = paint_projection(projectionArray, {
                    name: 'Level_' + (index + 1) + '_Projection',
                    color: color,
                    thickness: lineWidth,
                    style: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });

                incrementPaintedLines();

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
            });
        }

        // Price boxes functionality removed for simplified performance

        // Process prints with limits
        let prints = tickerData.prints || [];

        // Apply performance limit for prints
        if (prints.length > MAX_PRINTS) {

            // Sort by rank (lower is better) and take the best ones
            prints.sort(function (a, b) {
                const rankA = parseInt(a.rank) || 999;
                const rankB = parseInt(b.rank) || 999;
                return rankA - rankB;
            });
            prints = prints.slice(0, MAX_PRINTS);
        }

        if (prints.length > 0 && showPrints && canPaintMore()) {
            const printsByBar = {};

            // Use TrendSpider's optimized land_points_onto_series function for timestamp matching




            try {
                // Prepare timestamp arrays for land_points_onto_series
                const printTimestamps = [];
                const printData = [];

                prints.forEach(function (print, index) {
                    if (print.timestamp && print.timestamp > 0) {
                        // Use Unix timestamp in seconds (TrendSpider's time array format)
                        printTimestamps.push(print.timestamp);
                        printData.push(print);
                    } else {
                        // For prints without timestamps, assign to the last bar
                        const fallbackBarIndex = time.length - 1;
                        if (!printsByBar[fallbackBarIndex]) {
                            printsByBar[fallbackBarIndex] = [];
                        }
                        printsByBar[fallbackBarIndex].push(print);
                    }
                });

                // Use land_points_onto_series to efficiently match timestamps to candles
                if (printTimestamps.length > 0) {
                    // Prepare sourceValues array (print prices)
                    const printPrices = [];
                    printData.forEach(function (print) {
                        printPrices.push(print.price || 0);
                    });

                    // Use TrendSpider's land_points_onto_series function
                    const landedSeries = land_points_onto_series(printTimestamps, printPrices, time, 'ge', null);

                    // Process the landed series - it's a sparse array where indices represent bar positions
                    if (landedSeries && landedSeries.length > 0) {
                        landedSeries.forEach(function (landedValue, barIndex) {
                            // landedValue contains the print price that was landed at this bar
                            // Find the corresponding print data by matching the price
                            if (landedValue !== null && landedValue !== undefined && barIndex < time.length) {
                                const matchingPrint = printData.find(function (print) {
                                    return Math.abs(print.price - landedValue) < 0.01; // Small tolerance for floating point comparison
                                });

                                if (matchingPrint) {
                                    if (!printsByBar[barIndex]) {
                                        printsByBar[barIndex] = [];
                                    }
                                    printsByBar[barIndex].push(matchingPrint);
                                }
                            }
                        });
                    }
                }

            } catch (landError) {
                console.error('[' + executionId + '] ⚠️ Error using land_points_onto_series, falling back to manual matching:', landError);

                // Fallback to manual timestamp matching if land_points_onto_series fails
                prints.forEach(function (print, index) {
                    try {
                        let barIndex = -1;
                        if (print.timestamp && print.timestamp > 0) {
                            // Use Unix timestamp in seconds (TrendSpider's time array format)
                            const timestamp = print.timestamp;
                            const lastChartTime = time.length > 0 ? time[time.length - 1] : 0;
                            const isAfterChartEnd = timestamp > lastChartTime;

                            if (isAfterChartEnd) {
                                barIndex = time.length - 1;
                            } else {
                                let bestMatch = -1;
                                let bestDistance = Infinity;

                                for (let i = 0; i < time.length; i++) {
                                    const barTime = time[i];
                                    const distance = Math.abs(barTime - timestamp);

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
                        console.error('Error processing print in fallback:', printError);
                        const emergencyBarIndex = time.length > 0 ? time.length - 1 : 0;
                        if (!printsByBar[emergencyBarIndex]) {
                            printsByBar[emergencyBarIndex] = [];
                        }
                        printsByBar[emergencyBarIndex].push(print);
                    }
                });
            }

            // Track painted print lines to avoid duplicates
            const paintedPrintPrices = {};

            Object.keys(printsByBar).forEach(function (barIndexStr) {
                if (!canPaintMore()) {

                    return;
                }

                try {
                    const barIndex = parseInt(barIndexStr);

                    // Skip invalid bar indices
                    if (isNaN(barIndex) || barIndex < 0 || barIndex >= time.length) {
                        console.warn('[' + executionId + '] ⚠️ Skipping invalid bar index: ' + barIndexStr + ' (parsed: ' + barIndex + ')');
                        return;
                    }

                    const barPrints = printsByBar[barIndex];

                    if (!barPrints || !Array.isArray(barPrints)) {
                        console.warn('[' + executionId + '] ⚠️ No prints found for bar index ' + barIndex);
                        return;
                    }

                    barPrints.sort(function (a, b) {
                        const rankA = parseInt(a.rank) || 999;
                        const rankB = parseInt(b.rank) || 999;
                        return rankA - rankB;
                    });

                    barPrints.forEach(function (print, stackIndex) {
                        if (!canPaintMore()) {
                            return;
                        }

                        const rankText = print.rank ? print.rank : '?';
                        const rankNumber = parseInt(print.rank) || 999;
                        let labelText = 'R' + rankText;



                        // Draw horizontal line for prints ranked 10 or better (only once per price level)
                        if (rankNumber <= 5 && print.price) {
                            const priceKey = print.price.toFixed(2);
                            if (!paintedPrintPrices[priceKey]) {
                                paintedPrintPrices[priceKey] = true;

                                const printLineArray = [];
                                for (let i = 0; i < close.length; i++) {
                                    printLineArray[i] = print.price;
                                }

                                const printLine = paint(printLineArray, {
                                    name: 'Print_R' + rankText + '_' + print.price.toFixed(2).replace('.', '_'),
                                    color: '#FFFF00', // Dynamic color assignment for prints - Yellow
                                    thickness: 1,
                                    style: 'dotted',
                                    transparency: 0.1 // More opaque (90% opacity)
                                });

                                incrementPaintedLines();

                                // Create projection for print line
                                const printProjectionArray = [];
                                for (let i = 0; i < projectionLength; i++) {
                                    printProjectionArray[i] = print.price;
                                }

                                const printProjectedLine = paint_projection(printProjectionArray, {
                                    name: 'Print_R' + rankText + '_' + print.price.toFixed(2).replace('.', '_') + '_Projection',
                                    color: '#FFFF00',
                                    thickness: 1,
                                    style: 'dotted',
                                    transparency: 0.1
                                });

                                incrementPaintedLines();

                                if (!printProjectedLine) {
                                    console.warn('Failed to create projected line for print R' + rankText + ' at $' + print.price.toFixed(2));
                                }

                                // Add label to the print line with error handling
                                if (showLabels && printProjectedLine && projectionLength > 0) {
                                    try {
                                        const dollarAmount = print.dollars ? ' ($' + formatNumber(print.dollars) + ')' : '';
                                        const printLabelText = 'Print R' + rankText + ' | $' + print.price.toFixed(2) + dollarAmount;
                                        // Use projectionLength - 1 but ensure it's valid (minimum 0)
                                        const labelIndex = Math.max(0, projectionLength - 1);
                                        paint_label_at_line(printProjectedLine, labelIndex, printLabelText, {
                                            color: '#FFFF00', // Dynamic color assignment for print labels - Yellow
                                            vertical_align: 'bottom'
                                        });
                                    } catch (projectionLabelError) {
                                        console.error('Error creating projection label for print R' + rankText + ':', projectionLabelError);
                                    }
                                }
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
                        // If there's only one print per bar, labelText is already set to 'R' + rankText above

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
                                            name: 'PrintAnchor_' + barIndex,
                                            color: '#FFFF00', // Dynamic color assignment for print anchors - Yellow
                                            thickness: 1,
                                            transparency: 0.99
                                        });

                                        incrementPaintedLines();

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
                                                name: 'InvisibleFallback_' + barIndex,
                                                color: '#FFFFFF',
                                                thickness: 1,
                                                transparency: 1.0
                                            });

                                            incrementPaintedLines();

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
                                                name: 'Emergency_' + barIndex,
                                                color: '#FFFF00', // Dynamic color assignment for emergency print anchors - Yellow
                                                thickness: 1,
                                                transparency: 0.99
                                            });

                                            incrementPaintedLines();

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
                    });
                } catch (barError) {
                    console.error('Error processing prints for bar:', barError);
                }
            });
        }

        // Performance summary
        const performanceEndTime = Date.now();
        const executionTime = performanceEndTime - performanceStartTime;

        if (totalPaintedLines > 0) {

        } else {
            console.log('[' + executionId + '] No data found for ' + currentSymbol);
            paint(emptyLine, { name: 'NoData', color: '#888888' });
            incrementPaintedLines();
        }


    }

} catch (error) {
    console.error('Error loading data:', error);
    paint(emptyLine, { name: 'ScriptError', color: '#FF0000' });
    incrementPaintedLines();
} 