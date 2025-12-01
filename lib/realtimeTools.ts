/**
 * IoT Tools for OpenAI Realtime Agent SDK
 * Properly typed function tools for controlling smart home devices
 */

import { tool } from '@openai/agents/realtime'
import { z, ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { IoTController } from './iotController'
import { sendDirectUartPacket } from './uartService'
import type { UartPacket, LedStripPayload } from './ledStripSchema'

// =============================================================================
// TUYA LIGHT TOOLS
// =============================================================================

const controlLightPowerParams = z.object({
  deviceId: z.enum([
    'eb506e78c700b185a2ppjq',  // Main 1
    'ebf9a11b3323926dac7jmt',  // Main 2  
    'eb46a372812df2161b6ws2',  // Door Light
  ]).describe('The device ID of the light'),
  power: z.boolean().describe('true to turn on, false to turn off'),
})

export const controlLightPower = tool({
  name: 'control_light_power',
  description: 'Turn a Tuya smart light on or off. Use this for Main 1, Main 2, or Door Light.',
  parameters: controlLightPowerParams,
  execute: async ({ deviceId, power }) => {
    console.log(`💡 Controlling light ${deviceId}: power=${power}`)
    const result = await IoTController.executeCommand({
      type: 'light',
      transport: 'network',
      deviceId,
      action: 'power',
      value: power,
    })
    return result.message
  },
})

/**
 * Set Tuya light brightness
 */
const setLightBrightnessParams = z.object({
  deviceId: z.enum([
    'eb506e78c700b185a2ppjq',
    'ebf9a11b3323926dac7jmt',
    'eb46a372812df2161b6ws2',
  ]).describe('The device ID of the light'),
  brightness: z.number().min(0).max(100).describe('Brightness percentage (0-100)'),
})

export const setLightBrightness = tool({
  name: 'set_light_brightness',
  description: 'Set the brightness of a Tuya smart light (0-100%)',
  parameters: setLightBrightnessParams,
  execute: async ({ deviceId, brightness }) => {
    console.log(`💡 Setting brightness ${deviceId}: ${brightness}%`)
    const result = await IoTController.executeCommand({
      type: 'light',
      transport: 'network',
      deviceId,
      action: 'brightness',
      value: brightness,
    })
    return result.message
  },
})

/**
 * Set Tuya light color
 */
const setLightColorParams = z.object({
  deviceId: z.enum([
    'eb506e78c700b185a2ppjq',
    'ebf9a11b3323926dac7jmt',
    'eb46a372812df2161b6ws2',
  ]).describe('The device ID of the light'),
  r: z.number().min(0).max(255).describe('Red value (0-255)'),
  g: z.number().min(0).max(255).describe('Green value (0-255)'),
  b: z.number().min(0).max(255).describe('Blue value (0-255)'),
})

export const setLightColor = tool({
  name: 'set_light_color',
  description: 'Set the color of a Tuya smart light using RGB values',
  parameters: setLightColorParams,
  execute: async ({ deviceId, r, g, b }) => {
    console.log(`💡 Setting color ${deviceId}: rgb(${r},${g},${b})`)
    const result = await IoTController.executeCommand({
      type: 'light',
      transport: 'network',
      deviceId,
      action: 'color',
      value: { r, g, b },
    })
    return result.message
  },
})

/**
 * Toggle all Tuya lights
 */
const toggleAllLightsParams = z.object({})

export const toggleAllLights = tool({
  name: 'toggle_all_lights',
  description: 'Toggle all Tuya smart lights on or off at once',
  parameters: toggleAllLightsParams,
  execute: async () => {
    console.log('💡 Toggling all lights')
    const result = await IoTController.toggleLights()
    return result.message
  },
})

// =============================================================================
// LED STRIP TOOLS (UART)
// =============================================================================

const rgbColorSchema = z.object({
  r: z.number().min(0).max(255).describe('Red (0-255)'),
  g: z.number().min(0).max(255).describe('Green (0-255)'),
  b: z.number().min(0).max(255).describe('Blue (0-255)'),
})

const ledModeSchema = z.enum(['solid', 'breath', 'rainbow', 'chase', 'heart_rate', 'fade'])

/**
 * Control LED strip - solid color
 */
const setLedStripSolidParams = z.object({
  color: rgbColorSchema.describe('The color to set'),
  brightness: z.number().min(0).max(1).optional().default(1.0).describe('Brightness (0.0-1.0)'),
})

export const setLedStripSolid = tool({
  name: 'set_led_strip_solid',
  description: 'Set the LED strip to a solid color',
  parameters: setLedStripSolidParams,
  execute: async ({ color, brightness }) => {
    console.log(`🌈 LED strip solid: rgb(${color.r},${color.g},${color.b}) @ ${brightness}`)
    const packet: UartPacket = {
      dst: 'node_01',
      src: 'jetson',
      device: 'led',
      payload: {
        state: 'on',
        mode: 'solid',
        color,
        color2: { r: 0, g: 0, b: 0 },
        brightness: brightness ?? 1.0,
        transition_ms: 500,
        duration_ms: 0,
        effect: { speed: 0.0, direction: 'cw' },
      },
    }
    const result = await sendDirectUartPacket(packet)
    return result.message
  },
})

/**
 * Control LED strip - breathing effect
 */
const setLedStripBreathParams = z.object({
  color: rgbColorSchema.describe('The color to breathe'),
  speed: z.number().min(0).max(1).optional().default(0.3).describe('Animation speed (0.0-1.0)'),
  brightness: z.number().min(0).max(1).optional().default(0.8).describe('Max brightness (0.0-1.0)'),
})

export const setLedStripBreath = tool({
  name: 'set_led_strip_breath',
  description: 'Set the LED strip to breathing/pulsing mode',
  parameters: setLedStripBreathParams,
  execute: async ({ color, speed, brightness }) => {
    console.log(`🌈 LED strip breath: rgb(${color.r},${color.g},${color.b})`)
    const packet: UartPacket = {
      dst: 'node_01',
      src: 'jetson',
      device: 'led',
      payload: {
        state: 'on',
        mode: 'breath',
        color,
        color2: { r: 0, g: 0, b: 0 },
        brightness: brightness ?? 0.8,
        transition_ms: 1000,
        duration_ms: 0,
        effect: { speed: speed ?? 0.3, direction: 'cw', min_brightness: 0.1 },
      },
    }
    const result = await sendDirectUartPacket(packet)
    return result.message
  },
})

/**
 * Control LED strip - rainbow mode
 */
const setLedStripRainbowParams = z.object({
  speed: z.number().min(0).max(1).optional().default(0.5).describe('Animation speed (0.0-1.0)'),
  brightness: z.number().min(0).max(1).optional().default(0.5).describe('Brightness (0.0-1.0)'),
  direction: z.enum(['cw', 'ccw']).optional().default('cw').describe('Direction: cw or ccw'),
})

export const setLedStripRainbow = tool({
  name: 'set_led_strip_rainbow',
  description: 'Set the LED strip to rainbow mode',
  parameters: setLedStripRainbowParams,
  execute: async ({ speed, brightness, direction }) => {
    console.log(`🌈 LED strip rainbow: speed=${speed}, brightness=${brightness}`)
    const packet: UartPacket = {
      dst: 'node_01',
      src: 'jetson',
      device: 'led',
      payload: {
        state: 'on',
        mode: 'rainbow',
        color: { r: 0, g: 0, b: 0 },
        color2: { r: 0, g: 0, b: 0 },
        brightness: brightness ?? 0.5,
        transition_ms: 0,
        duration_ms: 0,
        effect: { speed: speed ?? 0.5, direction: direction ?? 'cw' },
      },
    }
    const result = await sendDirectUartPacket(packet)
    return result.message
  },
})

/**
 * Control LED strip - chase mode
 */
const setLedStripChaseParams = z.object({
  color1: rgbColorSchema.describe('Primary color'),
  color2: rgbColorSchema.describe('Secondary color'),
  speed: z.number().min(0).max(1).optional().default(0.6).describe('Animation speed (0.0-1.0)'),
  brightness: z.number().min(0).max(1).optional().default(0.7).describe('Brightness (0.0-1.0)'),
})

export const setLedStripChase = tool({
  name: 'set_led_strip_chase',
  description: 'Set the LED strip to chase mode with two alternating colors',
  parameters: setLedStripChaseParams,
  execute: async ({ color1, color2, speed, brightness }) => {
    console.log(`🌈 LED strip chase: ${JSON.stringify(color1)} / ${JSON.stringify(color2)}`)
    const packet: UartPacket = {
      dst: 'node_01',
      src: 'jetson',
      device: 'led',
      payload: {
        state: 'on',
        mode: 'chase',
        color: color1,
        color2,
        brightness: brightness ?? 0.7,
        transition_ms: 500,
        duration_ms: 0,
        effect: { speed: speed ?? 0.6, direction: 'cw', width: 0.15, spacing: 0.15, count: 3 },
      },
    }
    const result = await sendDirectUartPacket(packet)
    return result.message
  },
})

/**
 * Turn off LED strip
 */
const turnOffLedStripParams = z.object({})

export const turnOffLedStrip = tool({
  name: 'turn_off_led_strip',
  description: 'Turn off the LED strip',
  parameters: turnOffLedStripParams,
  execute: async () => {
    console.log('🌈 Turning off LED strip')
    const packet: UartPacket = {
      dst: 'node_01',
      src: 'jetson',
      device: 'led',
      payload: {
        state: 'off',
        mode: 'solid',
        color: { r: 0, g: 0, b: 0 },
        color2: { r: 0, g: 0, b: 0 },
        brightness: 0.0,
        transition_ms: 500,
        duration_ms: 0,
        effect: { speed: 0.0, direction: 'cw' },
      },
    }
    const result = await sendDirectUartPacket(packet)
    return result.message
  },
})

// =============================================================================
// WEB SEARCH TOOL (TAVILY)
// =============================================================================

const webSearchParams = z.object({
  query: z.string().describe('The search query to look up on the web'),
  searchDepth: z.enum(['basic', 'advanced']).optional().default('basic').describe('Search depth: basic for quick results, advanced for more thorough search'),
})

export const webSearch = tool({
  name: 'web_search',
  description: 'Search the web for current information, news, facts, or any topic the user asks about. Use this when the user asks questions that require up-to-date information from the internet.',
  parameters: webSearchParams,
  execute: async ({ query, searchDepth }) => {
    console.log(`🔍 Web search: "${query}" (depth: ${searchDepth})`)
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, searchDepth, maxResults: 5 }),
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Search failed: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Format results for voice output
      let result = ''
      if (data.answer) {
        result = data.answer
      } else if (data.results && data.results.length > 0) {
        // Summarize top results for voice
        result = data.results
          .slice(0, 3)
          .map((r: any) => r.content)
          .join(' ')
      } else {
        result = 'No results found for that search.'
      }
      
      console.log('✅ Web search complete')
      return result
    } catch (error) {
      console.error('❌ Web search error:', error)
      return `Sorry, I couldn't complete the web search: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  },
})

// =============================================================================
// EXPORT ALL TOOLS
// =============================================================================

export const iotTools = [
  controlLightPower,
  setLightBrightness,
  setLightColor,
  toggleAllLights,
  setLedStripSolid,
  setLedStripBreath,
  setLedStripRainbow,
  setLedStripChase,
  turnOffLedStrip,
]

export const allTools = [
  ...iotTools,
  webSearch,
]

export type ToolDefinition = {
  name: string
  description: string
  parameters: any
}

export function getRealtimeToolDefinitions(): ToolDefinition[] {
  return iotTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

export type RealtimeToolDefinition = {
  name: string
  description: string
  parameters: Record<string, any>
}

export function getRealtimeToolSchemas(): RealtimeToolDefinition[] {
  return [
    { tool: controlLightPower, schema: controlLightPowerParams },
    { tool: setLightBrightness, schema: setLightBrightnessParams },
    { tool: setLightColor, schema: setLightColorParams },
    { tool: toggleAllLights, schema: toggleAllLightsParams },
    { tool: setLedStripSolid, schema: setLedStripSolidParams },
    { tool: setLedStripBreath, schema: setLedStripBreathParams },
    { tool: setLedStripRainbow, schema: setLedStripRainbowParams },
    { tool: setLedStripChase, schema: setLedStripChaseParams },
    { tool: turnOffLedStrip, schema: turnOffLedStripParams },
    { tool: webSearch, schema: webSearchParams },
  ].map(({ tool, schema }) => {
    const jsonSchema = zodToJsonSchema(schema as any, tool.name) as Record<string, any>
    if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
      delete jsonSchema.$schema
    }
    // OpenAI expects 'enum' as an array of strings, not 'anyOf' with 'const'
    if (jsonSchema.properties) {
      for (const key in jsonSchema.properties) {
        const prop = jsonSchema.properties[key]
        if (prop && typeof prop === 'object' && 'anyOf' in prop && Array.isArray(prop.anyOf)) {
          // Convert Zod enum (which outputs anyOf + const) to simple enum
          const values = prop.anyOf.map((item: any) => item.const).filter((v: any) => v !== undefined)
          if (values.length > 0) {
            jsonSchema.properties[key] = {
              type: 'string',
              enum: values,
              description: prop.description
            }
          }
        }
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
    }
  })
}

// Device name mapping for the agent instructions
export const DEVICE_MAPPINGS = {
  lights: {
    'Main 1': 'eb506e78c700b185a2ppjq',
    'Main 2': 'ebf9a11b3323926dac7jmt',
    'Door Light': 'eb46a372812df2161b6ws2',
  },
  ledStrip: {
    target: 'node_01',
  },
}

