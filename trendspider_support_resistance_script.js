describe_indicator('Moebot VL Trendspider v3', 'overlay');

// Configuration - these can be modified directly in the code
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = true; // Show price boxes
const showPrints = false; // Show individual prints - set to false by default to avoid clutter
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

// Initialize empty array for fallback
const emptyLine = Array.from({length: close.length}, function() { return NaN; });

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
        
        // Process support/resistance levels
        const levels = tickerData.levels || [];
        if (levels.length > 0) {
            console.log('Found ' + levels.length + ' levels for ' + currentSymbol);
            
            levels.forEach(function(level, index) {
                // Use light blue color for all support/resistance levels
                let color = '#87CEEB'; // Light blue for all levels
                
                // Create horizontal line at the price level - match exact chart length
                const levelLine = Array.from({length: close.length}, function() { return level.price; });
                
                // Create title with price and rank information
                let title = '$' + level.price.toFixed(2);
                if (level.rank && parseInt(level.rank) > 0) {
                    title += ' (Rank ' + level.rank + ')';
                }
                
                // Paint the level with appropriate styling
                const paintedLine = paint(levelLine, {
                    title: title,
                    color: color,
                    linewidth: lineWidth,
                    linestyle: 'dashed'
                });
                
                // Add text label with volume and dollar information
                if (showLabels && (level.volume || level.dollars)) {
                    let labelText = '';
                    
                    if (level.volume && level.dollars) {
                        // Both volume and dollars available - show price, shares, dollars, and rank
                        const priceText = '$' + level.price.toFixed(2);
                        const sharesText = formatNumber(level.volume) + ' shares';
                        const dollarsText = '$' + formatNumber(level.dollars);
                        const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                        labelText = priceText + ' | ' + sharesText + ' | ' + dollarsText + (rankText ? ' | ' + rankText : '');
                    } else if (level.dollars) {
                        // Only dollars available - show price and dollars
                        const priceText = '$' + level.price.toFixed(2);
                        const dollarsText = '$' + formatNumber(level.dollars);
                        const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                        labelText = priceText + ' | ' + dollarsText + (rankText ? ' | ' + rankText : '');
                    } else if (level.volume) {
                        // Only volume available - show price and volume
                        const priceText = '$' + level.price.toFixed(2);
                        const sharesText = formatNumber(level.volume) + ' shares';
                        const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                        labelText = priceText + ' | ' + sharesText + (rankText ? ' | ' + rankText : '');
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
                    // Position boxes with simple staggered layout from right edge
                    const boxEndIndex = chartLength - rightMargin - (index * 3); // 3 bar spacing between boxes
                    const boxStartIndex = boxEndIndex - boxWidth;
                    
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
                                   ', threshold=$' + priceThreshold.toFixed(2) + ', useLines=' + useLines);
                        
                        // Use more subtle styling for less obtrusive boxes
                        let boxLineColor = '#9966CC'; // Slightly lighter purple
                        let fillColor = '#9966CC'; // Same subtle purple for fills
                        
                        if (useLines) {
                            // Create two separate horizontal lines when price range is too large
                            const topLine = paint(horizontal_line(topPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' High: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1, // Thinner lines
                                linestyle: 'solid'
                            });
                            
                            const bottomLine = paint(horizontal_line(bottomPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' Low: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1, // Thinner lines
                                linestyle: 'solid'
                            });
                            
                            // Add labels for both lines
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' vol';
                                const valueText = '$' + formatNumber(box.dollars || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                const dateText = box.date_range || '';
                                
                                // Label for high line
                                const highLabelText = '[BOX ' + box.box_number + ' HIGH] ' + volumeText + ' • ' + valueText + ' • ' + tradesText + (dateText ? ' • ' + dateText : '');
                                paint_label_at_line(topLine, close.length - 1, highLabelText, {
                                    color: boxLineColor,
                                    vertical_align: 'top'
                                });
                                
                                // Label for low line  
                                const lowLabelText = '[BOX ' + box.box_number + ' LOW] ' + volumeText + ' • ' + valueText + ' • ' + tradesText + (dateText ? ' • ' + dateText : '');
                                paint_label_at_line(bottomLine, close.length - 1, lowLabelText, {
                                    color: boxLineColor,
                                    vertical_align: 'bottom'
                                });
                            }
                            
                            console.log('Drew separate lines for box ' + box.box_number + ' (range too large): high=$' + topPrice.toFixed(2) + ', low=$' + bottomPrice.toFixed(2));
                        } else {
                            // Create filled box when price range is reasonable
                            const topLine = paint(horizontal_line(topPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' Top: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1, // Thinner lines
                                linestyle: 'solid'
                            });
                            
                            const bottomLine = paint(horizontal_line(bottomPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' Bottom: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 1, // Thinner lines
                                linestyle: 'solid'
                            });
                            
                            // Fill the area between top and bottom lines with lower opacity
                            fill(topLine, bottomLine, fillColor, 0.1, 'Box ' + box.box_number); // Reduced from 0.2 to 0.1
                            
                            // Add single label for filled box
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' vol';
                                const valueText = '$' + formatNumber(box.dollars || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                const dateText = box.date_range || '';
                                const labelText = '[BOX ' + box.box_number + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText + (dateText ? ' • ' + dateText : '');
                                
                                paint_label_at_line(topLine, close.length - 1, labelText, {
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
        
        // Process individual prints if enabled (disabled by default to avoid clutter)
        const prints = tickerData.prints || [];
        if (prints.length > 0 && showPrints) {
            console.log('Found ' + prints.length + ' prints for ' + currentSymbol);
            
            prints.forEach(function(print, index) {
                // Use a different color for prints (orange)
                let printColor = '#FFA500'; // Orange for prints
                
                // Create horizontal line at the print price - match exact chart length
                const printLine = Array.from({length: close.length}, function() { return print.price; });
                
                // Create title with print information
                let title = 'Print $' + print.price.toFixed(2);
                if (print.rank && parseInt(print.rank) > 0) {
                    title += ' (Rank ' + print.rank + ')';
                }
                
                // Paint the print with appropriate styling (thinner line, dotted)
                const paintedLine = paint(printLine, {
                    title: title,
                    color: printColor,
                    linewidth: 1,
                    linestyle: 'dotted'
                });
                
                // Add text label with print information
                if (showLabels && (print.volume || print.dollars)) {
                    let labelText = '';
                    
                    if (print.volume && print.dollars) {
                        const priceText = '$' + print.price.toFixed(2);
                        const sharesText = formatNumber(print.volume) + ' shares';
                        const dollarsText = '$' + formatNumber(print.dollars);
                        const rankText = (print.rank && parseInt(print.rank) > 0) ? 'Rank ' + print.rank : '';
                        labelText = '[PRINT] ' + priceText + ' | ' + sharesText + ' | ' + dollarsText + (rankText ? ' | ' + rankText : '');
                    } else if (print.dollars) {
                        const priceText = '$' + print.price.toFixed(2);
                        const dollarsText = '$' + formatNumber(print.dollars);
                        const rankText = (print.rank && parseInt(print.rank) > 0) ? 'Rank ' + print.rank : '';
                        labelText = '[PRINT] ' + priceText + ' | ' + dollarsText + (rankText ? ' | ' + rankText : '');
                    } else if (print.volume) {
                        const priceText = '$' + print.price.toFixed(2);
                        const sharesText = formatNumber(print.volume) + ' shares';
                        const rankText = (print.rank && parseInt(print.rank) > 0) ? 'Rank ' + print.rank : '';
                        labelText = '[PRINT] ' + priceText + ' | ' + sharesText + (rankText ? ' | ' + rankText : '');
                    }
                    
                    if (labelText) {
                        paint_label_at_line(paintedLine, close.length - 1, labelText, {
                            color: printColor,
                            vertical_align: 'bottom' // Place print labels at bottom to avoid overlap
                        });
                    }
                }
                
                paintedCount++;
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