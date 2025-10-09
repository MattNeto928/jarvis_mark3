'use client'

import { useState, useEffect } from 'react'

type NewsArticle = {
  title: string
  source: string
  publishedAt: string
  url: string
}

export default function News() {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchNews = async () => {
      try {
        // Using RSS to JSON API for free news
        const response = await fetch(
          'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml'
        )
        const data = await response.json()
        
        if (data.items) {
          const articles = data.items.slice(0, 5).map((item: any) => ({
            title: item.title,
            source: 'BBC News',
            publishedAt: new Date(item.pubDate).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            url: item.link
          }))
          setNews(articles)
        }
        setLoading(false)
      } catch (error) {
        console.error('News fetch error:', error)
        setLoading(false)
      }
    }

    fetchNews()
    const interval = setInterval(fetchNews, 300000) // Update every 5 minutes

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-light text-white/80 mb-4">Breaking News</h3>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-white/10 rounded w-full"></div>
              <div className="h-4 bg-white/10 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-light text-white/80 mb-4">Breaking News</h3>
      <div className="space-y-4">
        {news.map((article, index) => (
          <div key={index} className="border-l-2 border-blue-500/30 pl-4 hover:border-blue-500/60 transition-colors">
            <h4 className="text-base font-light text-white leading-snug mb-1">
              {article.title}
            </h4>
            <div className="flex items-center gap-2 text-xs font-light text-white/50">
              <span>{article.source}</span>
              <span>•</span>
              <span>{article.publishedAt}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

