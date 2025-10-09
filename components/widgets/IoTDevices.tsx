'use client'

import { useState, useEffect } from 'react'
import { Device } from '@/lib/iotTypes'

export default function IoTDevices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)

  // Load devices from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('iot_devices')
    if (stored) {
      try {
        setDevices(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading devices:', e)
      }
    }
  }, [])

  const handleAddDevice = () => {
    const name = prompt('Device name (e.g., Main 1, Door Light):')
    const deviceId = prompt('Device ID (from Tuya console):')
    const type = prompt('Device type (light/switch/thermostat):') as any
    
    if (name && deviceId && type) {
      const newDevice: Device = {
        id: deviceId,
        name,
        type,
        online: true,
      }
      
      const updated = [...devices, newDevice]
      setDevices(updated)
      localStorage.setItem('iot_devices', JSON.stringify(updated))
    }
  }

  const handleLoadPreset = async () => {
    try {
      const response = await fetch('/DEVICES.json')
      const presetDevices = await response.json()
      setDevices(presetDevices)
      localStorage.setItem('iot_devices', JSON.stringify(presetDevices))
      alert(`Loaded ${presetDevices.length} devices!`)
    } catch (error) {
      console.error('Error loading preset devices:', error)
      alert('Error loading preset devices. Make sure DEVICES.json exists.')
    }
  }

  const handleRemoveDevice = (id: string) => {
    const updated = devices.filter(d => d.id !== id)
    setDevices(updated)
    localStorage.setItem('iot_devices', JSON.stringify(updated))
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-light text-white/80">Smart Devices</h3>
        <div className="flex gap-2">
          <button
            onClick={handleLoadPreset}
            className="text-xs font-light text-green-400 hover:text-green-300"
          >
            Load Preset
          </button>
          <button
            onClick={handleAddDevice}
            className="text-xs font-light text-blue-400 hover:text-blue-300"
          >
            + Add Device
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-white/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm font-light text-white/50">No devices added yet</p>
          <p className="text-xs font-light text-white/30 mt-1">Add devices to control them with voice</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${device.online ? 'bg-emerald-500' : 'bg-gray-500'}`}></div>
                <div>
                  <p className="text-sm font-light text-white">{device.name}</p>
                  <p className="text-xs font-light text-white/50">{device.type}</p>
                </div>
              </div>
              
              <button
                onClick={() => handleRemoveDevice(device.id)}
                className="text-xs font-light text-red-400/60 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs font-light text-white/40">
          Control devices by saying: "Turn on the living room light" or "Set bedroom light to blue"
        </p>
      </div>
    </div>
  )
}

