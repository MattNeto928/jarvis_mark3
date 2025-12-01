'use client'

import { useState, useEffect } from 'react'
import { Device } from '@/lib/iotTypes'

export default function IoTDevices() {
  const [devices, setDevices] = useState<Device[]>([])

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const response = await fetch('/DEVICES.json')
        const presetDevices = await response.json()
        setDevices(presetDevices)
        localStorage.setItem('iot_devices', JSON.stringify(presetDevices))
      } catch (error) {
        console.error('Error loading devices:', error)
      }
    }
    loadDevices()
  }, [])

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-lg font-light text-white/80 mb-4">Smart Devices</h3>
      <div className="space-y-2">
        {devices.map((device) => (
          <div key={device.id} className="flex items-center justify-between">
            <span className="text-sm font-light text-white/70">{device.name}</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-all duration-700 ${
                device.online ? 'bg-emerald-500 saturate-100' : 'bg-gray-500 saturate-0'
              }`}></div>
              <span className={`text-xs font-light transition-all duration-700 ${
                device.online ? 'text-emerald-400 saturate-100' : 'text-gray-500 saturate-0'
              }`}>
                {device.online ? 'online' : 'offline'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
