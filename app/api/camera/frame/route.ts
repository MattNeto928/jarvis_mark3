import { NextResponse } from 'next/server'

// Proxy endpoint to fetch a frame from the ESP32-CAM MJPEG stream
// This bypasses CORS issues since the request comes from the server

const CAMERA_STREAM_URL = process.env.CAMERA_STREAM_URL || 'http://172.20.10.2/videoStream'

export async function GET() {
  try {
    // Fetch from the MJPEG stream
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(CAMERA_STREAM_URL, {
      signal: controller.signal,
      cache: 'no-store',
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `Camera returned ${response.status}` },
        { status: response.statusCode }
      )
    }

    // Read the stream to get a single JPEG frame
    // MJPEG streams send frames as: --boundary\r\nContent-Type: image/jpeg\r\n\r\n<jpeg data>
    const reader = response.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 })
    }

    const chunks: Uint8Array[] = []
    let foundJpegStart = false
    let foundJpegEnd = false
    
    // JPEG markers
    const JPEG_START = [0xFF, 0xD8]
    const JPEG_END = [0xFF, 0xD9]

    while (!foundJpegEnd) {
      const { done, value } = await reader.read()
      if (done) break
      
      if (!value) continue
      
      for (let i = 0; i < value.length; i++) {
        if (!foundJpegStart) {
          // Look for JPEG start marker (FFD8)
          if (value[i] === JPEG_START[0] && i + 1 < value.length && value[i + 1] === JPEG_START[1]) {
            foundJpegStart = true
            chunks.push(value.slice(i))
            break
          }
        } else {
          // Look for JPEG end marker (FFD9)
          if (value[i] === JPEG_END[0] && i + 1 < value.length && value[i + 1] === JPEG_END[1]) {
            chunks.push(value.slice(0, i + 2))
            foundJpegEnd = true
            break
          }
        }
      }
      
      if (foundJpegStart && !foundJpegEnd) {
        chunks.push(value)
      }
    }

    reader.cancel()

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No JPEG frame found' }, { status: 500 })
    }

    // Combine chunks into single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const jpegData = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      jpegData.set(chunk, offset)
      offset += chunk.length
    }

    return new NextResponse(jpegData, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('Camera frame error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
