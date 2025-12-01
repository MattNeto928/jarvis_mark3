'use client'

import { useState, useEffect, useRef } from 'react'

interface VideoFeedProps {
  streamUrl?: string
  className?: string
}

export default function VideoFeed({
  streamUrl = 'http://172.20.10.2/videoStream',
  className = ''
}: VideoFeedProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const imgRef = useRef<HTMLImageElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // For MJPEG streams, onLoad may not fire reliably
    // Use a timeout to hide loading state, and check if image has dimensions
    timeoutRef.current = setTimeout(() => {
      if (imgRef.current && imgRef.current.naturalWidth > 0) {
        setIsLoading(false)
      }
    }, 2000)

    // Also poll for image dimensions as a fallback
    const checkInterval = setInterval(() => {
      if (imgRef.current && imgRef.current.naturalWidth > 0) {
        setIsLoading(false)
        clearInterval(checkInterval)
      }
    }, 500)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      clearInterval(checkInterval)
    }
  }, [streamUrl])

  const handleRetry = () => {
    setHasError(false)
    setIsLoading(true)
  }

  if (hasError) {
    return (
      <div className={`bg-black/30 backdrop-blur-sm rounded-xl p-4 flex items-center justify-center ${className}`}>
        <div className="text-white/50 text-sm text-center">
          <p>Video feed unavailable</p>
          <button
            onClick={handleRetry}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-black/30 backdrop-blur-sm rounded-xl overflow-hidden ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
          <div className="text-white/70 text-sm">📹 Connecting to stream...</div>
        </div>
      )}

      <div className="w-full h-full scale-y-[-1]">
        <img
          ref={imgRef}
          src={streamUrl}
          alt=""
          className="w-full h-full object-cover"
          onLoad={() => setIsLoading(false)}
          onError={() => { setHasError(true); setIsLoading(false) }}
        />
      </div>
    </div>
  )
}
