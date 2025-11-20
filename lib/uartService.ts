/**
 * UART Service
 * Handles sending commands over UART serial communication
 * Follows the schema from uart_test scripts
 */

import { UartPacket } from './iotTypes'
import { validateUartPacket, SchemaValidationError } from './ledStripSchema'

export interface UartConfig {
  serialPort: string
  baudRate: number
}

const DEFAULT_CONFIG: UartConfig = {
  serialPort: '/dev/ttyTHS1', // Jetson Orin Nano UART pins 8 & 10
  baudRate: 115200
}

/**
 * Send direct UART packet
 * The LLM generates the complete packet with dst/src/device/payload
 * We just validate and send it
 */
export async function sendDirectUartPacket(
  packet: UartPacket,
  config?: Partial<UartConfig>
): Promise<{ success: boolean; message: string }> {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }

    console.log('📤 Preparing UART Packet')
    console.log('📋 Packet structure:', JSON.stringify(packet, null, 2))

    // VALIDATE packet before sending
    try {
      validateUartPacket(packet)
      console.log('✅ Packet validation passed')
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        console.error('❌ Schema validation failed:', error.message)
        return {
          success: false,
          message: `Invalid packet schema: ${error.message}`
        }
      }
      throw error
    }

    // Create compact JSON string (what will actually be sent over UART)
    const compactJson = JSON.stringify(packet, null, 0)  // No formatting
    console.log('📦 Compact JSON to send:', compactJson)
    console.log('📏 Size:', compactJson.length, 'bytes')

    // Send to API endpoint that will handle UART communication
    const response = await fetch('/api/iot/uart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'led_strip_01',  // For logging/config purposes
        packet,
        config: finalConfig
      })
    })

    const result = await response.json()

    return {
      success: result.success,
      message: result.message || (result.success ? 'UART command sent successfully' : 'Failed to send UART command')
    }
  } catch (error: any) {
    console.error('UART command error:', error)
    return {
      success: false,
      message: error.message || 'Failed to send UART command'
    }
  }
}
