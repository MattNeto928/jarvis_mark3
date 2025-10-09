import { NextRequest, NextResponse } from 'next/server'

/**
 * Tuya/Smart Life API Integration
 * 
 * To use this API, you need:
 * 1. Tuya IoT Platform account (iot.tuya.com)
 * 2. Create a Cloud Project
 * 3. Link your Smart Life app
 * 4. Get: Client ID, Client Secret, Device IDs
 * 
 * Set environment variables:
 * - TUYA_CLIENT_ID
 * - TUYA_CLIENT_SECRET
 * - TUYA_API_REGION (us, eu, cn, in)
 */

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET
const TUYA_API_REGION = process.env.TUYA_API_REGION || 'us'

const TUYA_API_ENDPOINT = `https://openapi.tuya${TUYA_API_REGION}.com`

let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get Tuya access token
 */
async function getTuyaToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
    throw new Error('Tuya credentials not configured')
  }

  const t = Date.now().toString()
  const sign = generateSign('GET', '/v1.0/token?grant_type=1', {}, t)

  const response = await fetch(`${TUYA_API_ENDPOINT}/v1.0/token?grant_type=1`, {
    method: 'GET',
    headers: {
      'client_id': TUYA_CLIENT_ID,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256',
    }
  })

  const data = await response.json()
  
  if (!data.success) {
    console.error('Tuya auth error:', data)
    throw new Error(`Tuya auth failed: ${data.msg}`)
  }

  cachedToken = data.result.access_token
  tokenExpiry = Date.now() + (data.result.expire_time * 1000) - 60000 // Refresh 1min early
  
  return cachedToken!
}

/**
 * Generate Tuya API signature
 * Based on official Tuya OpenAPI signature algorithm
 */
function generateSign(method: string, path: string, body: any, t: string, accessToken: string = ''): string {
  const crypto = require('crypto')
  
  // Calculate content hash
  const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : ''
  const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex')
  
  // Build string to sign
  const stringToSign = [method, contentHash, '', path].join('\n')
  
  // Build sign string: clientId + accessToken + t + stringToSign
  const signStr = TUYA_CLIENT_ID + accessToken + t + stringToSign
  
  // Generate signature
  const sign = crypto
    .createHmac('sha256', TUYA_CLIENT_SECRET)
    .update(signStr)
    .digest('hex')
    .toUpperCase()
  
  return sign
}

/**
 * Control Tuya device
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId, commands } = await request.json()

    if (!deviceId || !commands) {
      return NextResponse.json(
        { success: false, message: 'Missing deviceId or commands' },
        { status: 400 }
      )
    }

    const token = await getTuyaToken()
    const t = Date.now().toString()
    const body = { commands }
    const sign = generateSign('POST', `/v1.0/devices/${deviceId}/commands`, body, t, token)

    // Send command to Tuya device
    const response = await fetch(
      `${TUYA_API_ENDPOINT}/v1.0/devices/${deviceId}/commands`,
      {
        method: 'POST',
        headers: {
          'client_id': TUYA_CLIENT_ID!,
          'access_token': token,
          'sign': sign,
          't': t,
          'sign_method': 'HMAC-SHA256',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }
    )

    const data = await response.json()
    
    console.log('Tuya command response:', JSON.stringify(data, null, 2))
    console.log('Sent commands:', JSON.stringify(commands, null, 2))

    return NextResponse.json({
      success: data.success,
      message: data.success ? 'Command executed' : data.msg,
      data: data.result,
      sentCommands: commands,
      fullResponse: data
    })

  } catch (error: any) {
    console.error('Tuya API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Failed to control device',
        error: 'TUYA_API_ERROR'
      },
      { status: 500 }
    )
  }
}

/**
 * Get device status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!deviceId) {
      return NextResponse.json(
        { success: false, message: 'Missing deviceId' },
        { status: 400 }
      )
    }

    const token = await getTuyaToken()
    const t = Date.now().toString()
    const sign = generateSign('GET', `/v1.0/devices/${deviceId}`, {}, t, token)

    const response = await fetch(
      `${TUYA_API_ENDPOINT}/v1.0/devices/${deviceId}`,
      {
        headers: {
          'client_id': TUYA_CLIENT_ID!,
          'access_token': token,
          'sign': sign,
          't': t,
          'sign_method': 'HMAC-SHA256',
        }
      }
    )

    const data = await response.json()

    return NextResponse.json({
      success: data.success,
      device: data.result
    })

  } catch (error: any) {
    console.error('Tuya API error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

