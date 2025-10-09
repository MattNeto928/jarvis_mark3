'use client'

import { useState, useEffect } from 'react'

type WeatherData = {
  temp: number
  feels_like: number
  description: string
  humidity: number
  wind_speed: number
  icon: string
  city: string
}

export default function Weather() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Get user's location
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords
          
          // Using Open-Meteo (free, no API key needed)
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`
          )
          const data = await response.json()
          
          // Get city name from reverse geocoding
          const geoResponse = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          )
          const geoData = await geoResponse.json()
          
          const weatherCodes: { [key: number]: string } = {
            0: 'Clear',
            1: 'Mainly Clear',
            2: 'Partly Cloudy',
            3: 'Overcast',
            45: 'Foggy',
            48: 'Foggy',
            51: 'Light Drizzle',
            61: 'Light Rain',
            63: 'Moderate Rain',
            65: 'Heavy Rain',
            71: 'Light Snow',
            73: 'Moderate Snow',
            75: 'Heavy Snow',
            95: 'Thunderstorm',
          }
          
          setWeather({
            temp: Math.round(data.current.temperature_2m),
            feels_like: Math.round(data.current.temperature_2m - 2),
            description: weatherCodes[data.current.weather_code] || 'Clear',
            humidity: data.current.relative_humidity_2m,
            wind_speed: Math.round(data.current.wind_speed_10m),
            icon: data.current.weather_code <= 1 ? '☀️' : data.current.weather_code <= 3 ? '⛅' : '☁️',
            city: geoData.city || geoData.locality || 'Unknown'
          })
          setLoading(false)
        }, (error) => {
          console.error('Geolocation error:', error)
          setLoading(false)
        })
      } catch (error) {
        console.error('Weather fetch error:', error)
        setLoading(false)
      }
    }

    fetchWeather()
    const interval = setInterval(fetchWeather, 600000) // Update every 10 minutes

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-white/10 rounded w-32"></div>
          <div className="h-12 bg-white/10 rounded w-48"></div>
        </div>
      </div>
    )
  }

  if (!weather) return null

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-light text-white/60 mb-1">{weather.city}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-thin text-white">{weather.temp}°</span>
            <span className="text-2xl font-light text-white/60">F</span>
          </div>
          <p className="text-lg font-light text-white/80 mt-2">{weather.description}</p>
        </div>
        
        <div className="text-right space-y-2">
          <div className="text-sm font-light text-white/60">
            Feels like {weather.feels_like}°
          </div>
          <div className="text-sm font-light text-white/60">
            Humidity {weather.humidity}%
          </div>
          <div className="text-sm font-light text-white/60">
            Wind {weather.wind_speed} mph
          </div>
        </div>
      </div>
    </div>
  )
}

