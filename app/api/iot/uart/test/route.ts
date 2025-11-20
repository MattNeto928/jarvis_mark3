/**
 * UART Test Endpoint
 * Tests if Python and serial communication are working
 */

import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    checks: []
  }

  // Check 1: Python3 availability
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('python3', ['--version'])
      let output = ''
      proc.stdout.on('data', (data) => { output += data.toString() })
      proc.stderr.on('data', (data) => { output += data.toString() })
      proc.on('close', (code) => {
        if (code === 0) {
          results.checks.push({ name: 'Python3', status: 'OK', detail: output.trim() })
          resolve(null)
        } else {
          results.checks.push({ name: 'Python3', status: 'FAIL', detail: 'Exit code: ' + code })
          reject()
        }
      })
      proc.on('error', (error) => {
        results.checks.push({ name: 'Python3', status: 'ERROR', detail: error.message })
        reject()
      })
    })
  } catch {
    // Error already logged
  }

  // Check 2: pyserial availability
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('python3', ['-c', 'import serial; print(serial.__version__)'])
      let output = ''
      proc.stdout.on('data', (data) => { output += data.toString() })
      proc.stderr.on('data', (data) => { output += data.toString() })
      proc.on('close', (code) => {
        if (code === 0) {
          results.checks.push({ name: 'pyserial', status: 'OK', detail: 'Version: ' + output.trim() })
          resolve(null)
        } else {
          results.checks.push({ name: 'pyserial', status: 'FAIL', detail: 'Not installed or import error' })
          reject()
        }
      })
      proc.on('error', (error) => {
        results.checks.push({ name: 'pyserial', status: 'ERROR', detail: error.message })
        reject()
      })
    })
  } catch {
    // Error already logged
  }

  // Check 3: UART script existence
  const scriptPath = path.join(process.cwd(), 'scripts', 'send_uart_command.py')
  if (fs.existsSync(scriptPath)) {
    const stats = fs.statSync(scriptPath)
    results.checks.push({
      name: 'UART Script',
      status: 'OK',
      detail: `Exists at ${scriptPath}, size: ${stats.size} bytes`
    })
  } else {
    results.checks.push({
      name: 'UART Script',
      status: 'MISSING',
      detail: `Not found at ${scriptPath}`
    })
  }

  // Check 4: Serial port existence
  const serialPort = '/dev/ttyTHS1'
  if (fs.existsSync(serialPort)) {
    try {
      const stats = fs.statSync(serialPort)
      results.checks.push({
        name: 'Serial Port',
        status: 'EXISTS',
        detail: `${serialPort} exists (permissions may need checking)`
      })
    } catch (error: any) {
      results.checks.push({
        name: 'Serial Port',
        status: 'ERROR',
        detail: error.message
      })
    }
  } else {
    results.checks.push({
      name: 'Serial Port',
      status: 'NOT_FOUND',
      detail: `${serialPort} does not exist`
    })
  }

  // Overall status
  const allOk = results.checks.every((c: any) => c.status === 'OK' || c.status === 'EXISTS')
  results.overall = allOk ? 'READY' : 'NOT_READY'

  return NextResponse.json(results)
}
