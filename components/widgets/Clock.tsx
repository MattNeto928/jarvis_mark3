'use client'

import { useState, useEffect } from 'react'

export default function Clock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const hours = time.getHours().toString().padStart(2, '0')
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const seconds = time.getSeconds().toString().padStart(2, '0')
  
  const date = time.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <div className="space-y-2">
      <div className="text-[120px] font-thin leading-none tracking-tight text-white">
        {hours}:{minutes}
        <span className="text-white/40">:{seconds}</span>
      </div>
      <div className="text-2xl font-light text-white/60">
        {date}
      </div>
    </div>
  )
}

