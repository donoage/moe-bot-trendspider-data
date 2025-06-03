describe_indicator('Support & Resistance Levels from JSON', 'overlay');

// Configuration - these can be modified directly in the code
const showSupport = true;
const showResistance = true;
const showStrongOnly = false;
const supportColor = '#00FF00';
const resistanceColor = '#FF0000';
const lineWidth = 2;
const showLabels = true; // Show text labels with volume and dollar info

// Load the support and resistance data from public GitHub repository
const dataUrl = 'https://raw.githubusercontent.com/donoage/moe-bot-trendspider-data/main/trendspider_data/support_resistance_levels.json';

// Initialize empty array for fallback
const emptyLine = Array.from({length: close.length}, function() { return NaN; });

// Helper function to format numbers
function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

try {
    const response = await request.http(dataUrl);
    console.log('response?', response);
    
    if (response.error) {
        console.error('HTTP Error:', response.error);
        paint(emptyLine, { title: 'HTTP Error', color: '#FF0000' });
    } else {
        // TrendSpider automatically parses JSON, so response is already an object
        const jsonData = response;
        const levels = jsonData.levels || [];
        
        // Get current symbol to filter relevant levels
        const currentSymbol = constants.ticker.toUpperCase();
        
        // Filter levels for current symbol
        const symbolLevels = levels.filter(function(level) { return level.symbol === currentSymbol; });
        
        if (symbolLevels.length === 0) {
            console.log('No support/resistance levels found for ' + currentSymbol);
            paint(emptyLine, { title: 'No S/R data for ' + currentSymbol, color: '#888888' });
        } else {
            let paintedCount = 0;
            
            // Process each level
            symbolLevels.forEach(function(level, index) {
                // For SPY, we don't have type/strength fields, so we'll determine based on price analysis
                // or treat all as key levels. For other symbols, use existing logic.
                let levelType = 'key'; // default for SPY
                let levelStrength = 'strong'; // default for SPY
                let color = '#FFFF00'; // default yellow for key levels
                
                // If the level has type field (non-SPY symbols), use it
                if (level.type) {
                    levelType = level.type;
                    color = level.type === 'support' ? supportColor : resistanceColor;
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
                    linewidth: width
                });
                
                // Add text label with volume and dollar information using paint_label_at_line
                if (showLabels && level.volume && level.dollars) {
                    const sharesText = formatNumber(level.volume) + ' shares';
                    const dollarsText = '$' + formatNumber(level.dollars);
                    const labelText = sharesText + ' | ' + dollarsText;
                    
                    // Use the correct syntax: paint_label_at_line(paintedLine, barIndex, labelText, options)
                    paint_label_at_line(paintedLine, close.length - 1, labelText, {
                        color: color,
                        vertical_align: 'top'
                    });
                }
                
                paintedCount++;
            });
            
            // Display summary information
            const supportCount = symbolLevels.filter(function(l) { return l.type === 'support'; }).length;
            const resistanceCount = symbolLevels.filter(function(l) { return l.type === 'resistance'; }).length;
            const keyLevelCount = symbolLevels.filter(function(l) { return !l.type; }).length;
            
            if (keyLevelCount > 0) {
                console.log('Loaded ' + keyLevelCount + ' key levels for ' + currentSymbol);
            } else {
                console.log('Loaded ' + supportCount + ' support and ' + resistanceCount + ' resistance levels for ' + currentSymbol);
            }
            console.log('Painted ' + paintedCount + ' levels on chart');
            
            // If nothing was painted due to filters, show a message
            if (paintedCount === 0) {
                paint(emptyLine, { title: 'All levels filtered out', color: '#888888' });
            }
        }
    }
    
} catch (error) {
    console.error('Error loading support/resistance data:', error);
    paint(emptyLine, { title: 'Script Error', color: '#FF0000' });
} 