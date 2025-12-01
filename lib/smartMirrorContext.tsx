'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { Device } from './iotTypes'

export type WeatherData = {
  temp: number
  feels_like: number
  description: string
  humidity: number
  wind_speed: number
  icon: string
  city: string
}

export type StockData = {
  symbol: string
  price: number
  change: number
  changePercent: number
}

export type NewsArticle = {
  title: string
  source: string
  publishedAt: string
  url: string
}

type SmartMirrorContextType = {
  weather: WeatherData | null
  setWeather: (data: WeatherData | null) => void
  stocks: StockData[]
  setStocks: (data: StockData[]) => void
  news: NewsArticle[]
  setNews: (data: NewsArticle[]) => void
  devices: Device[]
  setDevices: (data: Device[]) => void
  videoFeedEnabled: boolean
  setVideoFeedEnabled: (enabled: boolean) => void
  toggleVideoFeed: () => void
  isListening: boolean
  setIsListening: (listening: boolean) => void
  isInterrupted: boolean
  setIsInterrupted: (interrupted: boolean) => void
}

const SmartMirrorContext = createContext<SmartMirrorContextType>({
  weather: null,
  setWeather: () => {},
  stocks: [],
  setStocks: () => {},
  news: [],
  setNews: () => {},
  devices: [],
  setDevices: () => {},
  videoFeedEnabled: false,
  setVideoFeedEnabled: () => {},
  toggleVideoFeed: () => {},
  isListening: false,
  setIsListening: () => {},
  isInterrupted: false,
  setIsInterrupted: () => {},
})

export function SmartMirrorProvider({ children }: { children: ReactNode }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [stocks, setStocks] = useState<StockData[]>([])
  const [news, setNews] = useState<NewsArticle[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [videoFeedEnabled, setVideoFeedEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isInterrupted, setIsInterrupted] = useState(false)

  const toggleVideoFeed = () => setVideoFeedEnabled(prev => !prev)

  return (
    <SmartMirrorContext.Provider
      value={{
        weather,
        setWeather,
        stocks,
        setStocks,
        news,
        setNews,
        devices,
        setDevices,
        videoFeedEnabled,
        setVideoFeedEnabled,
        toggleVideoFeed,
        isListening,
        setIsListening,
        isInterrupted,
        setIsInterrupted,
      }}
    >
      {children}
    </SmartMirrorContext.Provider>
  )
}

export const useSmartMirror = () => useContext(SmartMirrorContext)

