import type { JarvisSessionConfig } from './jarvisAgent'

type RealtimeEvent = {
  type: string
  [key: string]: any
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: any
}

export type RealtimeWebRTCClientOptions = {
  instructions: string
  sessionConfig: JarvisSessionConfig
  onEvent?: (event: RealtimeEvent) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
  tools?: ToolDefinition[]
}

function buildSessionPayload(
  instructions: string,
  config: JarvisSessionConfig,
  tools?: ToolDefinition[]
) {
    const session: Record<string, any> = {
    instructions,
    }

    // NOTE: tool registration is handled inside VoiceAssistant.tsx by sending tool.add messages

  if (config.turnDetection) {
    session.turn_detection = {
      type: config.turnDetection.type,
      threshold: config.turnDetection.threshold,
      prefix_padding_ms: (config.turnDetection as any).prefix_padding_ms,
      silence_duration_ms: (config.turnDetection as any).silence_duration_ms,
      create_response: config.turnDetection.createResponse,
      interrupt_response: config.turnDetection.interruptResponse,
      eagerness: config.turnDetection.eagerness,
    }
  }

  if (config.inputAudioFormat) {
    session.input_audio_format = config.inputAudioFormat
  }

  if (config.outputAudioFormat) {
    session.output_audio_format = config.outputAudioFormat
  }

  if (config.inputAudioTranscription) {
    session.input_audio_transcription = config.inputAudioTranscription
  }

  if (typeof config.temperature === 'number') {
    session.temperature = config.temperature
  }

  if (config.maxResponseOutputTokens) {
    session.max_response_output_tokens = config.maxResponseOutputTokens
  }

  const payload = {
    type: 'session.update',
    session,
  }

  if (tools && tools.length > 0) {
    payload.session.tools = tools.map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
    // Enable automatic tool selection
    payload.session.tool_choice = 'auto'
  }

  return payload
}

export class RealtimeWebRTCClient {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private localStream: MediaStream | null = null
  private remoteAudio: HTMLAudioElement | null = null

  constructor(private options: RealtimeWebRTCClientOptions) {}

  async connect(ephemeralKey: string) {
    if (typeof window === 'undefined') {
      throw new Error('RealtimeWebRTCClient can only run in browser')
    }

    this.pc = new RTCPeerConnection()
    this.remoteAudio = new Audio()
    this.remoteAudio.autoplay = true
    this.remoteAudio.playsInline = true
    this.remoteAudio.playbackRate = 1.15 // Speed up audio slightly

    this.dc = this.pc.createDataChannel('oai-events')
    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.options.onEvent?.(data)
      } catch (error) {
        console.error('Failed to parse realtime event', error)
      }
    }

    this.dc.onopen = () => {
      const payload = buildSessionPayload(this.options.instructions, this.options.sessionConfig, this.options.tools)
      console.log('🔌 WebRTC Data Channel open, sending session update')
      console.log('🧰 Tools being registered:', this.options.tools?.map(t => t.name))
      console.log('🧰 Full tool payload:', JSON.stringify(payload.session.tools, null, 2))
      this.send(payload)

      // NOTE: We send tools in session.update above, but sending tool.add is also supported
      // However, sending both might be redundant. Let's stick to session.update for now.
      /*
      if (this.options.tools && this.options.tools.length > 0) {
        for (const tool of this.options.tools) {
          this.send({
            type: 'tool.add',
            tool: {
              type: 'function',
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })
        }
      }
      */

      this.options.onOpen?.()
    }

    this.dc.onerror = () => {
      this.options.onError?.(new Error('Realtime data channel error'))
    }

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return
      const state = this.pc.connectionState
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.options.onClose?.()
      }
    }

    this.pc.ontrack = (event) => {
      if (!this.remoteAudio) return
      try {
        this.remoteAudio.srcObject = event.streams[0]
        void this.remoteAudio.play()
      } catch (error) {
        console.error('Failed to play remote audio', error)
      }
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = false
      this.pc?.addTrack(track, this.localStream!)
    })

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: offer.sdp ?? undefined,
    })

    const answerSdp = await response.text()
    if (!response.ok) {
      throw new Error(answerSdp || `Realtime call failed: ${response.status}`)
    }

    await this.pc.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    })
  }

  send(message: any) {
    if (!this.dc || this.dc.readyState !== 'open') return
    this.dc.send(JSON.stringify(message))
  }

  sendFunctionCallOutput(callId: string, output: any, startResponse: boolean = true) {
    if (!callId) {
      console.warn('⚠️ Missing callId for function call output')
      return
    }

    const outputString = typeof output === 'string' ? output : JSON.stringify(output)

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: outputString,
      },
    })

    if (startResponse) {
      this.send({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
        },
      })
    }
  }

  interruptAudio() {
    if (this.remoteAudio) {
      this.remoteAudio.pause()
      // Resetting time might be good if we resume later with new content
      this.remoteAudio.currentTime = 0
    }
    this.send({ type: 'response.cancel' })
  }

  muteAudio() {
    if (this.remoteAudio) {
      this.remoteAudio.muted = true
    }
  }

  setPlaybackRate(rate: number) {
    if (this.remoteAudio) {
      this.remoteAudio.playbackRate = rate
    }
  }

  resumeAudio() {
    if (this.remoteAudio) {
      this.remoteAudio.muted = false
      if (this.remoteAudio.paused) {
        this.remoteAudio.play().catch(err => console.error('Failed to resume audio:', err))
      }
    }
  }

  setMicrophoneEnabled(enabled: boolean) {
    if (!this.localStream) return
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled
    })
  }

  disconnect() {
    this.dc?.close()
    this.pc?.close()
    this.localStream?.getTracks().forEach(track => track.stop())
    if (this.remoteAudio) {
      this.remoteAudio.pause()
      this.remoteAudio.srcObject = null
    }
    this.dc = null
    this.pc = null
    this.localStream = null
    this.remoteAudio = null
  }
}

