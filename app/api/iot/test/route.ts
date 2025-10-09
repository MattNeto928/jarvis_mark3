import { NextResponse } from 'next/server'

/**
 * Test endpoint to verify Tuya API connection
 */
export async function GET() {
  const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID
  const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET
  const TUYA_API_REGION = process.env.TUYA_API_REGION || 'us'

  if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
    return NextResponse.json({
      success: false,
      message: 'Tuya credentials not configured',
      details: {
        hasClientId: !!TUYA_CLIENT_ID,
        hasClientSecret: !!TUYA_CLIENT_SECRET,
        region: TUYA_API_REGION
      }
    })
  }

  try {
    const crypto = require('crypto')
    const t = Date.now().toString()
    const TUYA_API_ENDPOINT = `https://openapi.tuya${TUYA_API_REGION}.com`
    
    // Generate signature
    const path = '/v1.0/token?grant_type=1'
    const method = 'GET'
    const contentHash = crypto.createHash('sha256').update('').digest('hex')
    const stringToSign = [method, contentHash, '', path].join('\n')
    const signStr = TUYA_CLIENT_ID + t + stringToSign
    const sign = crypto
      .createHmac('sha256', TUYA_CLIENT_SECRET)
      .update(signStr)
      .digest('hex')
      .toUpperCase()

    // Test authentication
    const response = await fetch(`${TUYA_API_ENDPOINT}${path}`, {
      method: 'GET',
      headers: {
        'client_id': TUYA_CLIENT_ID,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256',
      }
    })

    const data = await response.json()

    return NextResponse.json({
      success: data.success,
      message: data.success ? 'Tuya connection successful!' : `Tuya error: ${data.msg}`,
      details: {
        endpoint: TUYA_API_ENDPOINT,
        region: TUYA_API_REGION,
        timestamp: t,
        response: data
      }
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message,
      error: error.toString()
    }, { status: 500 })
  }
}

