/**
 * Wake Word Detection Service using Picovoice Porcupine
 * Manages voice assistant states and prevents always-listening issues
 */

import { PorcupineWorker } from '@picovoice/porcupine-web'
import { WebVoiceProcessor } from '@picovoice/web-voice-processor'

export type AssistantState = 'idle' | 'listening' | 'processing' | 'speaking'

export interface WakeWordConfig {
  accessKey: string
  keywordPath?: string // Path to custom .ppn file (e.g., '/wake-words/jarvis.ppn')
  keywordBase64?: string // Base64 encoded .ppn file content
  keywordBuiltin?: 'alexa' | 'americano' | 'blueberry' | 'bumblebee' | 'computer' | 'grapefruit' | 'grasshopper' | 'hey google' | 'hey siri' | 'jarvis' | 'ok google' | 'picovoice' | 'porcupine' | 'terminator'
  sensitivity?: number // 0.0 to 1.0, default 0.5
  keywordLabel?: string // Display name for the wake word (e.g., 'Jarvis')
  keywords?: Array<{ // Multiple wake words
    keywordPath?: string
    keywordBase64?: string
    keywordBuiltin?: string
    sensitivity?: number
    keywordLabel?: string
  }>
}

export class WakeWordService {
  private porcupine: PorcupineWorker | null = null
  private state: AssistantState = 'idle'
  private onWakeWordDetected: ((keywordIndex: number) => void) | null = null
  private onStateChange: ((state: AssistantState) => void) | null = null
  private isInitialized = false
  private isSuppressed = false // Suppresses wake word during TTS
  private isSubscribed = false // Track if WebVoiceProcessor is subscribed

  constructor(
    private config: WakeWordConfig
  ) {}

  /**
   * Initialize Porcupine wake word detection
   * Must be called from client-side only (browser environment)
   */
  async initialize(
    onWakeWordDetected: (keywordIndex: number) => void,
    onStateChange?: (state: AssistantState) => void
  ): Promise<void> {
    // Ensure we're in a browser environment
    if (typeof window === 'undefined') {
      throw new Error('WakeWordService can only be initialized in a browser environment')
    }

    this.onWakeWordDetected = onWakeWordDetected
    this.onStateChange = onStateChange || null

    try {
      // Build keyword configs array
      const keywordConfigs: any[] = []
      
      // Support both single keyword (legacy) and multiple keywords
      const keywords = this.config.keywords || [{
        keywordPath: this.config.keywordPath,
        keywordBase64: this.config.keywordBase64,
        keywordBuiltin: this.config.keywordBuiltin,
        keywordLabel: this.config.keywordLabel,
        sensitivity: this.config.sensitivity
      }]
      
      console.log('🔧 Loading', keywords.length, 'wake word(s)...')
      
      for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i]
        console.log(`📝 Keyword ${i}:`, keyword.keywordLabel || keyword.keywordPath || keyword.keywordBuiltin)
        let keywordConfig: any

        if (keyword.keywordBase64) {
          const label = keyword.keywordLabel || 'custom-wake-word'
          console.log('   ✓ Loading from base64:', label)
          keywordConfig = {
            base64: keyword.keywordBase64,
            label: label,
            sensitivity: keyword.sensitivity || 0.5
          }
        } else if (keyword.keywordPath) {
          const label = keyword.keywordLabel || 'custom-wake-word'
          console.log('   ✓ Loading from path:', keyword.keywordPath)

          const response = await fetch(keyword.keywordPath)
          if (!response.ok) {
            console.error('   ❌ Failed to fetch:', response.status, response.statusText)
            throw new Error(`Failed to fetch wake word file: ${response.status} ${response.statusText}`)
          }
          
          const fileData = await response.arrayBuffer()
          const uint8Array = new Uint8Array(fileData)
          const base64Data = btoa(Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join(''))
          
          console.log('   ✓ Converted to base64, size:', fileData.byteLength, 'bytes')
          
          keywordConfig = {
            base64: base64Data,
            label: label,
            sensitivity: keyword.sensitivity || 0.5
          }
        } else if (keyword.keywordBuiltin) {
          console.log('   ✓ Using built-in:', keyword.keywordBuiltin)
          keywordConfig = {
            builtin: keyword.keywordBuiltin,
            sensitivity: keyword.sensitivity || 0.5
          }
        } else {
          console.warn('   ⚠️ Skipping - no valid keyword source')
          continue
        }
        
        keywordConfigs.push(keywordConfig)
        console.log(`   ✅ Keyword ${i} loaded successfully`)
      }
      
