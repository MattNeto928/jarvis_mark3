'use client'

import { useState, useEffect } from 'react'
import { useUart } from '@/lib/uartContext'

type HeartRateData = {
  avg_bpm: number
  inst_bpm: number
  finger: boolean
  timestamp_ms: number
}

export default function HeartRate() {
  const [heartRate, setHeartRate] = useState<number | null>(null)
  const [fingerDetected, setFingerDetected] = useState<boolean>(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const { lastPacket } = useUart()

  useEffect(() => {
    if (lastPacket?.type === 'complete_packet' && lastPacket.data) {
      const data = lastPacket.data as any

      if (data.device === 'hr' && data.payload) {
        const hrData = data.payload as HeartRateData
        console.log('💓 Heart rate data received:', hrData)
        setHeartRate(hrData.avg_bpm)
        setFingerDetected(hrData.finger)
        setLastUpdate(new Date())
      }
    }
  }, [lastPacket])

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate.getTime() > 5000) {
        setHeartRate(null)
        setFingerDetected(false)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lastUpdate])

  // Calculate time since last update
  const getTimeSinceUpdate = () => {
    if (!lastUpdate) return null
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  const timeSinceUpdate = getTimeSinceUpdate()

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-light text-white/80">Heart Rate</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            fingerDetected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'
          }`}></div>
          <span className="text-xs font-light text-white/50">
            {fingerDetected ? 'Active' : 'No finger'}
          </span>
        </div>
      </div>

      <div className="text-center py-4">
        <div className="flex items-center justify-center gap-3">
          <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <div>
            <div className="text-5xl font-light text-white">
              {heartRate !== null ? Math.round(heartRate) : '--'}
            </div>
            <div className="text-sm font-light text-white/50 mt-1">
              BPM
            </div>
          </div>
        </div>

        {timeSinceUpdate && heartRate !== null && (
          <div className="mt-3 text-xs font-light text-white/40">
            Updated {timeSinceUpdate}
          </div>
        )}
      </div>
    </div>
  )
}
