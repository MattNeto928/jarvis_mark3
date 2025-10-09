import { NextRequest, NextResponse } from 'next/server'

/**
 * Local Tuya Control via TinyTuya
 * Routes requests to local Python server
 * NO cloud API calls = FREE forever!
 */

const LOCAL_SERVER_URL = process.env.TUYA_LOCAL_SERVER_URL || 'http://127.0.0.1:5001'

/**
 * Control device locally
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId, commands, action, value } = await request.json()

    if (!deviceId) {
      return NextResponse.json(
        { success: false, message: 'Missing deviceId' },
        { status: 400 }
      )
    }

    let endpoint = `${LOCAL_SERVER_URL}/device/${deviceId}/control`
    let body: any = { commands }

    // If simple action provided, use simplified endpoint
    if (action) {
      endpoint = `${LOCAL_SERVER_URL}/device/${deviceId}/simple`
      body = { action, value }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Local control error:', error)
    
    // If local server not running, provide helpful message
    if (error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Local control server not running. Start it with: cd scripts && python3 tuya_local_server.py',
          error: 'LOCAL_SERVER_OFFLINE'
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Failed to control device locally',
        error: 'LOCAL_CONTROL_ERROR'
      },
      { status: 500 }
    )
  }
}

/**
 * Get device status locally
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

    const response = await fetch(
      `${LOCAL_SERVER_URL}/device/${deviceId}/status`
    )

    const data = await response.json()

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Local status error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

