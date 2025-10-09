'use client'

import { useState, useEffect } from 'react'

type StockData = {
  symbol: string
  price: number
  change: number
  changePercent: number
}

export default function Stocks() {
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        // Using Next.js API route to avoid CORS
        const response = await fetch('/api/stocks')
        const data = await response.json()
        
        if (data.stocks) {
          setStocks(data.stocks)
        }
        setLoading(false)
      } catch (error) {
        console.error('Stocks fetch error:', error)
        setLoading(false)
      }
    }

    fetchStocks()
    const interval = setInterval(fetchStocks, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-light text-white/80 mb-4">Markets</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-white/10 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-light text-white/80 mb-4">Markets</h3>
      <div className="grid grid-cols-2 gap-4">
        {stocks.map((stock) => (
          <div key={stock.symbol} className="space-y-1">
            <div className="text-sm font-light text-white/60">{stock.symbol}</div>
            <div className="text-2xl font-light text-white">
              ${stock.price.toFixed(2)}
            </div>
            <div className={`text-sm font-light ${
              stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} 
              ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

