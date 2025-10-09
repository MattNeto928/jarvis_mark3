/**
 * IoT Device Controller
 * Handles execution of IoT commands from AI responses
 */

import { IoTCommand, LightCommand } from './iotTypes'

export class IoTController {
  /**
   * Execute an IoT command
   */
  static async executeCommand(command: IoTCommand): Promise<{ success: boolean; message: string }> {
    console.log('Executing IoT command:', command)

    try {
      switch (command.type) {
        case 'light':
          return await this.controlLight(command as LightCommand)
        default:
          return { success: false, message: `Unsupported device type: ${command.type}` }
      }
    } catch (error: any) {
      console.error('IoT command execution error:', error)
      return { success: false, message: error.message || 'Command failed' }
    }
  }

  /**
   * Control smart light bulb
   */
  private static async controlLight(command: LightCommand): Promise<{ success: boolean; message: string }> {
    const { deviceId, action, value } = command

    // Convert to Tuya command format
    const commands: any[] = []

    switch (action) {
      case 'power':
        commands.push({
          code: 'switch_led',
          value: value as boolean
        })
        break

      case 'brightness':
        // Tuya brightness is 0-1000
        const brightness = Math.round((value as number) * 10)
        commands.push({
          code: 'bright_value_v2',
          value: Math.max(10, Math.min(1000, brightness))
        })
        break

      case 'color':
        const rgb = value as { r: number; g: number; b: number }
        // Convert RGB to HSV for Tuya
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b)
        commands.push({
          code: 'colour_data_v2',
          value: {
            h: Math.round(hsv.h),
            s: Math.round(hsv.s * 1000),
            v: Math.round(hsv.v * 1000)
          }
        })
        break

      case 'temperature':
        // Kelvin temperature (2700-6500)
        commands.push({
          code: 'temp_value_v2',
          value: Math.max(2700, Math.min(6500, value as number))
        })
        break

      default:
        return { success: false, message: `Unknown action: ${action}` }
    }

    console.log('Sending Tuya commands:', commands)

    // Try local control first, fall back to cloud
    let result: any
    let endpoint = '/api/iot/local'  // Try local first
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, commands })
      })
      
      result = await response.json()
      
      // If local server not available, fall back to cloud
      if (result.error === 'LOCAL_SERVER_OFFLINE') {
        console.log('Local server offline, falling back to cloud API')
        endpoint = '/api/iot/tuya'  // Fall back to cloud
        const cloudResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, commands })
        })
        result = await cloudResponse.json()
      } else if (!response.ok) {
        // Local server returned error, try cloud
        console.log('Local control error, falling back to cloud API')
        endpoint = '/api/iot/tuya'
        const cloudResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, commands })
        })
        result = await cloudResponse.json()
      } else {
        console.log('Using local control (fast & free!)')
      }
    } catch (error) {
      console.log('Local control unavailable, using cloud API')
      endpoint = '/api/iot/tuya'
      const cloudResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, commands })
      })
      result = await cloudResponse.json()
    }

    console.log(`Tuya API response (via ${endpoint}):`, result)

    return {
      success: result.success,
      message: result.message || (result.success ? 'Light controlled successfully' : 'Failed to control light')
    }
  }

  /**
   * Convert RGB to HSV for Tuya color bulbs
   */
  private static rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r = r / 255
    g = g / 255
    b = b / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const diff = max - min

    let h = 0
    const s = max === 0 ? 0 : diff / max
    const v = max

    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6
      } else if (max === g) {
        h = ((b - r) / diff + 2) / 6
      } else {
        h = ((r - g) / diff + 4) / 6
      }
    }

    return {
      h: h * 360,
      s: s,
      v: v
    }
  }
}

