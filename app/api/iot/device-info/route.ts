import { NextRequest, NextResponse } from 'next/server'

/**
 * Get device information and supported commands
 * Useful for debugging what commands a device actually supports
 */

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET
const TUYA_API_REGION = process.env.TUYA_API_REGION || 'us'
const TUYA_API_ENDPOINT = `https://openapi.tuya${TUYA_API_REGION}.com`

let cachedToken: string | null = null
let tokenExpiry: number = 0

function generateSign(method: string, path: string, body: any, t: string, accessToken: string = ''): string {
  const crypto = require('crypto')
  const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : ''
  const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex')
  const stringToSign = [method, contentHash, '', path].join('\n')
  const signStr = TUYA_CLIENT_ID + accessToken + t + stringToSign
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(signStr).digest('hex').toUpperCase()
  return sign
}

async function getTuyaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  const t = Date.now().toString()
  const sign = generateSign('GET', '/v1.0/token?grant_type=1', {}, t)

  const response = await fetch(`${TUYA_API_ENDPOINT}/v1.0/token?grant_type=1`, {
    method: 'GET',
    headers: {
      'client_id': TUYA_CLIENT_ID!,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256',
    }
  })

  const data = await response.json()
  if (!data.success) {
    throw new Error(`Tuya auth failed: ${data.msg}`)
  }

  cachedToken = data.result.access_token
  tokenExpiry = Date.now() + (data.result.expire_time * 1000) - 60000
  return cachedToken!
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!deviceId) {
      return NextResponse.json(
        { success: false, message: 'Missing deviceId parameter' },
        { status: 400 }
      )
    }

    const token = await getTuyaToken()
    const t = Date.now().toString()
    
    // Get device specification (shows supported commands)
    const specPath = `/v1.0/devices/${deviceId}/specifications`
    const specSign = generateSign('GET', specPath, {}, t, token)
    
    const specResponse = await fetch(`${TUYA_API_ENDPOINT}${specPath}`, {
      headers: {
        'client_id': TUYA_CLIENT_ID!,
        'access_token': token,
        'sign': specSign,
        't': t,
        'sign_method': 'HMAC-SHA256',
      }
    })
    
    const specData = await specResponse.json()
    console.log('Spec data:', JSON.stringify(specData, null, 2))

    // Get current device status
    const statusPath = `/v1.0/devices/${deviceId}`
    const statusSign = generateSign('GET', statusPath, {}, t, token)
    
    const statusResponse = await fetch(`${TUYA_API_ENDPOINT}${statusPath}`, {
      headers: {
        'client_id': TUYA_CLIENT_ID!,
        'access_token': token,
        'sign': statusSign,
        't': t,
        'sign_method': 'HMAC-SHA256',
      }
    })
    
    const statusData = await statusResponse.json()
    console.log('Status data:', JSON.stringify(statusData, null, 2))

    return NextResponse.json({
      success: true,
      deviceId,
      specifications: specData,
      status: statusData,
      rawSpec: specData,
      rawStatus: statusData,
      message: 'Device information retrieved successfully'
    })

  } catch (error: any) {
    console.error('Device info error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

