import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get('symbols')?.split(',') || ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'TSLA']

  try {
    const stockData = []

    for (const symbol of symbols) {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        )
        
        const data = await response.json()
        
        if (data.chart?.result?.[0]) {
          const result = data.chart.result[0]
          const quote = result.meta
          const currentPrice = quote.regularMarketPrice
          const previousClose = quote.chartPreviousClose || quote.previousClose
          const change = currentPrice - previousClose
          const changePercent = (change / previousClose) * 100
          
          stockData.push({
            symbol,
            price: currentPrice,
            change,
            changePercent
          })
        }
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err)
      }
    }

    return NextResponse.json({ stocks: stockData })
  } catch (error) {
    console.error('Stocks API error:', error)
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 })
  }
}

