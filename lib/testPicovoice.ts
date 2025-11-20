/**
 * Simple test script to verify Picovoice is working
 * Run this in the browser console to test the Picovoice key
 */

import { PorcupineWorker } from '@picovoice/porcupine-web'

export async function testPicovoiceKey(accessKey: string): Promise<void> {
  console.log('🧪 Testing Picovoice Access Key...')
  console.log('Key length:', accessKey.length)
  console.log('Key preview:', accessKey.substring(0, 20) + '...')

  try {
    console.log('Creating Porcupine worker...')
    const porcupine = await PorcupineWorker.create(
      accessKey,
      [{ builtin: 'jarvis', sensitivity: 0.5 }],
      (keywordIndex) => {
        console.log('Wake word detected!', keywordIndex)
      },
      (error) => {
        console.error('Porcupine error:', error)
      }
    )

    console.log('✅ Porcupine initialized successfully!')
    console.log('Porcupine worker:', porcupine)

    // Clean up
    porcupine.terminate()
    console.log('✅ Test completed - Picovoice key is valid!')
  } catch (error) {
    console.error('❌ Porcupine initialization failed!')
    console.error('Error:', error)

    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }

    throw error
  }
}

// Helper to test from console
if (typeof window !== 'undefined') {
  (window as any).testPicovoiceKey = testPicovoiceKey
}
