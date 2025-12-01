/**
 * Enhanced audio utilities with wake word integration
 * Prevents always-listening issues and TTS interference
 */

import { AudioRecorder as BaseAudioRecorder, AudioPlayer as BaseAudioPlayer } from './audioUtils'

/**
 * Enhanced Audio Recorder with timeout support
 * Automatically stops recording after a period of silence
 */
export class EnhancedAudioRecorder extends BaseAudioRecorder {
  private timeoutId: NodeJS.Timeout | null = null
  private onTimeout: (() => void) | null = null
  private silenceTimeout: number

  constructor(silenceTimeout = 8000) { // 8 seconds default
    super()
    this.silenceTimeout = silenceTimeout
  }

  /**
   * Initialize with timeout callback
   */
  async initializeWithTimeout(
    onData: (data: string) => void,
    onTimeout: () => void,
    silenceTimeout?: number
  ) {
    this.onTimeout = onTimeout
    if (silenceTimeout) {
      this.silenceTimeout = silenceTimeout
    }
    await this.initialize(onData)
  }

  /**
   * Start recording with automatic timeout
   */
  start() {
    super.start()
    this.resetTimeout()
  }

  /**
   * Stop recording and clear timeout
   */
  stop() {
    super.stop()
    this.clearTimeout()
  }

  /**
   * Reset the silence timeout
   * Call this when audio activity is detected
   * This is a fallback - OpenAI's server-side VAD should handle turn detection
   */
  resetTimeout() {
    this.clearTimeout()
    this.timeoutId = setTimeout(() => {
      console.log('⏱️ Recording timeout (fallback) - OpenAI VAD should have handled this')
      this.stop()
      if (this.onTimeout) {
        this.onTimeout()
      }
    }, this.silenceTimeout)
  }

  /**
   * Clear the timeout
   */
  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.clearTimeout()
    super.cleanup()
  }
}

/**
 * Enhanced Audio Player with suppression support
 * Prevents audio playback when needed (e.g., during wake word listening)
 */
export class EnhancedAudioPlayer extends BaseAudioPlayer {
  private isSuppressed = false
  private onPlaybackStart: (() => void) | null = null
  private onPlaybackEnd: (() => void) | null = null
  private activeSourcesCount = 0

  /**
   * Initialize with playback callbacks
   */
  async initializeWithCallbacks(
    onPlaybackStart?: () => void,
    onPlaybackEnd?: () => void
  ) {
    this.onPlaybackStart = onPlaybackStart || null
    this.onPlaybackEnd = onPlaybackEnd || null
    await this.initialize()
  }

  /**
   * Suppress audio playback
   */
  suppress(suppress: boolean) {
    this.isSuppressed = suppress
    console.log(suppress ? '🔇 Audio playback suppressed' : '🔊 Audio playback active')
  }

  /**
   * Play PCM16 audio with suppression check
   */
  async playPCM16(pcm16Data: Int16Array) {
    if (this.isSuppressed) {
      console.log('🔇 Audio playback blocked (suppressed)')
      return
    }

    // Notify playback start on first chunk
    if (this.activeSourcesCount === 0 && this.onPlaybackStart) {
      this.onPlaybackStart()
    }

    this.activeSourcesCount++

    try {
      await super.playPCM16(pcm16Data)
    } finally {
      this.activeSourcesCount--

      // Notify playback end when all chunks finished
      if (this.activeSourcesCount === 0 && this.onPlaybackEnd) {
        this.onPlaybackEnd()
      }
    }
  }

  /**
   * Reset playback
   */
  reset() {
    super.reset()
    this.activeSourcesCount = 0
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return this.activeSourcesCount > 0
  }
}

/**
 * Streaming Audio Player - plays audio chunks immediately as they arrive
 * Optimized for low-latency streaming from Realtime API
 */
export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private nextStartTime: number = 0
  private isPlaying = false
  private onPlaybackStart: (() => void) | null = null
  private onPlaybackEnd: (() => void) | null = null
  private pendingChunks = 0
  private completionCallback: (() => void) | null = null
  private streamComplete = false

  /**
   * Initialize the streaming audio player
   */
  async initialize(
    onPlaybackStart?: () => void,
    onPlaybackEnd?: () => void
  ): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: 24000 })
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)
    this.nextStartTime = this.audioContext.currentTime
    this.onPlaybackStart = onPlaybackStart || null
    this.onPlaybackEnd = onPlaybackEnd || null
  }

  /**
   * Queue audio chunk for immediate playback
   * Chunks are played back-to-back with no gap for seamless audio
   */
  queueAudio(pcm16Data: Int16Array): void {
    if (!this.audioContext || !this.gainNode) {
      console.error('StreamingAudioPlayer not initialized')
      return
    }

    // Notify playback start on first chunk
    if (!this.isPlaying) {
      this.isPlaying = true
      this.streamComplete = false
      if (this.onPlaybackStart) {
        this.onPlaybackStart()
      }
    }

    this.pendingChunks++

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      1, // mono
      pcm16Data.length,
      24000 // 24kHz sample rate
    )

    // Convert Int16 PCM to Float32 for Web Audio API
    const channelData = audioBuffer.getChannelData(0)
    for (let i = 0; i < pcm16Data.length; i++) {
      channelData[i] = pcm16Data[i] / (pcm16Data[i] < 0 ? 32768 : 32767)
    }

    // Create buffer source and schedule for seamless playback
    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.gainNode)

    // Schedule playback - use current time if we've fallen behind
    const currentTime = this.audioContext.currentTime
    const startTime = Math.max(currentTime, this.nextStartTime)
    
    source.start(startTime)
    this.nextStartTime = startTime + audioBuffer.duration

    // Track when this chunk finishes
    source.onended = () => {
      this.pendingChunks--
      this.checkPlaybackComplete()
    }
  }

  /**
   * Register callback for when all queued audio has finished playing
   */
  onPlaybackComplete(callback: () => void): void {
    this.streamComplete = true
    this.completionCallback = callback
    this.checkPlaybackComplete()
  }

  /**
   * Check if all audio has finished playing
   */
  private checkPlaybackComplete(): void {
    if (this.streamComplete && this.pendingChunks === 0 && this.isPlaying) {
      this.isPlaying = false
      if (this.onPlaybackEnd) {
        this.onPlaybackEnd()
      }
      if (this.completionCallback) {
        this.completionCallback()
        this.completionCallback = null
      }
    }
  }

  /**
   * Reset the player for a new response
   */
  reset(): void {
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime
    }
    this.pendingChunks = 0
    this.isPlaying = false
    this.streamComplete = false
    this.completionCallback = null
  }

  /**
   * Set playback volume
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume
    }
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.gainNode = null
    this.pendingChunks = 0
    this.isPlaying = false
  }
}

// Re-export base utilities
export { base64ToPCM16, base64ToArrayBuffer } from './audioUtils'
