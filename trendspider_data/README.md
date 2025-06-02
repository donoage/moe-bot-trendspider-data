# TrendSpider Data for Drawing Lines and Boxes

This directory contains structured data files that can be used with TrendSpider's scripting API to automatically draw lines and boxes on charts.

## Data Files

### 1. `support_resistance_levels.json`
Contains horizontal support and resistance levels that can be drawn as horizontal lines on charts.

**Structure:**
- `symbol`: Stock ticker symbol
- `type`: "support" or "resistance"
- `price`: Price level for the horizontal line
- `strength`: "strong", "medium", or "weak"
- `timestamp`: When the level was identified
- `volume_confirmation`: Boolean indicating if volume confirms the level
- `touches`: Number of times price has touched this level

### 2. `trend_lines.json`
Contains diagonal trend lines with start and end points.

**Structure:**
- `symbol`: Stock ticker symbol
- `type`: "uptrend" or "downtrend"
- `start_point`: Object with timestamp and price for line start
- `end_point`: Object with timestamp and price for line end
- `strength`: "strong", "medium", or "weak"
- `touches`: Number of times price has touched this trend line
- `slope`: Mathematical slope of the trend line

### 3. `price_boxes.json`
Contains rectangular areas/boxes that can be drawn on charts.

**Structure:**
- `symbol`: Stock ticker symbol
- `type`: Type of box (e.g., "consolidation", "breakout_zone", "resistance_zone")
- `top_left`: Object with timestamp and price for top-left corner
- `bottom_right`: Object with timestamp and price for bottom-right corner
- `color`: Color for the box
- `opacity`: Transparency level (0.0 to 1.0)
- `label`: Text label for the box

### 4. `api_endpoints.json`
Configuration file defining API endpoints and local file paths for TrendSpider to fetch data.

### 5. `trendspider_script_example.js`
Example JavaScript code showing how to fetch and use this data with TrendSpider's scripting API.

## Usage with TrendSpider

Based on the [TrendSpider scripting documentation](https://charts.trendspider.com/scripting/docs/#/fetching_data_from_apis), you can:

1. **Set up API endpoints** to serve this data
2. **Use the fetch API** in TrendSpider scripts to retrieve the data
3. **Draw elements** using TrendSpider's drawing functions

### Example Integration

```javascript
// Fetch support/resistance data
const response = await fetch('http://localhost:8000/api/support-resistance?symbol=SPY');
const data = await response.json();

// Draw horizontal lines
data.levels.forEach(level => {
    drawHorizontalLine({
        price: level.price,
        color: level.type === 'support' ? 'green' : 'red',
        style: level.strength === 'strong' ? 'solid' : 'dashed'
    });
});
```

## Data Sources

This data can be populated from various sources:
- Your existing market analysis scripts
- Technical analysis algorithms
- Manual analysis results
- Third-party data providers

## File Formats

All data files use JSON format for easy parsing and integration with web APIs and JavaScript applications.

## Updating Data

The data files can be updated programmatically by your trading bots or analysis scripts to provide real-time drawing data to TrendSpider. 