/**
 * LED Strip Schema Validation
 * STRICTLY enforces the schema that the Arduino ESP32 code expects
 * Based on the ESP-NOW receiver code in uart_test/new.ino
 */

export type LedStripMode = 'solid' | 'breath' | 'rainbow' | 'chase' | 'heart_rate' | 'fade'
export type Direction = 'cw' | 'ccw'
export type State = 'on' | 'off'

/**
 * LED Strip Effect Parameters
 * These are always in the effect object
 */
export interface LedStripEffect {
  speed: number           // REQUIRED: 0.0-1.0
  direction: Direction    // REQUIRED: 'cw' or 'ccw'
  min_brightness?: number // OPTIONAL: 0.0-1.0 (for breath mode)
  width?: number          // OPTIONAL: 0.0-1.0 (for chase mode)
  spacing?: number        // OPTIONAL: 0.0-1.0 (for chase mode)
  count?: number          // OPTIONAL: 1-255 (for chase mode)
}

/**
 * RGB Color
 */
export interface RGBColor {
  r: number  // 0-255
  g: number  // 0-255
  b: number  // 0-255
}

/**
 * LED Strip Payload
 * This is the exact structure the Arduino expects in the "payload" field
 */
export interface LedStripPayload {
  state: State              // REQUIRED: 'on' or 'off'
  mode: LedStripMode        // REQUIRED: mode type
  color: RGBColor           // REQUIRED: primary color
  color2: RGBColor          // REQUIRED: secondary color (use black if not needed)
  brightness: number        // REQUIRED: 0.0-1.0
  transition_ms: number     // REQUIRED: milliseconds
  duration_ms: number       // REQUIRED: milliseconds (0 = infinite)
  effect: LedStripEffect    // REQUIRED: effect parameters
}

/**
 * Complete UART Packet
 * This is what gets sent over UART to the ESP32
 */
export interface UartPacket {
  dst: string              // Target node ID (e.g., "node_01")
  src: string              // Source ID (e.g., "jetson")
  device: string           // MUST be "led"
  payload: LedStripPayload // The LED strip configuration
}

/**
 * Validation Errors
 */
export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaValidationError'
  }
}

/**
 * Validate RGB color values
 */
function validateColor(color: any, fieldName: string): void {
  if (!color || typeof color !== 'object') {
    throw new SchemaValidationError(`${fieldName} must be an object`)
  }
  if (typeof color.r !== 'number' || color.r < 0 || color.r > 255) {
    throw new SchemaValidationError(`${fieldName}.r must be 0-255`)
  }
  if (typeof color.g !== 'number' || color.g < 0 || color.g > 255) {
    throw new SchemaValidationError(`${fieldName}.g must be 0-255`)
  }
  if (typeof color.b !== 'number' || color.b < 0 || color.b > 255) {
    throw new SchemaValidationError(`${fieldName}.b must be 0-255`)
  }
}

/**
 * Validate brightness value
 */
function validateBrightness(value: any, fieldName: string): void {
  if (typeof value !== 'number' || value < 0 || value > 1) {
    throw new SchemaValidationError(`${fieldName} must be a number between 0.0 and 1.0`)
  }
}

/**
 * Validate effect parameters
 */
function validateEffect(effect: any): void {
  if (!effect || typeof effect !== 'object') {
    throw new SchemaValidationError('effect must be an object')
  }

  // REQUIRED: speed
  if (typeof effect.speed !== 'number' || effect.speed < 0 || effect.speed > 1) {
    throw new SchemaValidationError('effect.speed must be a number between 0.0 and 1.0')
  }

  // REQUIRED: direction
  if (effect.direction !== 'cw' && effect.direction !== 'ccw') {
    throw new SchemaValidationError('effect.direction must be "cw" or "ccw"')
  }

  // OPTIONAL: min_brightness
  if (effect.min_brightness !== undefined) {
    validateBrightness(effect.min_brightness, 'effect.min_brightness')
  }

  // OPTIONAL: width
  if (effect.width !== undefined) {
    if (typeof effect.width !== 'number' || effect.width < 0 || effect.width > 1) {
      throw new SchemaValidationError('effect.width must be between 0.0 and 1.0')
    }
  }

  // OPTIONAL: spacing
  if (effect.spacing !== undefined) {
    if (typeof effect.spacing !== 'number' || effect.spacing < 0 || effect.spacing > 1) {
      throw new SchemaValidationError('effect.spacing must be between 0.0 and 1.0')
    }
  }

  // OPTIONAL: count
  if (effect.count !== undefined) {
    if (typeof effect.count !== 'number' || effect.count < 1 || effect.count > 255) {
      throw new SchemaValidationError('effect.count must be between 1 and 255')
    }
  }
}