      if (keywordConfigs.length === 0) {
        throw new Error('Must provide at least one keyword')
      }

      console.log('✅ Total keywords loaded:', keywordConfigs.length)

      // Create Porcupine worker for wake word detection
      // Note: PorcupineWorker.create signature:
      // PorcupineWorker.create(accessKey, keywords, keywordDetectionCallback, model, options?)
      // 
      // IMPORTANT: Porcupine requires a model file (.pv) for the engine itself.
      // This is different from the keyword file (.ppn).
      // The model file should be downloaded using: ./scripts/download-porcupine-model.sh
      // Or manually from: https://github.com/Picovoice/porcupine/raw/master/lib/common/porcupine_params.pv
      const porcupineModelPath = '/porcupine_params.pv'
      
      // Verify the model file exists (client-side only)
      try {
        const modelResponse = await fetch(porcupineModelPath, { method: 'HEAD' })
        if (!modelResponse.ok) {
          throw new Error(`Porcupine model file not found at ${porcupineModelPath}. Please run: ./scripts/download-porcupine-model.sh`)
        }
        console.log('✅ Porcupine model file found')
      } catch (fetchError) {
        console.error('❌ Failed to verify Porcupine model file:', fetchError)
        throw new Error(`Porcupine model file not found at ${porcupineModelPath}. Please download it using: ./scripts/download-porcupine-model.sh`)
      }

      const porcupineModel = {
        publicPath: porcupineModelPath
      }

      try {
        this.porcupine = await PorcupineWorker.create(
          this.config.accessKey,
          keywordConfigs,
          (detection) => {
            // Wake word detected callback
            // detection contains: { index: number, label: string }
            console.log('🔔 RAW DETECTION:', JSON.stringify(detection))
            console.log('   - Index:', detection.index)
            console.log('   - Label:', detection.label)
            console.log('   - State:', this.state)
            console.log('   - Suppressed:', this.isSuppressed)
            
            // Accept wake word in idle state, or in any state if not suppressed (allows interruption)
            if (!this.isSuppressed) {
              const wakeWordName = detection.label || this.config.keywordLabel || this.config.keywordBuiltin || 'custom wake word'
              console.log(`🎯 Wake word ACCEPTED: "${wakeWordName}" (index: ${detection.index}, state: ${this.state})`)
              this.setState('listening')
              if (this.onWakeWordDetected) {
                console.log('📞 Calling onWakeWordDetected with index:', detection.index)
                this.onWakeWordDetected(detection.index)
              } else {
                console.warn('⚠️ onWakeWordDetected callback is null!')
              }
            } else {
              console.log('🔇 Wake word REJECTED (suppressed:', this.isSuppressed, ')')
            }
          },
          porcupineModel,
          {
            processErrorCallback: (error) => {
              console.error('Porcupine error:', error)
              if (error instanceof Error) {
                console.error('Porcupine error message:', error.message)
              }
            }
          }
        )
      } catch (porcupineError) {
        // Enhanced error diagnostics
        console.error('❌ Porcupine initialization error details:')
        console.error('   Error type:', porcupineError?.constructor?.name)
        console.error('   Error message:', porcupineError instanceof Error ? porcupineError.message : String(porcupineError))
        if (porcupineError instanceof Error && porcupineError.stack) {
          console.error('   Stack trace:', porcupineError.stack)
        }
        
        // Check for platform mismatch
        const errorMessage = porcupineError instanceof Error ? porcupineError.message : String(porcupineError)
        if (errorMessage.includes('incorrect format') || errorMessage.includes('different platform') || errorMessage.includes('INVALID_ARGUMENT')) {
          const fileInfo = this.config.keywordPath ? `File: ${this.config.keywordPath}` : 'Using base64'
          const helpfulError = new Error(
            `Porcupine keyword file platform/format mismatch!\n\n` +
            `${fileInfo}\n` +
            `Error code: 00000136 (INVALID_ARGUMENT)\n\n` +
            `Possible causes:\n` +
            `1. Wrong platform: File is not for "Web (WASM)" platform\n` +
            `2. Version mismatch: Keyword file version doesn't match Porcupine SDK 3.0.3\n` +
            `3. Corrupted file: File may be corrupted or incomplete\n` +
            `4. File format: File may not be a valid .ppn file\n\n` +
            `Solutions:\n` +
            `1. Go to https://console.picovoice.ai/\n` +
            `2. Navigate to: Porcupine → Custom Wake Words\n` +
            `3. Find your wake word (e.g., "Jarvis")\n` +
            `4. Click "Download"\n` +
            `5. Select platform: "Web (WASM)" ← CRITICAL!\n` +
            `6. Verify file size is 30-100KB (not 3-4KB)\n` +
            `7. Save the file to: public/wake-words/jarvis.ppn\n` +
            `8. Restart dev server\n\n` +
            `Current file size: ${this.config.keywordPath ? 'Check console above' : 'N/A'}\n` +
            `Expected: 30-100KB for Web/WASM\n\n` +
            `Original error: ${errorMessage}`
          )
          console.error('❌', helpfulError.message)
          throw helpfulError
        }
        throw porcupineError
      }

