'use client'

import { useState, useEffect } from 'react'

export default function Clock() {
  // Initialize with null to prevent hydration mismatch
  const [time, setTime] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setTime(new Date())
    
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted || !time) {
    return (
      <div className="space-y-2">
        <div className="text-[140px] font-thin leading-none tracking-tight text-white">
          <span className="text-white/40">--:--</span>
        </div>
        <div className="text-3xl font-light text-white/60">
          Loading...
        </div>
      </div>
    )
  }

  const hours = time.getHours() % 12 || 12
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const seconds = time.getSeconds().toString().padStart(2, '0')
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM'
  
  const date = time.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <div className="space-y-2">
      <div className="text-[140px] font-thin leading-none tracking-tight text-white">
        {hours}:{minutes}
        <span className="text-white/40">:{seconds}</span>
        <span className="text-6xl text-white/60 ml-4">{ampm}</span>
      </div>
      <div className="text-3xl font-light text-white/60">
        {date}
      </div>
    </div>
  )
}

