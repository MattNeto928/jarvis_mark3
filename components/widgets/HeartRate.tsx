'use client'

import { useState, useEffect, useRef } from 'react'
import { useUart } from '@/lib/uartContext'

type BPMSummaryData = {
  avg_bpm: number
  inst_bpm: number
  finger: boolean
  beat_event: boolean
  timestamp_ms: number
}

type RawIRData = {
  ir_value: number
  finger: boolean
  timestamp_ms: number
}

export default function HeartRate() {
  const [heartRate, setHeartRate] = useState<number | null>(null)
  const [fingerDetected, setFingerDetected] = useState<boolean>(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [irValues, setIrValues] = useState<number[]>([])
  const [lastIrUpdate, setLastIrUpdate] = useState<Date | null>(null)
  const [showGraph, setShowGraph] = useState<boolean>(false)
  const { lastPacket } = useUart()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const interpolatedValuesRef = useRef<number[]>([])
  const particlesRef = useRef<Array<{x: number, y: number, vx: number, vy: number, life: number}>>([])
  const lastHeadPosRef = useRef<{x: number, y: number} | null>(null)

  useEffect(() => {
    if (lastPacket?.type === 'complete_packet' && lastPacket.data) {
      const data = lastPacket.data as any

      // Handle new packet format with nested payload
      const actualData = data.payload || data

      // Check packet type (new format uses packet_type field)
      const packetType = data.packet_type || ''

      if (packetType === 'bpm_summary' || 'avg_bpm' in actualData) {
        const hrData = actualData as BPMSummaryData
        console.log('BPM packet:', hrData)
        setHeartRate(hrData.avg_bpm)
        setFingerDetected(hrData.finger)
        setLastUpdate(new Date())
      } else if (packetType === 'raw_ir' || 'ir_value' in actualData) {
        const irData = actualData as RawIRData
        console.log('IR packet:', irData.ir_value)
        setIrValues(prev => [...prev.slice(-199), irData.ir_value])
        setLastIrUpdate(new Date())
        if (!showGraph) setShowGraph(true)
      }
    }
  }, [lastPacket])

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate.getTime() > 5000) {
        setHeartRate(null)
        setFingerDetected(false)
        setShowGraph(false)
        setTimeout(() => setIrValues([]), 500)
      }
      if (lastIrUpdate && Date.now() - lastIrUpdate.getTime() > 5000) {
        setShowGraph(false)
        setTimeout(() => setIrValues([]), 500)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lastUpdate, lastIrUpdate])

  useEffect(() => {
    if (irValues.length < 2) {
      interpolatedValuesRef.current = irValues
      return
    }

    const interpolate = () => {
      const result: number[] = []
      for (let i = 0; i < irValues.length - 1; i++) {
        result.push(irValues[i])
        const diff = irValues[i + 1] - irValues[i]
        for (let j = 1; j < 4; j++) {
          result.push(irValues[i] + (diff * j) / 4)
        }
      }
      result.push(irValues[irValues.length - 1])
      interpolatedValuesRef.current = result
    }

    interpolate()
  }, [irValues])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      const values = interpolatedValuesRef.current
      if (values.length === 0) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const width = canvas.width
      const height = canvas.height
      const padding = 30
      const drawWidth = width - padding * 2
      const drawHeight = height - padding * 2
      
      ctx.clearRect(0, 0, width, height)

      const min = Math.min(...values)
      const max = Math.max(...values)
      const range = max - min || 1

      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 1; i < values.length; i++) {
        const progress = i / values.length
        const opacity = Math.pow(progress, 0.5) * 0.9
        
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
        ctx.beginPath()
        
        const x1 = padding + ((i - 1) / values.length) * drawWidth
        const y1 = padding + drawHeight - ((values[i - 1] - min) / range) * drawHeight
        const x2 = padding + (i / values.length) * drawWidth
        const y2 = padding + drawHeight - ((values[i] - min) / range) * drawHeight
        
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      const headX = padding + drawWidth
      const headY = padding + drawHeight - ((values[values.length - 1] - min) / range) * drawHeight

      if (lastHeadPosRef.current && Math.random() > 0.7) {
        particlesRef.current.push({
          x: headX,
          y: headY,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 1
        })
      }
      lastHeadPosRef.current = {x: headX, y: headY}

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.02
        
        if (p.life > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.6})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
          ctx.fill()
          return true
        }
        return false
      })

      ctx.shadowBlur = 20
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.beginPath()
      ctx.arc(headX, headY, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  const hasValue = heartRate !== null && heartRate > 0

  return (
    <>
      <div className="flex items-center gap-2">
        <svg 
          className={`w-7 h-7 transition-all duration-700 ${
            hasValue 
              ? 'text-red-500 saturate-100' 
              : 'text-gray-500 saturate-0'
          }`} 
          fill="currentColor" 
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <div className={`text-2xl font-light transition-opacity duration-700 ${
          hasValue ? 'text-white opacity-100' : 'text-white/30 opacity-50'
        }`}>
          {hasValue ? Math.round(heartRate) : '--'}
        </div>
      </div>
      <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 transition-opacity duration-500 overflow-visible ${
        showGraph ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <canvas 
          ref={canvasRef}
          width={850}
          height={250}
          style={{marginLeft: '-25px', marginTop: '-25px'}}
        />
      </div>
    </>
  )
}
