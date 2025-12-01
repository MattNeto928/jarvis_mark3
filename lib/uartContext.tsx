'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { UartStreamClient, UartStreamPacket } from './uartStreamClient'

type UartContextType = {
  lastPacket: UartStreamPacket | null
  isDimmed: boolean
  setPresenceOn: () => void
}

const UartContext = createContext<UartContextType>({ lastPacket: null, isDimmed: false, setPresenceOn: () => {} })

export function UartProvider({ children }: { children: ReactNode }) {
  const [lastPacket, setLastPacket] = useState<UartStreamPacket | null>(null)
  const [isDimmed, setIsDimmed] = useState(false)
  const uartClientRef = useRef<UartStreamClient | null>(null)

  const setPresenceOn = () => {
    setIsDimmed(false)
    fetch('/api/iot/uart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'led_strip_01',
        packet: {
          dst: 'node_01',
          src: 'jetson',
          device: 'led',
          payload: {
            state: 'on',
            mode: 'fade',
            color: { r: 255, g: 255, b: 255 },
            color2: { r: 0, g: 0, b: 0 },
            brightness: 1.0,
            transition_ms: 3000,
            duration_ms: 0,
            effect: { speed: 0.0, direction: 'cw' }
          }
        }
      })
    }).catch(console.error)
  }

  useEffect(() => {
    uartClientRef.current = new UartStreamClient()
    uartClientRef.current.connect((packet) => {
      setLastPacket(packet)

      // Check for presence events
      if (packet.type === 'complete_packet' && packet.data) {
        const data = packet.data as any

        if (data.event === 'EXIT') {
          console.log('🚪 EXIT event - fading out screen and LEDs')
          setIsDimmed(true)
          // Send LED command via UART - fade to off
          fetch('/api/iot/uart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: 'led_strip_01',
              packet: {
                dst: 'node_01',
                src: 'jetson',
                device: 'led',
                payload: {
                  state: 'off',
                  mode: 'fade',
                  color: { r: 255, g: 255, b: 255 },
                  color2: { r: 0, g: 0, b: 0 },
                  brightness: 0.0,
                  transition_ms: 3000,
                  duration_ms: 0,
                  effect: { speed: 0.0, direction: 'cw' }
                }
              }
            })
          }).catch(console.error)
        } else if (data.event === 'ENTER') {
          console.log('🚪 ENTER event - fading in screen and LEDs')
          setIsDimmed(false)
          // Send LED command via UART - fade to on
          fetch('/api/iot/uart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: 'led_strip_01',
              packet: {
                dst: 'node_01',
                src: 'jetson',
                device: 'led',
                payload: {
                  state: 'on',
                  mode: 'fade',
                  color: { r: 255, g: 255, b: 255 },
                  color2: { r: 0, g: 0, b: 0 },
                  brightness: 1.0,
                  transition_ms: 3000,
                  duration_ms: 0,
                  effect: { speed: 0.0, direction: 'cw' }
                }
              }
            })
          }).catch(console.error)
        }
      }
    })

    return () => {
      uartClientRef.current?.disconnect()
    }
  }, [])

  return (
    <UartContext.Provider value={{ lastPacket, isDimmed, setPresenceOn }}>
      {children}
    </UartContext.Provider>
  )
}

export const useUart = () => useContext(UartContext)
