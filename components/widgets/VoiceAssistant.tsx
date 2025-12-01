'use client'

import { useState, useEffect, useRef } from 'react'
import { RealtimeClient, type ConnectionStatus, type RealtimeEvent } from '@/lib/realtimeClient'
import { EnhancedAudioRecorder, EnhancedAudioPlayer, base64ToPCM16 } from '@/lib/audioUtilsEnhanced'
import { WakeWordService, type AssistantState } from '@/lib/wakeWordService'
import { parseMultipleIoTCommands } from '@/lib/iotTypes'
import { IoTController } from '@/lib/iotController'
import { TTSService } from '@/lib/ttsService'

type Voice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar'

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false)
  const [assistantState, setAssistantState] = useState<AssistantState>('idle')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [apiKey, setApiKey] = useState('')
  const [picovoiceKey, setPicovoiceKey] = useState('')
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const userTranscriptRef = useRef('')
  const commitTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioBufferRef = useRef<string[]>([])
  const isPlayingAudioRef = useRef(false)
  const audioPlaybackPromiseRef = useRef<Promise<void> | null>(null)
  const isProcessingResponseRef = useRef(false)
  const [selectedVoice] = useState<Voice>('alloy')
  const wakeWordPath = '/wake-words/jarvis.ppn'
  const wakeWordLabel = 'Jarvis'
  const [devices, setDevices] = useState<Array<{ id: string; name: string; type: string; room?: string }>>([])

  const realtimeClientRef = useRef<RealtimeClient | null>(null)
  const audioRecorderRef = useRef<EnhancedAudioRecorder | null>(null)
  const audioPlayerRef = useRef<EnhancedAudioPlayer | null>(null)
  const wakeWordServiceRef = useRef<WakeWordService | null>(null)
  const ttsServiceRef = useRef<TTSService | null>(null)
  const isExecutingCommandRef = useRef(false)
  const accumulatedTranscriptRef = useRef('')
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const envPicovoiceKey = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
    const storedApiKey = localStorage.getItem('openai_api_key')
    const storedPicovoiceKey = localStorage.getItem('picovoice_access_key')

    if (storedApiKey) setApiKey(storedApiKey)
    const picovoiceKey = envPicovoiceKey || storedPicovoiceKey
    if (picovoiceKey) setPicovoiceKey(picovoiceKey)

    const storedDevices = localStorage.getItem('iot_devices')
    if (storedDevices) {
      try {
        setDevices(JSON.parse(storedDevices))
      } catch (e) {
        console.error('Error loading devices:', e)
      }
    }

    if (storedApiKey && picovoiceKey) {
      handleConnect()
    }
  }, [])

  useEffect(() => {
    if (!isConnected && apiKey && picovoiceKey) {
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Auto-reconnecting...')
        handleConnect()
      }, 5000)
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [isConnected, apiKey, picovoiceKey])

  const handleConnect = async () => {
    if (!apiKey || !picovoiceKey) return

    try {
      localStorage.setItem('openai_api_key', apiKey)
      localStorage.setItem('picovoice_access_key', picovoiceKey)

      wakeWordServiceRef.current = new WakeWordService({
        accessKey: picovoiceKey,
        keywords: [
          {
            keywordPath: wakeWordPath,
            keywordLabel: wakeWordLabel,
            sensitivity: 0.5
          },
          {
            keywordPath: '/wake-words/jarvis-lights_en_wasm_v3_0_0.ppn',
            keywordLabel: 'Jarvis Lights',
            sensitivity: 0.5
          }
        ]
      })

      await wakeWordServiceRef.current.initialize(handleWakeWordDetected, handleStateChange)
      audioRecorderRef.current = new EnhancedAudioRecorder(30000)
      audioPlayerRef.current = new EnhancedAudioPlayer()
      ttsServiceRef.current = new TTSService(apiKey)

      await audioRecorderRef.current.initializeWithTimeout(
        (base64Audio) => {
          if (realtimeClientRef.current?.isConnected() && audioRecorderRef.current) {
            realtimeClientRef.current.sendAudio(base64Audio)
            if (audioRecorderRef.current) {
              (audioRecorderRef.current as any).resetTimeout?.()
            }
          }
        },
        handleRecordingTimeout,
        30000
      )

      await audioPlayerRef.current.initializeWithCallbacks(handleAudioPlaybackStart, handleAudioPlaybackEnd)

      realtimeClientRef.current = new RealtimeClient(apiKey, 'gpt-4o-realtime-preview-2024-12-17', selectedVoice, devices)

      realtimeClientRef.current.connect(
        handleRealtimeEvent,
        (status) => {
          setConnectionStatus(status)
          if (status === 'connected') {
            setIsConnected(true)
            wakeWordServiceRef.current?.start()
          } else {
            setIsConnected(false)
          }
        }
      )
    } catch (err) {
      console.error('❌ Connection error:', err)
    }
  }

  const handleWakeWordDetected = (keywordIndex: number) => {
    console.log('🎤 handleWakeWordDetected called with index:', keywordIndex)
    console.log('   - isProcessingResponse:', isProcessingResponseRef.current)
    
    if (isProcessingResponseRef.current) {
      console.log('⏭️ Skipping - already processing response')
      return
    }
    
    // Index 0: "jarvis" - normal voice assistant
    // Index 1: "jarvis lights" - toggle lights directly
    if (keywordIndex === 1) {
      console.log('💡 JARVIS LIGHTS detected - toggling lights directly!')
      setCurrentTranscript('Toggling lights...')
      IoTController.toggleLights().then(result => {
        console.log('💡 Toggle result:', result)
        setCurrentTranscript(result.message)
        setTimeout(() => setCurrentTranscript(''), 2000)
      }).catch(err => {
        console.error('❌ Toggle lights error:', err)
        setCurrentTranscript('Failed to toggle lights')
        setTimeout(() => setCurrentTranscript(''), 2000)
      })
      wakeWordServiceRef.current?.reset()
      return
    }
    
    console.log('🎙️ JARVIS detected - starting normal recording flow')
    setCurrentTranscript('Wake word detected...')
    startRecording()
  }

  const handleStateChange = (state: AssistantState) => {
    setAssistantState(state)
  }

  const handleRecordingTimeout = () => {
    if (realtimeClientRef.current?.isConnected() && assistantState === 'listening') {
      realtimeClientRef.current.commitAudio()
    }
    stopRecording()
  }

  const handleAudioPlaybackStart = () => {
    wakeWordServiceRef.current?.suppressWakeWord(true)
    wakeWordServiceRef.current?.setState('speaking')
  }

  const handleAudioPlaybackEnd = () => {
    wakeWordServiceRef.current?.suppressWakeWord(false)
    if (!isProcessingResponseRef.current) {
      const currentState = wakeWordServiceRef.current?.getState()
      if (currentState === 'speaking') {
        wakeWordServiceRef.current?.setState('idle')
      }
    }
  }

  const startRecording = () => {
    if (audioRecorderRef.current && realtimeClientRef.current?.isConnected()) {
      if (!isProcessingResponseRef.current) {
        audioRecorderRef.current.start()
        const currentState = wakeWordServiceRef.current?.getState()
        if (currentState === 'idle') {
          wakeWordServiceRef.current?.setState('listening')
        }
      }
    }
  }

  const stopRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop()
    }
  }

  const handleRealtimeEvent = async (event: RealtimeEvent) => {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        userTranscriptRef.current = ''
        setCurrentTranscript('Listening...')
        if (audioRecorderRef.current) {
          (audioRecorderRef.current as any).resetTimeout?.()
        }
        break

      case 'conversation.item.input_audio_transcription.delta':
        if (event.delta) {
          userTranscriptRef.current += event.delta
          setCurrentTranscript(userTranscriptRef.current)
        }
        break

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          userTranscriptRef.current = event.transcript
          setCurrentTranscript(event.transcript)
        }
        break

      case 'response.output_item.added':
        isProcessingResponseRef.current = true
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
          commitTimeoutRef.current = null
        }
        if (isPlayingAudioRef.current && audioPlayerRef.current) {
          audioPlayerRef.current.reset()
          isPlayingAudioRef.current = false
          audioPlaybackPromiseRef.current = null
        }
        if (audioPlayerRef.current) {
          audioPlayerRef.current.reset()
          isExecutingCommandRef.current = false
        }
        audioBufferRef.current = []
        accumulatedTranscriptRef.current = ''
        if (audioRecorderRef.current) {
          audioRecorderRef.current.stop()
        }
        if (wakeWordServiceRef.current?.getState() !== 'processing') {
          wakeWordServiceRef.current?.setState('processing')
        }
        break

      case 'input_audio_buffer.speech_stopped':
        setCurrentTranscript(userTranscriptRef.current || 'Processing...')
        if (!isProcessingResponseRef.current && wakeWordServiceRef.current?.getState() !== 'processing') {
          wakeWordServiceRef.current?.setState('processing')
        }
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
        }
        if (!isProcessingResponseRef.current) {
          commitTimeoutRef.current = setTimeout(() => {
            if (!isProcessingResponseRef.current && realtimeClientRef.current?.isConnected()) {
              realtimeClientRef.current.commitAudio()
              realtimeClientRef.current.createResponse()
            }
            commitTimeoutRef.current = null
          }, 200)
        }
        break

      case 'response.audio_transcript.delta':
        if (event.delta) {
          accumulatedTranscriptRef.current += event.delta
          const accumulated = accumulatedTranscriptRef.current
          const hasJsonStart = accumulated.includes('{"type"') || accumulated.includes('{ "type"') || (accumulated.includes('{') && accumulated.includes('"type"'))
          if (hasJsonStart && !isExecutingCommandRef.current) {
            isExecutingCommandRef.current = true
            if (audioPlayerRef.current) {
              audioPlayerRef.current.reset()
            }
          }
        }
        break

      case 'response.audio_transcript.done':
        if (event.transcript) {
          const iotCommands = parseMultipleIoTCommands(event.transcript)
          if (iotCommands.length > 0) {
            if (!isExecutingCommandRef.current) {
              isExecutingCommandRef.current = true
              if (audioPlayerRef.current) {
                audioPlayerRef.current.reset()
              }
            }
            const extractFriendlyMessage = (transcript: string): string => {
              const withoutJson = transcript.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').trim()
              return withoutJson || `Executed ${iotCommands.length} command${iotCommands.length > 1 ? 's' : ''}`
            }
            const friendlyMessage = extractFriendlyMessage(event.transcript)
            const responseText = friendlyMessage
            setLastResponse(responseText)
            setCurrentTranscript('')
            const ttsPromise = ttsServiceRef.current ? (async () => {
              try {
                wakeWordServiceRef.current?.suppressWakeWord(true)
                wakeWordServiceRef.current?.setState('speaking')
                await ttsServiceRef.current.speakText(responseText, { voice: 'alloy', speed: 1.1 })
                wakeWordServiceRef.current?.suppressWakeWord(false)
                if (!isProcessingResponseRef.current) {
                  wakeWordServiceRef.current?.reset()
                }
              } catch (err) {
                console.error('TTS error:', err)
                wakeWordServiceRef.current?.suppressWakeWord(false)
                if (!isProcessingResponseRef.current) {
                  wakeWordServiceRef.current?.reset()
                }
              }
            })() : Promise.resolve()
            const commandPromise = Promise.all(iotCommands.map(async (cmd) => {
              const result = await IoTController.executeCommand(cmd)
              return result
            })).then(async () => {
              isExecutingCommandRef.current = false
              await ttsPromise
              if (!isProcessingResponseRef.current) {
                wakeWordServiceRef.current?.reset()
              }
            }).catch(async err => {
              console.error('❌ Error executing commands:', err)
              isExecutingCommandRef.current = false
              await ttsPromise
              if (!isProcessingResponseRef.current) {
                wakeWordServiceRef.current?.reset()
              }
            })
            commandPromise.catch(err => {
              console.error('Command execution error:', err)
            })
          } else {
            if (isExecutingCommandRef.current) {
              isExecutingCommandRef.current = false
            }
            setLastResponse(event.transcript)
            setCurrentTranscript('')
          }
        }
        break

      case 'response.audio.delta':
        if (event.delta) {
          if (!isExecutingCommandRef.current) {
            audioBufferRef.current.push(event.delta)
          }
        }
        break

      case 'response.audio.done':
        if (audioBufferRef.current.length > 0 && audioPlayerRef.current && !isExecutingCommandRef.current && !isPlayingAudioRef.current) {
          isPlayingAudioRef.current = true
          audioPlayerRef.current.reset()
          wakeWordServiceRef.current?.suppressWakeWord(true)
          wakeWordServiceRef.current?.setState('speaking')
          const bufferToPlay = [...audioBufferRef.current]
          audioBufferRef.current = []
          const playBufferedAudio = async () => {
            try {
              for (const chunk of bufferToPlay) {
                if (!isPlayingAudioRef.current) break
                const pcm16Data = base64ToPCM16(chunk)
                await audioPlayerRef.current!.playPCM16(pcm16Data)
              }
              isPlayingAudioRef.current = false
              audioPlaybackPromiseRef.current = null
              wakeWordServiceRef.current?.suppressWakeWord(false)
              if (!isProcessingResponseRef.current) {
                const currentState = wakeWordServiceRef.current?.getState()
                if (currentState === 'speaking') {
                  wakeWordServiceRef.current?.setState('idle')
                }
              }
            } catch (err) {
              console.error('Error playing buffered audio:', err)
              isPlayingAudioRef.current = false
              audioPlaybackPromiseRef.current = null
              wakeWordServiceRef.current?.suppressWakeWord(false)
              if (!isProcessingResponseRef.current) {
                const currentState = wakeWordServiceRef.current?.getState()
                if (currentState === 'speaking') {
                  wakeWordServiceRef.current?.setState('idle')
                }
              }
            }
          }
          audioPlaybackPromiseRef.current = playBufferedAudio()
        } else {
          audioBufferRef.current = []
        }
        break

      case 'response.done':
        isProcessingResponseRef.current = false
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
          commitTimeoutRef.current = null
        }
        if (!isExecutingCommandRef.current && !isPlayingAudioRef.current) {
          const currentState = wakeWordServiceRef.current?.getState()
          if (currentState === 'processing' || currentState === 'listening') {
            wakeWordServiceRef.current?.reset()
            if (wakeWordServiceRef.current) {
              wakeWordServiceRef.current.start().catch(err => {
                console.error('Failed to restart wake word detection:', err)
              })
            }
          }
        }
        accumulatedTranscriptRef.current = ''
        userTranscriptRef.current = ''
        setCurrentTranscript('')
        break
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full transition-all duration-700 ${
        isConnected ? 'bg-emerald-500 saturate-100' : 'bg-gray-500 saturate-0'
      }`}></div>
      <span className={`text-sm font-light transition-all duration-700 ${
        isConnected ? 'text-emerald-400 saturate-100' : 'text-gray-500 saturate-0'
      }`}>
        jarvis {isConnected ? 'online' : 'offline'}
      </span>
    </div>
  )
}
