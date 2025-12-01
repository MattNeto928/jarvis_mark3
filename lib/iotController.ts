/**
 * IoT Device Controller
 * Handles execution of IoT commands from AI responses
 * Routes commands to appropriate transport layer (network, UART, SPI, I2C)
 */

import { IoTCommand, LightCommand, UartPacket } from './iotTypes'
import { sendDirectUartPacket } from './uartService'

export class IoTController {
  private static lightState = false // Track light state for toggling

  /**
   * Toggle all Tuya lights (quick command for wake word)
   */
  static async toggleLights(): Promise<{ success: boolean; message: string }> {
    // Toggle state
    this.lightState = !this.lightState
    
    console.log('💡 Toggling lights to:', this.lightState ? 'ON' : 'OFF')
    
    // Toggle all three lights
    const commands = [
      { type: 'light' as const, transport: 'network' as const, deviceId: 'eb506e78c700b185a2ppjq', action: 'power' as const, value: this.lightState },
      { type: 'light' as const, transport: 'network' as const, deviceId: 'ebf9a11b3323926dac7jmt', action: 'power' as const, value: this.lightState },
      { type: 'light' as const, transport: 'network' as const, deviceId: 'eb46a372812df2161b6ws2', action: 'power' as const, value: this.lightState }
    ]
    
    const results = await Promise.all(commands.map(cmd => this.executeCommand(cmd)))
    const allSuccess = results.every(r => r.success)
    
    return {
      success: allSuccess,
      message: allSuccess ? `Lights ${this.lightState ? 'on' : 'off'}` : 'Some lights failed to toggle'
    }
  }

  /**
   * Execute an IoT command
   * Handles both direct UART packets and Tuya light commands
   */
  static async executeCommand(command: IoTCommand): Promise<{ success: boolean; message: string }> {
    console.log('Executing IoT command:', command)

    try {
      // Check if it's a direct UART packet (has dst/src/device/payload)
      if ('dst' in command && 'src' in command && 'device' in command && 'payload' in command) {
        return await this.handleUartPacket(command as UartPacket)
      }

      // Otherwise, it's a structured command with transport/type/etc
      if (!('transport' in command)) {
        return { success: false, message: 'Invalid command format: missing transport field' }
      }

      // Route based on transport type
      switch (command.transport) {
        case 'network':
          // Network transport (Tuya lights)
          if (command.type === 'light') {
            return await this.controlLight(command as LightCommand)
          }
          return { success: false, message: `Unsupported device type for network transport: ${command.type}` }

        case 'uart':
          return { success: false, message: 'UART commands should use direct packet format with dst/src/device/payload' }

        case 'spi':
        case 'i2c':
          // Future: SPI and I2C transports
          return { success: false, message: `Transport type ${command.transport} not yet implemented` }

        default:
          return { success: false, message: `Unknown transport type: ${(command as any).transport}` }
      }
    } catch (error: any) {
      console.error('IoT command execution error:', error)
      return { success: false, message: error.message || 'Command failed' }
    }
  }

  /**
   * Handle direct UART packet
   */
  private static async handleUartPacket(packet: UartPacket): Promise<{ success: boolean; message: string }> {
    console.log('Handling direct UART packet:', packet)
    return await sendDirectUartPacket(packet)
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
    let endpoint = '/api/iot/tuya'  // Default to cloud for now (local has issues)
    
    try {
      /*
      // Local control disabled for now due to reliability issues
      endpoint = '/api/iot/local'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, commands })
      })
      
      result = await response.json()
      
      // If local server not available, fall back to cloud
      if (result.error === 'LOCAL_SERVER_OFFLINE' || !response.ok) {
        // console.log('Local control issue, falling back to cloud API')
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
      */
      
      // Cloud-only path
      endpoint = '/api/iot/tuya'
      const cloudResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, commands })
      })
      result = await cloudResponse.json()

    } catch (error) {
      console.error('IoT control failed:', error)
      // Last ditch attempt with cloud if not already tried
      if (endpoint !== '/api/iot/tuya') {
        try {
          endpoint = '/api/iot/tuya'
          const cloudResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, commands })
          })
          result = await cloudResponse.json()
        } catch (e) {
          return { success: false, message: 'Failed to control device (both local and cloud)' }
        }
      } else {
        return { success: false, message: 'Failed to control device' }
      }
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

