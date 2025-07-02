describe_indicator('moebot TS simple', 'overlay');

// Configuration
const lineWidth = 2;
const supportColor = '#00FF00';  // Green
const resistanceColor = '#FF0000';  // Red
const levelsOpacity = 0.8;
const projectionLength = 10; // Project lines 10 bars into the future

// Helper function to format numbers
function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    else if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    else if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Helper function to wait for data to be ready
function ensureDataReady() {
    // Simple synchronous check - TrendSpider doesn't allow Promise constructor
    if (close && close.length > 0 && time && time.length > 0 && high && high.length > 0) {
        return true;
    }
    return false;
}

// Initialize empty array for fallback
const emptyLine = [];
for (let i = 0; i < close.length; i++) {
    emptyLine[i] = NaN;
}

// Ensure data is ready before proceeding
if (!ensureDataReady()) {
    console.log('Chart data not fully loaded yet - proceeding with available data');
}

try {
    const currentSymbol = constants.ticker.toUpperCase();
    const currentTime = Date.now();
    const cacheBuster = currentTime + '_' + Math.random().toString(36).substr(2, 9);
    
    const tickerDataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/ticker_data/' + 
                         currentSymbol + '.json?v=' + cacheBuster;
    
    console.log('Loading data for ' + currentSymbol + ' - Chart bars: ' + close.length);
    
    const tickerResponse = await request.http(tickerDataUrl);
    
    if (tickerResponse.error) {
        console.error('Error loading data:', tickerResponse.error);
        paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
    } else {
        const tickerData = tickerResponse;
        let paintedCount = 0;
        
        console.log('Successfully loaded data for ' + currentSymbol);
        
        // Process support/resistance levels
        const levels = tickerData.levels || [];
        
        if (levels.length > 0) {
            levels.forEach(function(level, index) {
                // Use light grey for all horizontal lines
                let color = '#C0C0C0'; // Light grey for all lines
                
                // Create horizontal line across the chart
                const levelLine = [];
                for (let i = 0; i < close.length; i++) {
                    levelLine[i] = level.price;
                }
                
                // Create the title for the level with all relevant information
                let title = '$' + level.price.toFixed(2);
                
                // Add rank if available
                if (level.rank && parseInt(level.rank) > 0) {
                    title += ' R' + level.rank;
                }
                
                // Add volume if available
                if (level.volume) {
                    title += ' | ' + formatNumber(level.volume) + ' shares';
                }
                
                // Add dollar value if available
                if (level.dollars) {
                    title += ' | $' + formatNumber(level.dollars);
                }
                
                // Paint the level line
                const paintedLine = paint(levelLine, {
                    title: title,
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'solid',
                    transparency: 1.0 - levelsOpacity
                });
                
                // Create projection into the future
                const projectionArray = [];
                for (let i = 0; i < projectionLength; i++) {
                    projectionArray[i] = level.price;
                }
                
                // Paint projection
                const projectedLine = paint_projection(projectionArray, {
                    title: title + ' (Projection)',
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'dotted',
                    transparency: 1.0 - levelsOpacity
                });
                
                // Create label text with level information
                let labelText = '$' + level.price.toFixed(2);
                
                // Add volume information if available
                if (level.volume) {
                    labelText += ' | ' + formatNumber(level.volume) + ' shares';
                }
                
                // Add dollar value if available
                if (level.dollars) {
                    labelText += ' | $' + formatNumber(level.dollars);
                }
                
                // Add rank if available
                if (level.rank && parseInt(level.rank) > 0) {
                    labelText += ' | Rank ' + level.rank;
                }
                
                // Paint the label at the end of the main level line
                const labelIndex = close.length - 1;
                console.log('Creating label for level: ' + title + ' with color: ' + color);
                
                try {
                    const labelResult = paint_label_at_line(paintedLine, labelIndex, labelText, {
                        color: color,
                        vertical_align: 'top'
                    });
                    
                    if (labelResult) {
                        console.log('✓ Label created successfully for $' + level.price.toFixed(2));
                    } else {
                        console.log('✗ Label creation failed for $' + level.price.toFixed(2));
                    }
                } catch (labelError) {
                    console.error('Error creating label for $' + level.price.toFixed(2) + ':', labelError);
                }
                

                
                paintedCount++;
            });
            
            console.log('Painted ' + paintedCount + ' levels for ' + currentSymbol);
        } else {
            console.log('No levels found for ' + currentSymbol);
        }
        
        // Process prints data for rank labels over candles
        const prints = tickerData.prints || [];
        
        console.log('DEBUG: Found ' + prints.length + ' prints to process');
        
        if (prints.length > 0) {
            const printsByBar = {};
            const lastChartTime = time.length > 0 ? time[time.length - 1] : 0;
            
            // Group prints by bar index based on timestamp
            prints.forEach(function(print, index) {
                try {
                    console.log('DEBUG: Processing print ' + (index + 1) + '/' + prints.length + ' - Rank: ' + (print.rank || 'N/A') + ', Price: $' + (print.price || 'N/A') + ', Timestamp: ' + (print.timestamp || 'N/A'));
                    
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
                        console.log('DEBUG: Added print to bar ' + barIndex + ' (total at this bar: ' + printsByBar[barIndex].length + ')');
                    } else {
                        console.log('DEBUG: Invalid barIndex ' + barIndex + ' for print, skipping');
                    }
                } catch (printError) {
                    console.error('Error processing print:', printError);
                }
            });
            
            // Create rank labels over candles
            console.log('DEBUG: Processing ' + Object.keys(printsByBar).length + ' bars with prints');
            
            // Note: Would add delay here but TrendSpider doesn't allow Promise constructor
            console.log('DEBUG: Starting label creation process');
            
            Object.keys(printsByBar).forEach(function(barIndexStr) {
                try {
                    const barIndex = parseInt(barIndexStr);
                    const barPrints = printsByBar[barIndex];
                    
                    console.log('DEBUG: Processing bar ' + barIndex + ' with ' + barPrints.length + ' prints');
                    
                    // Sort prints by rank
                    barPrints.sort(function(a, b) {
                        const rankA = parseInt(a.rank) || 999;
                        const rankB = parseInt(b.rank) || 999;
                        return rankA - rankB;
                    });
                    
                    barPrints.forEach(function(print, stackIndex) {
                        const rankText = print.rank ? print.rank : '?';
                        const rankNumber = parseInt(print.rank) || 999;
                        let labelText = 'R' + rankText;
                        
                        // Combine multiple prints at same bar
                        if (barPrints.length > 1) {
                            if (stackIndex === 0) {
                                const allRanks = barPrints.map(p => 'R' + (p.rank || '?')).join(' | ');
                                
                                // Check for MSD condition: rank 5 or better AND another print rank 20 or better
                                const hasTopRank = barPrints.some(p => {
                                    const rank = parseInt(p.rank) || 999;
                                    return rank >= 1 && rank <= 5;
                                });
                                
                                const hasSecondaryRank = barPrints.some(p => {
                                    const rank = parseInt(p.rank) || 999;
                                    return rank >= 6 && rank <= 20;
                                });
                                
                                if (hasTopRank && hasSecondaryRank) {
                                    labelText = allRanks + ' [MSD]';
                                } else {
                                    labelText = allRanks;
                                }
                            } else {
                                labelText = ''; // Skip subsequent prints, already combined
                            }
                        }
                        
                        if (labelText && barIndex >= 0 && barIndex < high.length && high[barIndex] !== undefined && !isNaN(high[barIndex])) {
                            try {
                                console.log('DEBUG: Creating label "' + labelText + '" at bar ' + barIndex + ', high price: $' + high[barIndex].toFixed(2));
                                
                                // Position labels directly over the candle using the high price (exactly like original)
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
                                    title: 'PrintAnchor_' + labelText.replace(/[^a-zA-Z0-9|]/g, '').substring(0, 20) + '_B' + barIndex,
                                    color: '#FFFF00', // Yellow like original
                                    linewidth: 1,
                                    linestyle: 'dotted',
                                    transparency: 0.99
                                });
                                
                                console.log('DEBUG: visibleAnchor creation ' + (visibleAnchor ? 'SUCCESS' : 'FAILED') + ' for bar ' + barIndex);
                                 
                                 if (visibleAnchor) {
                                     const labelSuccess = paint_label_at_line(visibleAnchor, barIndex, labelText, {
                                         color: '#FFFF00',
                                         vertical_align: 'top'
                                     });
                                     console.log('✓ DEBUG: Print rank label created: ' + labelText + ' at bar ' + barIndex + ' - Return value: ' + labelSuccess + ', Type: ' + typeof labelSuccess);
                                 } else {
                                     console.log('DEBUG: visibleAnchor failed, trying fallback for bar ' + barIndex);
                                     
                                     const invisibleMarker = [];
                                     for (let i = 0; i < close.length; i++) {
                                         invisibleMarker[i] = (i === barIndex) ? labelPrice : NaN;
                                     }
                                     
                                     const invisibleLine = paint(invisibleMarker, {
                                         title: 'InvisibleFallback_' + barIndex,
                                         color: '#FFFFFF',
                                         linewidth: 1,
                                         transparency: 1.0
                                     });
                                     
                                     console.log('DEBUG: invisibleLine creation ' + (invisibleLine ? 'SUCCESS' : 'FAILED') + ' for bar ' + barIndex);
                                     
                                     if (invisibleLine) {
                                         const fallbackSuccess = paint_label_at_line(invisibleLine, barIndex, labelText, {
                                             color: '#FFFF00',
                                             vertical_align: 'top'
                                         });
                                         console.log('✓ DEBUG: Print rank label created via fallback: ' + labelText + ' at bar ' + barIndex + ' - Return value: ' + fallbackSuccess + ', Type: ' + typeof fallbackSuccess);
                                     } else {
                                         console.log('✗ DEBUG: All label creation methods failed for: ' + labelText + ' at bar ' + barIndex);
                                     }
                                 }
                                 
                                 paintedCount++;
                            } catch (labelError) {
                                console.error('DEBUG: Error creating print label for "' + labelText + '" at bar ' + barIndex + ':', labelError);
                            }
                        } else {
                            console.log('DEBUG: Skipping label creation - labelText: "' + labelText + '", barIndex: ' + barIndex + ', high.length: ' + high.length + ', high[barIndex]: ' + (high[barIndex] || 'undefined'));
                        }
                    });
                } catch (barError) {
                    console.error('Error processing prints for bar:', barError);
                }
            });
        }
        
        if (paintedCount > 0) {
            console.log('SUCCESS: Painted ' + paintedCount + ' elements for ' + currentSymbol + ' - Chart ready with ' + close.length + ' bars');
        } else {
            console.log('No data found for ' + currentSymbol);
            paint(emptyLine, { title: 'No data for ' + currentSymbol, color: '#888888' });
        }
    }
    
} catch (error) {
    console.error('Script error:', error);
    paint(emptyLine, { title: 'Script Error', color: '#FF0000' });
} 