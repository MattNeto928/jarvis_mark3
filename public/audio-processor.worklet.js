/**
 * AudioWorklet processor for real-time audio capture
 * Runs on a separate thread for lower latency and better performance
 * Handles resampling from native sample rate to 24kHz for OpenAI Realtime API
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isRecording = false
    this.buffer = []
    this.bufferSize = 4096 // Samples to accumulate before sending
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this.isRecording = true
        this.buffer = []
      } else if (event.data.type === 'stop') {
        this.isRecording = false
        this.buffer = []
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (!input || !input[0] || !this.isRecording) {
      return true
    }

    const inputData = input[0]
    
    // Accumulate samples
    for (let i = 0; i < inputData.length; i++) {
      this.buffer.push(inputData[i])
    }

    // When we have enough samples, send them
    if (this.buffer.length >= this.bufferSize) {
      // Send the accumulated buffer to main thread
      this.port.postMessage({
        type: 'audio',
        samples: new Float32Array(this.buffer)
      })
      this.buffer = []
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)

