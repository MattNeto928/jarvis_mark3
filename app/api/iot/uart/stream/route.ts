/**
 * UART Stream API - Server-Sent Events (SSE)
 * Provides a real-time stream of incoming UART data to the frontend
 */

import { NextRequest } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

const UART_LISTENER_SCRIPT = path.join(process.cwd(), 'scripts', 'uart_listener.py')
const DEVICES_JSON_PATH = path.join(process.cwd(), 'DEVICES.json')

// Global listener process (one per server instance)
let listenerProcess: ChildProcess | null = null
const streamClients: Set<ReadableStreamDefaultController> = new Set()
let uartBuffer = '' // Buffer for reassembling fragmented UART data

/**
 * Load UART config from DEVICES.json
 */
function loadUartConfig(): { serialPort: string; baudRate: number } {
  try {
    if (fs.existsSync(DEVICES_JSON_PATH)) {
      const devicesJson = fs.readFileSync(DEVICES_JSON_PATH, 'utf-8')
      const devices = JSON.parse(devicesJson)
      const ledStrip = devices.find((d: { id: string }) => d.id === 'led_strip_01')
      if (ledStrip?.config) {
        return {
          serialPort: ledStrip.config.serialPort || '/dev/ttyTHS1',
          baudRate: ledStrip.config.baudRate || 115200
        }
      }
    }
  } catch (error) {
    console.error('Error loading UART config:', error)
  }
  return { serialPort: '/dev/ttyTHS1', baudRate: 115200 }
}

/**
 * Start the UART listener process
 */
function startListenerProcess() {
  if (listenerProcess) {
    console.log('📡 UART listener already running')
    return
  }

  const config = loadUartConfig()
  console.log('🚀 Starting UART listener process...')
  console.log('   Serial Port:', config.serialPort)
  console.log('   Baud Rate:', config.baudRate)

  listenerProcess = spawn('python3', [
    '-u',  // CRITICAL: Unbuffered output so we get data immediately
    UART_LISTENER_SCRIPT,
    config.serialPort,
    config.baudRate.toString()
  ])

  listenerProcess.stdout?.setEncoding('utf-8')
  listenerProcess.stderr?.setEncoding('utf-8')

  // Handle stdout (received UART packets)
  listenerProcess.stdout?.on('data', (data: string) => {
    const lines = data.trim().split('\n')

    for (const line of lines) {
      if (!line) continue

      try {
        const chunk = JSON.parse(line)

        if (chunk.type === 'uart_chunk') {
          // Append chunk to buffer
          uartBuffer += chunk.data

          // Try to extract complete JSON objects from buffer
          processUartBuffer()
        } else if (chunk.type === 'uart_raw_hex') {
          // Broadcast raw hex data immediately
          const packet = {
            timestamp: chunk.timestamp,
            data: chunk.data,
            type: 'raw_hex'
          }
          console.log('📨 UART RX (hex):', chunk.data.substring(0, 50))
          broadcastToClients(packet)
        }
      } catch (e) {
        console.error('❌ Failed to parse listener output:', line)
      }
    }
  })

  /**
   * Process UART buffer and extract complete JSON packets
   */
  function processUartBuffer() {
    // Try to find complete JSON objects in the buffer
    let depth = 0
    let start = -1

    for (let i = 0; i < uartBuffer.length; i++) {
      if (uartBuffer[i] === '{') {
        if (depth === 0) start = i
        depth++
      } else if (uartBuffer[i] === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          // Found a complete JSON object
          const jsonStr = uartBuffer.substring(start, i + 1)

          try {
            const data = JSON.parse(jsonStr)

            const packet = {
              timestamp: new Date().toISOString(),
              data: data,
              type: 'complete_packet'
            }

            console.log('📨 UART RX:', JSON.stringify(data).substring(0, 100))
            broadcastToClients(packet)

            // Remove the processed part from buffer
            uartBuffer = uartBuffer.substring(i + 1)
            i = -1 // Restart search
            start = -1
          } catch (e) {
            // Not valid JSON, keep in buffer
            start = -1
          }
        }
      }
    }

    // Keep buffer under control - if it gets too large without finding JSON, clear old data
    if (uartBuffer.length > 10000) {
      console.warn('⚠️ UART buffer overflow, clearing old data')
      // Keep only the last 1000 characters
      uartBuffer = uartBuffer.substring(uartBuffer.length - 1000)
    }
  }

  // Handle stderr (debug logs)
  listenerProcess.stderr?.on('data', (data: string) => {
    console.log('🔊 UART Listener:', data.trim())
  })

  // Handle process exit
  listenerProcess.on('close', (code) => {
    console.log(`🛑 UART listener process exited with code ${code}`)
    listenerProcess = null

    // Notify all clients that the stream ended
    const encoder = new TextEncoder()
    const errorMessage = encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'UART listener stopped' })}\n\n`)
    
    for (const controller of streamClients) {
      try {
        controller.enqueue(errorMessage)
        controller.close()
      } catch (e) {
        // Client already disconnected
      }
    }
    streamClients.clear()
  })

  listenerProcess.on('error', (error) => {
    console.error('❌ UART listener process error:', error)
    listenerProcess = null
  })
}

/**
 * Broadcast packet to all connected SSE clients
 */
function broadcastToClients(packet: unknown) {
  console.log(`🔊 Broadcasting to ${streamClients.size} clients:`, JSON.stringify(packet).substring(0, 100))
  const message = `data: ${JSON.stringify(packet)}\n\n`
  const encoder = new TextEncoder()
  const encoded = encoder.encode(message)

  for (const controller of streamClients) {
    try {
      controller.enqueue(encoded)
      console.log('✅ Enqueued to client')
    } catch (e) {
      console.error('❌ Failed to enqueue:', e)
      streamClients.delete(controller)
    }
  }
}

/**
 * SSE endpoint - streams UART data to clients
 */
export async function GET(request: NextRequest) {
  console.log('📡 SSE client connecting to UART stream...')

  // Start listener if not already running
  if (!listenerProcess) {
    startListenerProcess()
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Add this client to the broadcast list
      streamClients.add(controller)
      console.log(`✅ SSE client connected (${streamClients.size} total clients)`)

      // Send initial connection message
      const welcomeMessage = `data: ${JSON.stringify({
        type: 'connected',
        message: 'UART stream connected',
        timestamp: new Date().toISOString()
      })}\n\n`
      controller.enqueue(encoder.encode(welcomeMessage))

      // Keep-alive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`))
        } catch (e) {
          clearInterval(keepAliveInterval)
        }
      }, 30000)

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        console.log('📴 SSE client disconnected')
        streamClients.delete(controller)
        clearInterval(keepAliveInterval)

        // If no more clients, we could optionally stop the listener
        // For now, keep it running to avoid missing data
        console.log(`📊 Remaining clients: ${streamClients.size}`)
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
