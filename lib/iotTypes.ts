/**
 * IoT Device Types and Command Structure
 * Standardized JSON format for controlling smart home devices
 */

import { LedStripMode, LedStripPayload, RGBColor, UartPacket } from './ledStripSchema'

export type TransportType = 'network' | 'uart' | 'spi' | 'i2c'
export type DeviceType = 'light' | 'led_strip' | 'thermostat' | 'lock' | 'camera' | 'switch' | 'sensor'

// Re-export LED strip types from strict schema
export type { LedStripMode, RGBColor, UartPacket }

// Tuya Light Command (network transport)
export type LightCommand = {
  type: 'light'
  transport: 'network'
  deviceId: string
  action: 'power' | 'brightness' | 'color' | 'temperature'
  value: boolean | number | { r: number; g: number; b: number } | number
}

// Direct UART Packet (for LED strips and other UART devices)
// This is what the LLM should generate directly
export type DirectUartPacket = UartPacket & {
  _commandType: 'uart_packet'  // Discriminator for type checking
}

export type GenericDeviceCommand = {
  type: DeviceType
  transport: TransportType
  deviceId: string
  action: string
  value: any
}

// Union type: either a Tuya light command OR a direct UART packet
export type IoTCommand = LightCommand | UartPacket | GenericDeviceCommand

export type Device = {
  id: string
  name: string
  type: DeviceType
  transport: TransportType
  online: boolean
  state?: any
  room?: string
  // Transport-specific configuration
  config?: {
    // UART config
    serialPort?: string
    baudRate?: number
    targetNodeId?: string
    // Network config (for Tuya)
    // SPI/I2C config can be added here
  }
}

export type IoTCommandResponse = {
  command: IoTCommand
  success: boolean
  message?: string
}

/**
 * Parse AI response for IoT commands
 * The AI may return either:
 * 1. Direct UART packet: {"dst":"node_01","src":"jetson","device":"led","payload":{...}}
 * 2. Tuya light command: {"type":"light","transport":"network","deviceId":"...","action":"...","value":...}
 *
 * Handles markdown code blocks and extracts clean JSON
 */
export function parseIoTCommand(text: string): IoTCommand | null {
  try {
    let jsonText = text

    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')

    // Extract first JSON object using balanced brace matching
    let depth = 0
    let start = -1
    let jsonStr = ''

    for (let i = 0; i < jsonText.length; i++) {
      if (jsonText[i] === '{') {
        if (depth === 0) start = i
        depth++
      } else if (jsonText[i] === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          jsonStr = jsonText.substring(start, i + 1)
          break
        }
      }
    }

    if (!jsonStr) return null

    // Parse and re-serialize to ensure clean, compact JSON
    const parsed = JSON.parse(jsonStr)

    // Check if it's a UART packet (has dst/src/device/payload)
    if (parsed.dst && parsed.src && parsed.device && parsed.payload) {
      // Re-serialize in compact format (no whitespace)
      const compactJson = JSON.parse(JSON.stringify(parsed))
      console.log('📋 Parsed UART packet:', JSON.stringify(compactJson, null, 2))
      return compactJson as UartPacket
    }

    // Check if it's a Tuya command (has type/transport/deviceId/action)
    if (parsed.type && parsed.deviceId && parsed.action && parsed.transport) {
      console.log('📋 Parsed Tuya command:', JSON.stringify(parsed, null, 2))
      return parsed as IoTCommand
    }

    return null
  } catch (error) {
    console.error('❌ Failed to parse IoT command:', error)
    return null
  }
}

/**
 * Parse multiple IoT commands from AI response
 * For commands like "turn on all lights" which generate multiple JSON objects
 */
export function parseMultipleIoTCommands(text: string): IoTCommand[] {
  const commands: IoTCommand[] = []

  try {
    let jsonText = text

    // Remove markdown code blocks
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')

    // Extract JSON objects using a more robust approach
    // This handles deeply nested objects by matching balanced braces
    const extractJsonObjects = (str: string): string[] => {
      const results: string[] = []
      let depth = 0
      let start = -1

      for (let i = 0; i < str.length; i++) {
        if (str[i] === '{') {
          if (depth === 0) start = i
          depth++
        } else if (str[i] === '}') {
          depth--
          if (depth === 0 && start !== -1) {
            results.push(str.substring(start, i + 1))
            start = -1
          }
        }
      }

      return results
    }

    const jsonMatches = extractJsonObjects(jsonText)
    if (jsonMatches.length === 0) {
      console.log('⚠️ No JSON objects found in response')
      return commands
    }

    console.log(`🔍 Found ${jsonMatches.length} potential JSON object(s)`)

    for (const jsonStr of jsonMatches) {
      try {
        const parsed = JSON.parse(jsonStr)

        // Check if it's a UART packet
        if (parsed.dst && parsed.src && parsed.device && parsed.payload) {
          // Re-serialize in compact format
          const compactJson = JSON.parse(JSON.stringify(parsed))
          console.log('📋 Parsed UART packet (multi):', JSON.stringify(compactJson, null, 2))
          commands.push(compactJson as UartPacket)
        }
        // Check if it's a Tuya command
        else if (parsed.type && parsed.deviceId && parsed.action && parsed.transport) {
          console.log('📋 Parsed Tuya command (multi):', JSON.stringify(parsed, null, 2))
          commands.push(parsed as IoTCommand)
        } else {
          console.log('⚠️ JSON object does not match expected command format:', Object.keys(parsed))
        }
      } catch (e) {
        console.error('❌ Failed to parse JSON object:', e)
        continue
      }
    }

    return commands
  } catch (e) {
    console.error('❌ Error in parseMultipleIoTCommands:', e)
    return commands
  }
}

/**
 * Convert natural language to device-friendly values
 */
export function normalizeColorName(color: string): { r: number; g: number; b: number } | null {
  const colors: { [key: string]: { r: number; g: number; b: number } } = {
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    white: { r: 255, g: 255, b: 255 },
    warm: { r: 255, g: 200, b: 100 },
    cool: { r: 200, g: 230, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    orange: { r: 255, g: 165, b: 0 },
    purple: { r: 128, g: 0, b: 128 },
    pink: { r: 255, g: 192, b: 203 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
  }
  
  return colors[color.toLowerCase()] || null
}

