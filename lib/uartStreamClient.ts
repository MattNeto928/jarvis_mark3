/**
 * UART Stream Client
 * Connects to SSE endpoint to receive incoming UART packets
 */

export type UartStreamPacket = {
  timestamp: string
  data: unknown
  type: 'complete_packet' | 'raw_hex' | 'connected' | 'error'
  message?: string
}

export type UartStreamCallback = (packet: UartStreamPacket) => void

export class UartStreamClient {
  private eventSource: EventSource | null = null
  private onPacket: UartStreamCallback | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000

  /**
   * Connect to UART stream
   */
  connect(onPacket: UartStreamCallback) {
    this.onPacket = onPacket

    console.log('📡 Connecting to UART stream...')

    try {
      this.eventSource = new EventSource('/api/iot/uart/stream')

      this.eventSource.onopen = () => {
        console.log('✅ UART stream connected')
        this.reconnectAttempts = 0
      }

      this.eventSource.onmessage = (event) => {
        try {
          const packet: UartStreamPacket = JSON.parse(event.data)

          // Log to console
          if (packet.type === 'complete_packet') {
            // Only log presence events and BPM summaries to reduce console spam
            const data = packet.data as any
            if (data.event || data.packet_type === 'bpm_summary') {
              console.log('📨 UART RX:', packet.data)
            }
          } else if (packet.type === 'raw_hex') {
            console.log('📨 UART RX (hex):', packet.data)
          } else if (packet.type === 'connected') {
            console.log('🔗', packet.message)
          } else if (packet.type === 'error') {
            console.error('❌ UART stream error:', packet.message)
          }

          // Call user callback
          if (this.onPacket) {
            this.onPacket(packet)
          }
        } catch (error) {
          console.error('❌ Failed to parse UART packet:', error)
        }
      }

      this.eventSource.onerror = (error) => {
        console.error('❌ UART stream error:', error)

        // Close and attempt reconnect
        this.eventSource?.close()
        this.eventSource = null

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
          console.log(`🔄 Reconnecting to UART stream in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

          setTimeout(() => {
            if (this.onPacket) {
              this.connect(this.onPacket)
            }
          }, delay)
        } else {
          console.error('❌ Max reconnection attempts reached for UART stream')
        }
      }
    } catch (error) {
      console.error('❌ Failed to connect to UART stream:', error)
    }
  }

  /**
   * Disconnect from UART stream
   */
  disconnect() {
    console.log('📴 Disconnecting from UART stream')

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.onPacket = null
    this.reconnectAttempts = 0
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN
  }
}
