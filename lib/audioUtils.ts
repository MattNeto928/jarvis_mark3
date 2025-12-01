/**
 * Audio utilities for capturing and playing audio in the browser
 * Used for OpenAI Realtime API integration
 */

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null; // Fallback
  private onDataAvailable: ((data: string) => void) | null = null;
  private isRecording = false;
  private useWorklet = false;

  async initialize(onData: (data: string) => void) {
    this.onDataAvailable = onData;
    
    // Request microphone access - don't specify sampleRate as it may not be supported
    this.stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } 
    });

    // Create audio context - let browser use its native sample rate
    // We'll resample to 24kHz if needed
    this.audioContext = new AudioContext();
    
    console.log(`AudioContext sample rate: ${this.audioContext.sampleRate}Hz`);
    
    // Create source from microphone stream
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    
    // Try to use AudioWorkletNode for better performance (runs on separate thread)
    // Falls back to ScriptProcessorNode if AudioWorklet is not available
    try {
      await this.audioContext.audioWorklet.addModule('/audio-processor.worklet.js');
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      this.useWorklet = true;
      
      // Handle messages from worklet
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && this.isRecording && this.onDataAvailable) {
          const inputData = event.data.samples;
          
          // Resample to 24kHz if needed
          const resampledData = this.resampleTo24kHz(inputData, this.audioContext!.sampleRate);
          
          // Convert Float32 to Int16 (PCM16)
          const pcm16 = this.floatTo16BitPCM(resampledData);
          
          // Convert to base64
          const base64 = this.arrayBufferToBase64(pcm16.buffer);
          
          // Send to callback
          this.onDataAvailable(base64);
        }
      };
      
      // Connect the audio graph
      this.source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      
      console.log('✅ Using AudioWorkletNode for low-latency audio capture');
    } catch (err) {
      console.warn('⚠️ AudioWorklet not available, falling back to ScriptProcessorNode:', err);
      this.useWorklet = false;
      
      // Fallback to ScriptProcessorNode (deprecated but widely supported)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording || !this.onDataAvailable) return;
        
        // Get the raw audio data (Float32Array from -1 to 1)
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Resample to 24kHz if needed (OpenAI Realtime API requirement)
        const resampledData = this.resampleTo24kHz(inputData, this.audioContext!.sampleRate);
        
        // Convert Float32 to Int16 (PCM16)
        const pcm16 = this.floatTo16BitPCM(resampledData);
        
        // Convert to base64
        const base64 = this.arrayBufferToBase64(pcm16.buffer);
        
        // Send to callback
        this.onDataAvailable(base64);
      };
      
      // Connect the audio graph
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    }
  }

  /**
   * Resample audio data to 24kHz for OpenAI Realtime API
   */
  private resampleTo24kHz(audioData: Float32Array, sourceSampleRate: number): Float32Array {
    // If already at 24kHz, no resampling needed
    if (sourceSampleRate === 24000) {
      return audioData;
    }

    const targetSampleRate = 24000;
    const sampleRateRatio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(audioData.length / sampleRateRatio);
    const result = new Float32Array(newLength);

    // Simple linear interpolation for resampling
    for (let i = 0; i < newLength; i++) {
      const sourceIndex = i * sampleRateRatio;
      const index = Math.floor(sourceIndex);
      const fraction = sourceIndex - index;

      if (index + 1 < audioData.length) {
        // Linear interpolation between two samples
        result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
      } else {
        // Last sample
        result[i] = audioData[index];
      }
    }

    return result;
  }

  /**
   * Convert Float32Array audio samples to Int16Array (PCM16)
   */
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      // Clamp the value between -1 and 1
      const s = Math.max(-1, Math.min(1, input[i]));
      // Convert to 16-bit integer
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  start() {
    this.isRecording = true;
    // Notify worklet to start recording
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'start' });
    }
  }

  stop() {
    this.isRecording = false;
    // Notify worklet to stop recording
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
  }

  cleanup() {
    this.isRecording = false;
    
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.useWorklet = false;
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;

  async initialize() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.nextStartTime = this.audioContext.currentTime;
  }

  /**
   * Play PCM16 audio data from the Realtime API
   * The data is raw 16-bit PCM at 24kHz
   */
  async playPCM16(pcm16Data: Int16Array) {
    if (!this.audioContext || !this.gainNode) {
      console.error('AudioPlayer not initialized');
      return;
    }

    try {
      // Create an audio buffer for the PCM16 data
      const audioBuffer = this.audioContext.createBuffer(
        1, // mono
        pcm16Data.length,
        24000 // 24kHz sample rate
      );

      // Convert Int16 PCM to Float32 for Web Audio API
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16Data.length; i++) {
        // Convert from Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
        channelData[i] = pcm16Data[i] / (pcm16Data[i] < 0 ? 32768 : 32767);
      }

      // Create a buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Schedule for seamless playback
      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this.nextStartTime);
      
      source.start(startTime);
      
      // Update next start time for seamless audio
      this.nextStartTime = startTime + audioBuffer.duration;

      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    } catch (error) {
      console.error('Error playing PCM16 audio:', error);
    }
  }

  /**
   * Reset playback timing (call when starting a new conversation)
   */
  reset() {
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
  }
}

/**
 * Convert base64 audio to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert base64 PCM16 audio to Int16Array
 * Used for Realtime API audio responses
 */
export function base64ToPCM16(base64: string): Int16Array {
  const arrayBuffer = base64ToArrayBuffer(base64);
  return new Int16Array(arrayBuffer);
}

