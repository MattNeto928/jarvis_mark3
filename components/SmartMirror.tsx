'use client'

import { useState, useEffect } from 'react'
import Clock from './widgets/Clock'
import Weather from './widgets/Weather'
import Stocks from './widgets/Stocks'
import News from './widgets/News'
import VoiceAssistant from './widgets/VoiceAssistant'
import IoTDevices from './widgets/IoTDevices'

export default function SmartMirror() {
  return (
    <>
      {/* Animated Background */}
      <div className="polygon-bg">
        <div className="gradient-orb gradient-orb-1"></div>
        <div className="gradient-orb gradient-orb-2"></div>
      </div>

      {/* Main Smart Mirror Layout */}
      <main className="relative z-10 min-h-screen w-full overflow-y-auto p-8">
        {/* 9:16 Portrait Container */}
        <div className="max-w-[1080px] mx-auto space-y-8">
          
          {/* Top Section - Clock */}
          <div className="text-center">
            <Clock />
          </div>

          {/* Middle Section - Information Grid */}
          <div className="grid grid-cols-1 gap-6">
            {/* Weather */}
            <Weather />
            
            {/* Stocks */}
            <Stocks />
            
            {/* News */}
            <News />
            
            {/* IoT Devices */}
            <IoTDevices />
          </div>

          {/* Bottom Section - Voice Assistant (Minimal) */}
          <div className="mt-8">
            <VoiceAssistant />
          </div>
        </div>
      </main>
    </>
  )
}

