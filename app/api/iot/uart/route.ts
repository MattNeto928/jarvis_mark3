/**
 * UART Command API
 * Handles sending commands over UART serial communication
 * Uses a Python script to handle the actual serial communication
 */

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

const UART_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'send_uart_command.py')
const DEVICES_JSON_PATH = path.join(process.cwd(), 'DEVICES.json')

/**
 * Load device config from DEVICES.json
 */
function loadDeviceConfig(deviceId: string): any {
  try {
    if (fs.existsSync(DEVICES_JSON_PATH)) {
      const devicesJson = fs.readFileSync(DEVICES_JSON_PATH, 'utf-8')
      const devices = JSON.parse(devicesJson)
      const device = devices.find((d: any) => d.id === deviceId)
      return device?.config || {}
    }
  } catch (error) {
    console.error('Error loading device config:', error)
  }
  return {}
}

/**
 * Send command over UART
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔌 UART API endpoint called')

    const body = await request.json()
    console.log('📦 Request body:', JSON.stringify(body, null, 2))

    const { deviceId, packet, config: providedConfig } = body

    if (!packet) {
      console.error('❌ Missing packet in request')
      return NextResponse.json(
        { success: false, message: 'Missing packet' },
        { status: 400 }
      )
    }

    console.log('✅ Packet received:', JSON.stringify(packet, null, 2))

    // Load device config from DEVICES.json if available, merge with provided config
    const deviceConfig = loadDeviceConfig(deviceId || 'led_strip_01')
    const finalConfig = { ...deviceConfig, ...providedConfig }

    console.log('⚙️ Final config:', finalConfig)

    // Ensure the Python script exists
    if (!fs.existsSync(UART_SCRIPT_PATH)) {
      console.log('📝 Creating Python script at:', UART_SCRIPT_PATH)
      await createUartScript()
    } else {
      console.log('✓ Python script exists at:', UART_SCRIPT_PATH)
    }

    // Execute Python script to send UART command
    const scriptInput = JSON.stringify({ deviceId, packet, config: finalConfig })
    console.log('🐍 Spawning Python script with input:', scriptInput.substring(0, 200) + '...')

    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [
        UART_SCRIPT_PATH,
        scriptInput
      ])

      console.log('⚡ Python process spawned, PID:', pythonProcess.pid)

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString()
        stdout += chunk
        console.log('📤 Python stdout:', chunk.trim())
      })

      pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString()
        stderr += chunk
        console.log('📡 Python stderr:', chunk.trim())
      })

      pythonProcess.on('close', (code) => {
        console.log(`🏁 Python process exited with code ${code}`)
        console.log('📝 Full stdout:', stdout)
        console.log('📝 Full stderr:', stderr)

        if (code === 0) {
          try {
            const result = JSON.parse(stdout)
            console.log('✅ UART command successful:', result)
            resolve(NextResponse.json({
              success: true,
              message: 'UART command sent successfully',
              data: result
            }))
          } catch {
            console.log('✅ UART command sent (non-JSON output)')
            resolve(NextResponse.json({
              success: true,
              message: 'UART command sent',
              output: stdout
            }))
          }
        } else {
          console.error('❌ UART script failed with code', code)
          console.error('Error output:', stderr)
          resolve(NextResponse.json({
            success: false,
            message: stderr || 'Failed to send UART command',
            error: 'UART_SCRIPT_ERROR',
            code
          }, { status: 500 }))
        }
      })

      pythonProcess.on('error', (error) => {
        console.error('❌ Failed to spawn Python process:', error)
        console.error('Script path:', UART_SCRIPT_PATH)
        console.error('Error details:', error.message)
        resolve(NextResponse.json({
          success: false,
          message: `Failed to execute UART script: ${error.message}`,
          error: 'UART_SCRIPT_SPAWN_ERROR'
        }, { status: 500 }))
      })
    })

  } catch (error: any) {
    console.error('UART API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Failed to send UART command',
        error: 'UART_API_ERROR'
      },
      { status: 500 }
    )
  }
}

/**
 * Create the Python script for sending UART commands
 */
async function createUartScript(): Promise<void> {
  const scriptContent = `#!/usr/bin/env python3
"""
UART Command Sender
Sends JSON commands over UART serial communication
CRITICAL: Only sends clean, compact JSON with no extra text
"""

import serial
import json
import sys
import time

def main():
    try:
        # Parse input from command line
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "message": "No input provided"}))
            sys.exit(1)

        input_data = json.loads(sys.argv[1])
        device_id = input_data.get('deviceId')
        packet = input_data.get('packet')
        config = input_data.get('config', {})

        # Extract configuration
        serial_port = config.get('serialPort', '/dev/ttyTHS1')
        baud_rate = config.get('baudRate', 115200)

        # Setup Serial Connection
        try:
            ser = serial.Serial(serial_port, baud_rate, timeout=1)
            print(f"📡 Connected to {serial_port} @ {baud_rate}", file=sys.stderr)
            time.sleep(0.5)  # Allow serial to stabilize
        except serial.SerialException as e:
            error_msg = f"Error opening serial port: {e}"
            print(json.dumps({"success": False, "message": error_msg}))
            sys.exit(1)

        # CRITICAL: Convert packet to compact JSON (no spaces, no newlines in the JSON itself)
        # This uses separators=(',', ':') to ensure compact format
        json_payload = json.dumps(packet, separators=(',', ':'), ensure_ascii=False)

        # Verify it's valid JSON before sending
        json.loads(json_payload)  # Will throw if invalid

        # Send with newline delimiter (UART receivers expect \\n terminator)
        bytes_to_send = (json_payload + '\\n').encode('utf-8')

        print(f"📤 Sending {len(bytes_to_send)} bytes over UART", file=sys.stderr)
        print(f"📦 Payload: {json_payload}", file=sys.stderr)
        print(f"🔍 First 100 chars: {json_payload[:100]}...", file=sys.stderr)

        ser.write(bytes_to_send)
        ser.flush()  # Ensure all data is sent

        print(f"✅ Transmission complete", file=sys.stderr)

        # Close serial connection
        ser.close()

        # Return success
        print(json.dumps({
            "success": True,
            "message": "Command sent successfully",
            "deviceId": device_id,
            "bytesSent": len(bytes_to_send),
            "packet": packet
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
`

  // Ensure scripts directory exists
  const scriptsDir = path.dirname(UART_SCRIPT_PATH)
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true })
  }

  // Write the script
  fs.writeFileSync(UART_SCRIPT_PATH, scriptContent, { mode: 0o755 })
}
