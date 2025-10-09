/**
 * IoT Device Types and Command Structure
 * Standardized JSON format for controlling smart home devices
 */

export type DeviceType = 'light' | 'thermostat' | 'lock' | 'camera' | 'switch' | 'sensor'

export type LightCommand = {
  type: 'light'
  deviceId: string
  action: 'power' | 'brightness' | 'color' | 'temperature'
  value: boolean | number | { r: number; g: number; b: number } | number
}

export type GenericDeviceCommand = {
  type: DeviceType
  deviceId: string
  action: string
  value: any
}

export type IoTCommand = LightCommand | GenericDeviceCommand

export type Device = {
  id: string
  name: string
  type: DeviceType
  online: boolean
  state?: any
  room?: string
}

export type IoTCommandResponse = {
  command: IoTCommand
  success: boolean
  message?: string
}

/**
 * Parse AI response for IoT commands
 * The AI may return single or multiple JSON commands
 */
export function parseIoTCommand(text: string): IoTCommand | null {
  try {
    // Look for JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    
    // Validate it's an IoT command
    if (parsed.type && parsed.deviceId && parsed.action) {
      return parsed as IoTCommand
    }
    
    return null
  } catch (error) {
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
    // Match all JSON objects in the response
    const jsonMatches = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
    if (!jsonMatches) return commands

    for (const jsonStr of jsonMatches) {
      try {
        const parsed = JSON.parse(jsonStr)
        
        // Validate it's an IoT command
        if (parsed.type && parsed.deviceId && parsed.action) {
          commands.push(parsed as IoTCommand)
        }
      } catch (e) {
        // Skip invalid JSON
        continue
      }
    }
    
    return commands
  } catch (error) {
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

