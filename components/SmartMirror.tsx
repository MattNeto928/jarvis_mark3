'use client'

import { useState, useEffect } from 'react'
import Clock from './widgets/Clock'
import Weather from './widgets/Weather'
import Stocks from './widgets/Stocks'
import News from './widgets/News'
import VoiceAssistant from './widgets/VoiceAssistant'
import IoTDevices from './widgets/IoTDevices'
import HeartRate from './widgets/HeartRate'
import { UartProvider, useUart } from '@/lib/uartContext'
import { SmartMirrorProvider } from '@/lib/smartMirrorContext'

function SmartMirrorContent() {
  const { isDimmed, setPresenceOn } = useUart()

  return (
    <>
      {/* Fade overlay - smoothly transitions opacity */}
      <div 
        className={`fixed inset-0 bg-black z-50 pointer-events-none transition-opacity duration-[3000ms] ${
          isDimmed ? 'opacity-90' : 'opacity-0'
        }`} 
      />

      {/* Animated Background */}
      <div className="polygon-bg">
        <div className="gradient-orb gradient-orb-1"></div>
        <div className="gradient-orb gradient-orb-2"></div>
      </div>

      {/* Main Smart Mirror Layout */}
      <main 
        className="relative z-10 h-screen w-full overflow-hidden flex flex-col p-4"
        onClick={setPresenceOn}
      >
        {/* 9:16 Portrait Container */}
        <div className="max-w-[1080px] mx-auto w-full h-full flex flex-col">
          
          {/* Header - Voice Status and Heart Rate */}
          <div className="flex-shrink-0 flex items-start justify-between mb-4">
            <VoiceAssistant />
            <HeartRate />
          </div>

          {/* Weather */}
          <div className="flex-shrink-0">
            <Weather />
          </div>

          {/* Clock */}
          <div className="text-center flex-shrink-0 mt-4">
            <Clock />
          </div>

          {/* Mirror Space */}
          <div className="flex-1"></div>

          {/* Bottom Widgets */}
          <div className="flex-shrink-0 space-y-3">
            {/* Stocks */}
            <Stocks />
            
            {/* News */}
            <News />
            
            {/* IoT Devices */}
            <IoTDevices />
          </div>
        </div>
      </main>
    </>
  )
}

export default function SmartMirror() {
  return (
    <UartProvider>
      <SmartMirrorProvider>
        <SmartMirrorContent />
      </SmartMirrorProvider>
    </UartProvider>
  )
}