      this.isInitialized = true
      const wakeWordName = this.config.keywordLabel || this.config.keywordBuiltin || this.config.keywordPath
      console.log('✅ Wake word service initialized with:', wakeWordName)
    } catch (error) {
      console.error('Failed to initialize wake word service:', error)
      if (error instanceof Error) {
        console.error('Error details:', error.message)
      }
      throw error
    }
  }

  /**
   * Start listening for wake word
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.porcupine) {
      throw new Error('Wake word service not initialized')
    }

    // Don't restart if already subscribed
    if (this.isSubscribed) {
      console.log('👂 Wake word detection already active')
      // Ensure state is idle if we're subscribed
      if (this.state !== 'idle') {
        this.setState('idle')
      }
      return
    }

    try {
      await WebVoiceProcessor.subscribe(this.porcupine)
      this.isSubscribed = true
      this.setState('idle')
      console.log('👂 Listening for wake word...')
    } catch (error) {
      console.error('Failed to start wake word detection:', error)
      throw error
    }
  }

  /**
   * Stop listening for wake word
   */
  async stop(): Promise<void> {
    if (this.porcupine && this.isSubscribed) {
      await WebVoiceProcessor.unsubscribe(this.porcupine)
      this.isSubscribed = false
      this.setState('idle')
      console.log('🛑 Stopped listening for wake word')
    }
  }

  /**
   * Suppress wake word detection (e.g., during TTS playback)
   * This prevents the assistant from triggering itself
   */
  suppressWakeWord(suppress: boolean): void {
    this.isSuppressed = suppress
    console.log(suppress ? '🔇 Wake word suppressed' : '🔊 Wake word active')
  }

  /**
   * Set the current assistant state
   */
  setState(state: AssistantState): void {
    if (this.state !== state) {
      this.state = state
      console.log('🔄 State changed:', state)
      if (this.onStateChange) {
        this.onStateChange(state)
      }
    }
  }

  /**
   * Get the current assistant state
   */
  getState(): AssistantState {
    return this.state
  }

  /**
   * Check if wake word detection is active
   */
  isActive(): boolean {
    return this.isInitialized && this.state !== 'idle'
  }

  /**
   * Cleanup and release resources
   */
  async cleanup(): Promise<void> {
    if (this.porcupine) {
      await this.stop()
      this.porcupine.terminate()
      this.porcupine = null
    }
    this.isInitialized = false
    this.isSubscribed = false
    this.state = 'idle'
    console.log('🧹 Wake word service cleaned up')
  }

  /**
   * Reset to idle state (ready for next wake word)
   */
  reset(): void {
    this.setState('idle')
  }
}
