// TrendSpider Script Example - Drawing Lines and Boxes from API Data
// Based on TrendSpider scripting documentation: https://charts.trendspider.com/scripting/docs/#/fetching_data_from_apis

// Configuration
const API_BASE_URL = 'http://localhost:8000/api';
const API_KEY = 'YOUR_API_KEY';

// Fetch support and resistance levels
async function fetchSupportResistance(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/support-resistance?symbol=${symbol}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.levels || [];
    } catch (error) {
        console.error('Error fetching support/resistance data:', error);
        return [];
    }
}

// Fetch trend lines
async function fetchTrendLines(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/trend-lines?symbol=${symbol}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.trend_lines || [];
    } catch (error) {
        console.error('Error fetching trend lines data:', error);
        return [];
    }
}

// Fetch price boxes
async function fetchPriceBoxes(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/price-boxes?symbol=${symbol}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.price_boxes || [];
    } catch (error) {
        console.error('Error fetching price boxes data:', error);
        return [];
    }
}

// Draw horizontal lines for support/resistance
function drawSupportResistanceLines(levels) {
    levels.forEach(level => {
        if (level.symbol === getCurrentSymbol()) {
            const color = level.type === 'support' ? 'green' : 'red';
            const lineStyle = level.strength === 'strong' ? 'solid' : 'dashed';
            
            // Draw horizontal line at the price level
            drawHorizontalLine({
                price: level.price,
                color: color,
                style: lineStyle,
                width: level.strength === 'strong' ? 2 : 1,
                label: `${level.type.toUpperCase()} ${level.price}`,
                extend: true
            });
        }
    });
}

// Draw diagonal trend lines
function drawTrendLines(trendLines) {
    trendLines.forEach(line => {
        if (line.symbol === getCurrentSymbol()) {
            const color = line.type === 'uptrend' ? 'green' : 'red';
            const lineStyle = line.strength === 'strong' ? 'solid' : 'dashed';
            
            // Draw diagonal line from start to end point
            drawTrendLine({
                startTime: new Date(line.start_point.timestamp),
                startPrice: line.start_point.price,
                endTime: new Date(line.end_point.timestamp),
                endPrice: line.end_point.price,
                color: color,
                style: lineStyle,
                width: line.strength === 'strong' ? 2 : 1,
                extend: true,
                label: `${line.type.toUpperCase()} (${line.touches} touches)`
            });
        }
    });
}

// Draw price boxes/rectangles
function drawPriceBoxes(boxes) {
    boxes.forEach(box => {
        if (box.symbol === getCurrentSymbol()) {
            // Draw rectangle from top-left to bottom-right
            drawRectangle({
                startTime: new Date(box.top_left.timestamp),
                startPrice: box.top_left.price,
                endTime: new Date(box.bottom_right.timestamp),
                endPrice: box.bottom_right.price,
                fillColor: box.color,
                borderColor: box.color,
                opacity: box.opacity,
                label: box.label
            });
        }
    });
}

// Main function to load and draw all elements
async function main() {
    const currentSymbol = getCurrentSymbol();
    
    console.log(`Loading drawing data for ${currentSymbol}...`);
    
    try {
        // Fetch all data in parallel
        const [supportResistance, trendLines, priceBoxes] = await Promise.all([
            fetchSupportResistance(currentSymbol),
            fetchTrendLines(currentSymbol),
            fetchPriceBoxes(currentSymbol)
        ]);
        
        // Clear existing drawings
        clearAllDrawings();
        
        // Draw all elements
        drawSupportResistanceLines(supportResistance);
        drawTrendLines(trendLines);
        drawPriceBoxes(priceBoxes);
        
        console.log(`Successfully loaded and drew:
            - ${supportResistance.length} support/resistance levels
            - ${trendLines.length} trend lines
            - ${priceBoxes.length} price boxes`);
            
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Helper function to get current symbol (implement based on TrendSpider API)
function getCurrentSymbol() {
    // This would be implemented using TrendSpider's API to get the current chart symbol
    return 'SPY'; // Default for example
}

// Helper functions for drawing (these would use TrendSpider's drawing API)
function drawHorizontalLine(options) {
    // Implementation using TrendSpider's drawing API
    console.log('Drawing horizontal line:', options);
}

function drawTrendLine(options) {
    // Implementation using TrendSpider's drawing API
    console.log('Drawing trend line:', options);
}

function drawRectangle(options) {
    // Implementation using TrendSpider's drawing API
    console.log('Drawing rectangle:', options);
}

function clearAllDrawings() {
    // Implementation using TrendSpider's API to clear existing drawings
    console.log('Clearing all drawings');
}

// Execute the main function
main(); 