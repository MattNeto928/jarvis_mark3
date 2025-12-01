/**
 * API Route: Create Ephemeral Session Token for Realtime API
 * 
 * This route creates a short-lived session token that can be used
 * for WebRTC connections to the OpenAI Realtime API from the browser.
 * 
 * The ephemeral token is safer than exposing the API key in the browser.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get API key from request body or environment
    const body = await request.json().catch(() => ({}))
    const apiKey = body.apiKey || process.env.OPENAI_API_KEY

    console.log('📡 Creating realtime session...')
    console.log('   API Key provided:', apiKey ? `${apiKey.substring(0, 10)}...` : 'none')
    console.log('   Voice:', body.voice || 'alloy')

    if (!apiKey) {
      console.error('❌ No API key provided')
      return NextResponse.json(
        { error: 'No API key provided' },
        { status: 400 }
      )
    }

    // Create ephemeral session token
    console.log('📤 Calling OpenAI /v1/realtime/sessions...')
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: body.voice || 'alloy',
      }),
    })

    console.log('📥 OpenAI response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('❌ Failed to create session:', response.status, errorText)
      let errorMessage = ''
      try {
        const parsed = JSON.parse(errorText)
        errorMessage = parsed.error?.message || errorText
      } catch {
        errorMessage = errorText || `Failed to create session: ${response.status}`
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    const sessionData = await response.json()
    console.log('✅ Session created successfully')
    console.log('   Session ID:', sessionData.id)
    console.log('   Client secret type:', typeof sessionData.client_secret)
    
    // The client_secret object contains a 'value' property with the actual token
    const clientSecret = sessionData.client_secret?.value || sessionData.client_secret
    console.log('   Token prefix:', clientSecret?.substring(0, 20) + '...')
    
    // Return the ephemeral client secret
    return NextResponse.json({
      client_secret: clientSecret,
      expires_at: sessionData.client_secret?.expires_at || sessionData.expires_at,
    })

  } catch (error: any) {
    console.error('Error creating realtime session:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