/**
 * Validate LED strip payload
 * Throws SchemaValidationError if invalid
 */
export function validateLedStripPayload(payload: any): asserts payload is LedStripPayload {
  if (!payload || typeof payload !== 'object') {
    throw new SchemaValidationError('Payload must be an object')
  }

  // REQUIRED: state
  if (payload.state !== 'on' && payload.state !== 'off') {
    throw new SchemaValidationError('state must be "on" or "off"')
  }

  // REQUIRED: mode
  const validModes: LedStripMode[] = ['solid', 'breath', 'rainbow', 'chase', 'heart_rate', 'fade']
  if (!validModes.includes(payload.mode)) {
    throw new SchemaValidationError(`mode must be one of: ${validModes.join(', ')}`)
  }

  // REQUIRED: color
  validateColor(payload.color, 'color')

  // REQUIRED: color2
  validateColor(payload.color2, 'color2')

  // REQUIRED: brightness
  validateBrightness(payload.brightness, 'brightness')

  // REQUIRED: transition_ms
  if (typeof payload.transition_ms !== 'number' || payload.transition_ms < 0) {
    throw new SchemaValidationError('transition_ms must be a non-negative number')
  }

  // REQUIRED: duration_ms
  if (typeof payload.duration_ms !== 'number' || payload.duration_ms < 0) {
    throw new SchemaValidationError('duration_ms must be a non-negative number')
  }

  // REQUIRED: effect
  validateEffect(payload.effect)
}

/**
 * Validate complete UART packet
 */
export function validateUartPacket(packet: any): asserts packet is UartPacket {
  if (!packet || typeof packet !== 'object') {
    throw new SchemaValidationError('Packet must be an object')
  }

  if (typeof packet.dst !== 'string' || packet.dst.length === 0) {
    throw new SchemaValidationError('dst (destination node ID) is required')
  }

  if (typeof packet.src !== 'string' || packet.src.length === 0) {
    throw new SchemaValidationError('src (source ID) is required')
  }

  if (packet.device !== 'led') {
    throw new SchemaValidationError('device must be "led"')
  }

  validateLedStripPayload(packet.payload)
}

/**
 * Create a valid LED strip payload with defaults
 * This ensures all required fields are present
 */
export function createLedStripPayload(
  mode: LedStripMode,
  color: RGBColor,
  options?: {
    state?: State
    color2?: RGBColor
    brightness?: number
    transition_ms?: number
    duration_ms?: number
    effect?: Partial<LedStripEffect>
  }
): LedStripPayload {
  const payload: LedStripPayload = {
    state: options?.state ?? 'on',
    mode,
    color,
    color2: options?.color2 ?? { r: 0, g: 0, b: 0 },
    brightness: options?.brightness ?? 1.0,
    transition_ms: options?.transition_ms ?? 500,
    duration_ms: options?.duration_ms ?? 0,
    effect: {
      speed: options?.effect?.speed ?? 0.5,
      direction: options?.effect?.direction ?? 'cw',
      ...(options?.effect?.min_brightness !== undefined && { min_brightness: options.effect.min_brightness }),
      ...(options?.effect?.width !== undefined && { width: options.effect.width }),
      ...(options?.effect?.spacing !== undefined && { spacing: options.effect.spacing }),
      ...(options?.effect?.count !== undefined && { count: options.effect.count }),
    }
  }

  // Validate before returning
  validateLedStripPayload(payload)

  return payload
}

/**
 * Get example payloads for each mode
 */
export const EXAMPLE_PAYLOADS = {
  solid: createLedStripPayload('solid', { r: 255, g: 0, b: 0 }, {
    brightness: 1.0,
    effect: { speed: 0.0, direction: 'cw' }
  }),

  breath: createLedStripPayload('breath', { r: 0, g: 100, b: 255 }, {
    brightness: 0.8,
    effect: { speed: 0.3, direction: 'cw', min_brightness: 0.1 }
  }),

  rainbow: createLedStripPayload('rainbow', { r: 0, g: 0, b: 0 }, {
    brightness: 0.5,
    effect: { speed: 0.8, direction: 'ccw' }
  }),

  chase: createLedStripPayload('chase', { r: 255, g: 0, b: 0 }, {
    color2: { r: 0, g: 0, b: 255 },
    brightness: 0.7,
    effect: { speed: 0.6, direction: 'cw', width: 0.15, spacing: 0.15, count: 3 }
  }),

  heart_rate: createLedStripPayload('heart_rate', { r: 255, g: 0, b: 100 }, {
    brightness: 0.9,
    effect: { speed: 0.5, direction: 'cw', min_brightness: 0.2 }
  })
}
