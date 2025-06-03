describe_indicator('Moebot VL Trendspider', 'overlay');

// Configuration - these can be modified directly in the code
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const showPriceBoxes = true; // Show price boxes
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 2;
const showLabels = true; // Show text labels with volume and dollar info

// Load the support and resistance data from public GitHub repository
const dataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/trendspider_data/support_resistance_levels.json';
const priceBoxesUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/trendspider_data/price_boxes.json';

// Initialize empty array for fallback
const emptyLine = Array.from({length: close.length}, function() { return NaN; });

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

try {
    // Load both support/resistance levels and price boxes
    const [levelsResponse, boxesResponse] = await Promise.all([
        request.http(dataUrl),
        request.http(priceBoxesUrl)
    ]);
    
    console.log('Levels response?', levelsResponse);
    console.log('Boxes response?', boxesResponse);
    
    if (levelsResponse.error && boxesResponse.error) {
        console.error('HTTP Errors:', levelsResponse.error, boxesResponse.error);
        paint(emptyLine, { title: 'HTTP Error', color: '#FF0000' });
    } else {
        // Get current symbol to filter relevant data
        const currentSymbol = constants.ticker.toUpperCase();
        let paintedCount = 0;
        
        // Process support/resistance levels if available
        if (!levelsResponse.error) {
            const jsonData = levelsResponse;
            const levels = jsonData.levels || [];
            
            // Filter levels for current symbol
            const symbolLevels = levels.filter(function(level) { return level.symbol === currentSymbol; });
            
            if (symbolLevels.length > 0) {
                // Process each level
                symbolLevels.forEach(function(level, index) {
                    // Use the same light blue color for all support/resistance levels
                    let color = '#87CEEB'; // Light blue for all levels
                    
                    // For SPY, we don't have type/strength fields, so we'll determine based on price analysis
                    // or treat all as key levels. For other symbols, use existing logic.
                    let levelType = 'key'; // default for SPY
                    let levelStrength = 'strong'; // default for SPY
                    
                    // Legacy support: If the level has type field (old format), use it
                    if (level.type) {
                        levelType = level.type;
                    }
                    
                    // Legacy support: If the level has level_type field (old format), use it
                    if (level.level_type) {
                        levelType = level.level_type;
                    }
                    
                    // If the level has strength field, use it
                    if (level.strength) {
                        levelStrength = level.strength;
                    }
                    
                    // Apply user filters (only for symbols that have type field)
                    if (level.type) {
                        if (level.type === 'support' && !showSupport) return;
                        if (level.type === 'resistance' && !showResistance) return;
                        if (showStrongOnly && level.strength !== 'strong') return;
                    }
                    
                    // Determine line width
                    const width = levelStrength === 'strong' ? lineWidth : Math.max(1, lineWidth - 1);
                    
                    // Create horizontal line at the price level
                    const levelLine = Array.from({length: close.length}, function() { return level.price; });
                    
                    // Create title with basic information
                    let title = '';
                    if (level.type && level.strength) {
                        title = level.type.toUpperCase() + ' $' + level.price.toFixed(2) + ' (' + level.strength + ')';
                    } else if (level.type) {
                        title = level.type.toUpperCase() + ' $' + level.price.toFixed(2);
                    } else {
                        // For SPY levels without type, show basic info
                        title = '$' + level.price.toFixed(2);
                    }
                    
                    // Paint the level with appropriate styling
                    const paintedLine = paint(levelLine, {
                        title: title,
                        color: color,
                        linewidth: width,
                        linestyle: 'dashed'
                    });
                    
                    // Add text label with volume and dollar information using paint_label_at_line
                    if (showLabels && (level.volume || level.dollars)) {
                        let labelText = '';
                        
                        if (level.volume && level.dollars) {
                            // Both volume and dollars available - show shares, dollars, and rank
                            const sharesText = formatNumber(level.volume) + ' shares';
                            const dollarsText = '$' + formatNumber(level.dollars);
                            const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                            labelText = sharesText + ' | ' + dollarsText + (rankText ? ' | ' + rankText : '');
                        } else if (level.dollars) {
                            // Only dollars available
                            const dollarsText = '$' + formatNumber(level.dollars);
                            const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                            labelText = dollarsText + (rankText ? ' | ' + rankText : '');
                        } else if (level.volume) {
                            // Only volume available
                            const sharesText = formatNumber(level.volume) + ' shares';
                            const rankText = (level.rank && parseInt(level.rank) > 0) ? 'Rank ' + level.rank : '';
                            labelText = sharesText + (rankText ? ' | ' + rankText : '');
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
        }
        
        // Process price boxes if available
        if (!boxesResponse.error && showPriceBoxes) {
            const boxesData = boxesResponse;
            const priceBoxes = boxesData.price_boxes || [];
            
            // Filter boxes for current symbol
            const symbolBoxes = priceBoxes.filter(function(box) { return box.symbol === currentSymbol; });
            
            if (symbolBoxes.length > 0) {
                console.log('Found ' + symbolBoxes.length + ' price boxes for ' + currentSymbol);
                
                // Calculate box positioning at the right side of the chart
                const chartLength = close.length;
                const boxWidth = Math.max(10, Math.floor(chartLength * 0.1)); // 10% of chart width or minimum 10 bars
                const startOffset = Math.max(5, Math.floor(chartLength * 0.02)); // Small offset from the right edge
                
                symbolBoxes.forEach(function(box, index) {
                    try {
                        // Position boxes at the right side of the chart with slight offsets
                        const boxStartIndex = chartLength - boxWidth - startOffset - (index * 2); // Slight stagger
                        const boxEndIndex = chartLength - startOffset - (index * 2);
                        
                        // Ensure we have valid indices
                        if (boxStartIndex >= 0 && boxEndIndex >= 0 && boxStartIndex < boxEndIndex) {
                            // Get box dimensions - use the actual coordinate structure from the data
                            const topPrice = box.top_left.price;
                            const bottomPrice = box.bottom_right.price;
                            
                            // Use consistent purple color for all boxes
                            let boxLineColor = '#9932CC'; // Purple for all box lines
                            let fillColor = '#9932CC'; // Same purple for all box fills
                            
                            // Create horizontal lines for top and bottom of the box using horizontal_line()
                            const topLine = paint(horizontal_line(topPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' Top: $' + topPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 2,
                                linestyle: 'solid' // Solid lines instead of dashed
                            });
                            
                            const bottomLine = paint(horizontal_line(bottomPrice, boxStartIndex), {
                                title: 'Box ' + box.box_number + ' Bottom: $' + bottomPrice.toFixed(2),
                                color: boxLineColor,
                                linewidth: 2,
                                linestyle: 'solid' // Solid lines instead of dashed
                            });
                            
                            // Fill the area between top and bottom lines to create the box
                            fill(topLine, bottomLine, fillColor, box.opacity || 0.2, 'Box ' + box.box_number);
                            
                            // Add label with box information
                            if (showLabels) {
                                const volumeText = formatNumber(box.volume || 0) + ' vol';
                                const valueText = '$' + formatNumber(box.value || 0);
                                const tradesText = (box.trades || 0) + ' trades';
                                const labelText = '[BOX ' + box.box_number + '] ' + volumeText + ' • ' + valueText + ' • ' + tradesText;
                                
                                // Place label above the top of the box for better organization
                                const labelBarIndex = Math.floor((boxStartIndex + boxEndIndex) / 2);
                                
                                paint_label_at_line(topLine, labelBarIndex, labelText, {
                                    color: boxLineColor, // Match the box line color (purple)
                                    vertical_align: 'top' // Place label above the top line
                                });
                            }
                            
                            paintedCount += 1; // Count the filled box
                            console.log('Painted box ' + box.box_number + ' from bar ' + boxStartIndex + ' to ' + boxEndIndex + 
                                       ' with prices: top=' + topPrice + ', bottom=' + bottomPrice);
                        } else {
                            console.log('Invalid bar indices for box ' + box.box_number + ': start=' + boxStartIndex + ', end=' + boxEndIndex);
                        }
                    } catch (boxError) {
                        console.error('Error processing box ' + box.box_number + ':', boxError);
                    }
                });
            }
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