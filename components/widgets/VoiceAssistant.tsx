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
  const [isConfigured, setIsConfigured] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [commandNotification, setCommandNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null)
  const userTranscriptRef = useRef('') // Accumulate user's real-time transcription
  const commitTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Store commit timeout
  const audioBufferRef = useRef<string[]>([]) // Buffer audio chunks instead of streaming
  const isPlayingAudioRef = useRef(false) // Track if audio is currently playing
  const audioPlaybackPromiseRef = useRef<Promise<void> | null>(null) // Track playback promise
  const isProcessingResponseRef = useRef(false) // Track if we're currently processing a response
  const [selectedVoice] = useState<Voice>('alloy')
  // Path to custom wake word .ppn file in public directory
  const wakeWordPath = '/wake-words/jarvis.ppn'
  const wakeWordLabel = 'Jarvis'
  const [devices, setDevices] = useState<Array<{ id: string; name: string; type: string; room?: string }>>([])
  const [showSetup, setShowSetup] = useState(false)

  const realtimeClientRef = useRef<RealtimeClient | null>(null)
  const audioRecorderRef = useRef<EnhancedAudioRecorder | null>(null)
  const audioPlayerRef = useRef<EnhancedAudioPlayer | null>(null)
  const wakeWordServiceRef = useRef<WakeWordService | null>(null)
  const ttsServiceRef = useRef<TTSService | null>(null)
  const isExecutingCommandRef = useRef(false)
  const accumulatedTranscriptRef = useRef('')

  useEffect(() => {
    // Try to load from environment variables first, then fall back to localStorage
    const envPicovoiceKey = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
    const storedApiKey = localStorage.getItem('openai_api_key')
    const storedPicovoiceKey = localStorage.getItem('picovoice_access_key')

    console.log('🔍 Loading configuration...')
    console.log('Environment Picovoice Key:', envPicovoiceKey ? `${envPicovoiceKey.substring(0, 10)}...` : 'not found')
    console.log('Stored API Key:', storedApiKey ? 'found' : 'not found')
    console.log('Stored Picovoice Key:', storedPicovoiceKey ? 'found' : 'not found')

    // Set API key
    if (storedApiKey) {
      setApiKey(storedApiKey)
    }

    // Set Picovoice key (prefer environment variable)
    const picovoiceKey = envPicovoiceKey || storedPicovoiceKey
    if (picovoiceKey) {
      setPicovoiceKey(picovoiceKey)
      console.log('✅ Using Picovoice key from:', envPicovoiceKey ? 'environment' : 'localStorage')
    } else {
      console.log('⚠️ No Picovoice key found')
    }

    // Auto-configure if both keys are available
    if (storedApiKey && picovoiceKey) {
      setIsConfigured(true)
      console.log('✅ Auto-configured with both keys')
    }

    // Load IoT devices for AI instructions
    const storedDevices = localStorage.getItem('iot_devices')
    if (storedDevices) {
      try {
        setDevices(JSON.parse(storedDevices))
      } catch (e) {
        console.error('Error loading devices:', e)
      }
    }
  }, [])

  const handleConnect = async () => {
    if (!apiKey || !picovoiceKey) {
      alert('Please enter both OpenAI API Key and Picovoice Access Key')
      return
    }

    console.log('🔌 Starting connection process...')
    console.log('API Key present:', !!apiKey)
    console.log('Picovoice Key present:', !!picovoiceKey)
    console.log('Picovoice Key length:', picovoiceKey.length)

    try {
      localStorage.setItem('openai_api_key', apiKey)
      localStorage.setItem('picovoice_access_key', picovoiceKey)

      // Initialize wake word service
      console.log('🎯 Initializing wake word service...')
      wakeWordServiceRef.current = new WakeWordService({
        accessKey: picovoiceKey,
        keywordPath: wakeWordPath,
        keywordLabel: wakeWordLabel,
        sensitivity: 0.5
      })

      try {
        await wakeWordServiceRef.current.initialize(
          handleWakeWordDetected,
          handleStateChange
        )
        console.log('✅ Wake word service initialized successfully')
      } catch (wakeWordError) {
        console.error('❌ Wake word service initialization failed:', wakeWordError)
        throw new Error(`Wake word initialization failed: ${wakeWordError instanceof Error ? wakeWordError.message : String(wakeWordError)}`)
      }

      // Initialize enhanced audio components
      console.log('🎤 Initializing audio recorder...')
      // Increased timeout to 30 seconds as fallback - OpenAI VAD should handle turn detection
      audioRecorderRef.current = new EnhancedAudioRecorder(30000) // 30 second fallback timeout
      audioPlayerRef.current = new EnhancedAudioPlayer()
      ttsServiceRef.current = new TTSService(apiKey)

      try {
        await audioRecorderRef.current.initializeWithTimeout(
          (base64Audio) => {
            // Continuously stream audio to OpenAI - it will handle VAD and turn detection
            // Stream audio whenever recorder is active and WebSocket is connected
            if (realtimeClientRef.current?.isConnected() && audioRecorderRef.current) {
              // Log first few audio chunks to verify streaming
              if (!(window as any).audioChunkCount) {
                (window as any).audioChunkCount = 0
              }
              if ((window as any).audioChunkCount < 5) {
                console.log('📤 Sending audio chunk', (window as any).audioChunkCount++, 'size:', base64Audio.length)
              }
              realtimeClientRef.current.sendAudio(base64Audio)
              // Reset timeout on each audio chunk (indicates activity)
              // This is a fallback - OpenAI's server-side VAD should detect silence first
              if (audioRecorderRef.current) {
                (audioRecorderRef.current as any).resetTimeout?.()
              }
            } else {
              console.warn('⚠️ Audio chunk skipped - WebSocket not connected or recorder inactive')
            }
          },
          handleRecordingTimeout,
          30000  // Fallback timeout - OpenAI VAD should trigger first
        )
        console.log('✅ Audio recorder initialized successfully')
        console.log('   Using OpenAI server-side VAD for natural turn detection')
        console.log('   Fallback timeout: 30 seconds (should not be needed)')
      } catch (audioError) {
        console.error('❌ Audio recorder initialization failed:', audioError)
        throw new Error(`Audio recorder initialization failed: ${audioError instanceof Error ? audioError.message : String(audioError)}`)
      }

      console.log('🔊 Initializing audio player...')
      await audioPlayerRef.current.initializeWithCallbacks(
        handleAudioPlaybackStart,
        handleAudioPlaybackEnd
      )
      console.log('✅ Audio player initialized successfully')

      console.log('🌐 Connecting to OpenAI Realtime API...')
      realtimeClientRef.current = new RealtimeClient(apiKey, 'gpt-4o-realtime-preview-2024-12-17', selectedVoice, devices)

      realtimeClientRef.current.connect(
        handleRealtimeEvent,
        (status) => {
          console.log('📡 Connection status changed:', status)
          setConnectionStatus(status)
          if (status === 'connected') {
            setIsConnected(true)
            console.log('👂 Starting wake word detection...')
            // Start listening for wake word
            wakeWordServiceRef.current?.start()
          } else {
            setIsConnected(false)
          }
        }
      )
      setShowSetup(false)
    } catch (err) {
      console.error('❌ Connection error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      alert(`Failed to connect: ${errorMessage}\n\nPlease check the browser console for details.`)
    }
  }

  const handleDisconnect = async () => {
    if (assistantState === 'listening') {
      stopRecording()
    }
    // Stop any playing audio
    if (isPlayingAudioRef.current && audioPlayerRef.current) {
      audioPlayerRef.current.reset()
      isPlayingAudioRef.current = false
      audioPlaybackPromiseRef.current = null
    }
    // Clear timeouts
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current)
      commitTimeoutRef.current = null
    }
    // Reset processing flag
    isProcessingResponseRef.current = false
    await wakeWordServiceRef.current?.cleanup()
    realtimeClientRef.current?.disconnect()
    audioRecorderRef.current?.cleanup()
    audioPlayerRef.current?.cleanup()
    // Note: uartStreamClient is managed independently in its own useEffect, so we don't disconnect it here
    wakeWordServiceRef.current = null
    realtimeClientRef.current = null
    audioRecorderRef.current = null
    audioPlayerRef.current = null
    // Clear refs
    audioBufferRef.current = []
    accumulatedTranscriptRef.current = ''
    userTranscriptRef.current = ''
    setIsConnected(false)
    setConnectionStatus('disconnected')
    setAssistantState('idle')
  }

  // Handler for wake word detection
  const handleWakeWordDetected = () => {
    // Prevent wake word from triggering if we're already processing a response
    if (isProcessingResponseRef.current) {
      console.log('⚠️ Wake word detected but ignored - already processing response')
      return
    }
    console.log('🎯 Wake word detected - starting recording')
    setCurrentTranscript('Wake word detected...')
    startRecording()
  }

  // Handler for state changes
  const handleStateChange = (state: AssistantState) => {
    setAssistantState(state)
  }

  // Handler for recording timeout (fallback - OpenAI VAD should handle this)
  const handleRecordingTimeout = () => {
    console.log('⏱️ Recording timeout (fallback) - committing audio')
    // Only commit if OpenAI hasn't already detected speech stop
    if (realtimeClientRef.current?.isConnected() && assistantState === 'listening') {
      realtimeClientRef.current.commitAudio()
      // Don't create response - let OpenAI's turn detection handle it
    }
    stopRecording()
  }

  // Handler for audio playback start
  const handleAudioPlaybackStart = () => {
    console.log('🔊 Audio playback started - suppressing wake word')
    wakeWordServiceRef.current?.suppressWakeWord(true)
    wakeWordServiceRef.current?.setState('speaking')
  }

  // Handler for audio playback end
  const handleAudioPlaybackEnd = () => {
    console.log('🔇 Audio playback ended - enabling wake word')
    wakeWordServiceRef.current?.suppressWakeWord(false)
    // Only set to idle if we're not processing a response
    if (!isProcessingResponseRef.current) {
      const currentState = wakeWordServiceRef.current?.getState()
      // Only change state if we're currently speaking
      if (currentState === 'speaking') {
        wakeWordServiceRef.current?.setState('idle')
      }
    }
  }

  const startRecording = () => {
    if (audioRecorderRef.current && realtimeClientRef.current?.isConnected()) {
      // Only start if not already processing a response
      if (!isProcessingResponseRef.current) {
        console.log('🎤 Starting continuous audio stream to OpenAI')
        console.log('   WebSocket connected:', realtimeClientRef.current.isConnected())
        console.log('   Recorder exists:', !!audioRecorderRef.current)
        audioRecorderRef.current.start()
        const currentState = wakeWordServiceRef.current?.getState()
        // Only set to listening if we're in idle state
        if (currentState === 'idle') {
          wakeWordServiceRef.current?.setState('listening')
        }
        // Don't commit or create response yet - let OpenAI's VAD handle turn detection
      } else {
        console.log('⚠️ Skipping recording start - already processing response')
      }
    } else {
      console.warn('⚠️ Cannot start recording - recorder:', !!audioRecorderRef.current, 'WebSocket:', realtimeClientRef.current?.isConnected())
    }
  }

  const stopRecording = () => {
    if (audioRecorderRef.current) {
      console.log('🛑 Stopping audio stream')
      audioRecorderRef.current.stop()
      // Don't manually commit or create response - OpenAI's VAD will handle this automatically
      // The server_vad will detect silence and automatically commit + create response
    }
  }

  const handleRealtimeEvent = async (event: RealtimeEvent) => {
    // Log all events for debugging transcription issues
    if (event.type.includes('transcription') || event.type.includes('speech') || event.type.includes('conversation') || event.type.includes('response')) {
      console.log('🔍 Event:', event.type, event)
    }
    
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        console.log('✅ Session ready:', event.type)
        break

      case 'input_audio_buffer.speech_started':
        console.log('🎤 User started speaking (OpenAI VAD detected)')
        userTranscriptRef.current = '' // Reset user transcript
        setCurrentTranscript('Listening...')
        // Reset timeout since we detected speech
        if (audioRecorderRef.current) {
          (audioRecorderRef.current as any).resetTimeout?.()
        }
        break

      case 'conversation.item.input_audio_transcription.delta':
        // Real-time transcription as user speaks
        if (event.delta) {
          userTranscriptRef.current += event.delta
          setCurrentTranscript(userTranscriptRef.current)
          console.log('💬 User speaking (delta):', event.delta, '| Full:', userTranscriptRef.current)
        } else {
          console.warn('⚠️ Transcription delta event missing delta:', event)
        }
        break

      case 'conversation.item.input_audio_transcription.completed':
        // Final transcription when user stops
        if (event.transcript) {
          console.log('📝 USER SAID (final):', event.transcript)
          userTranscriptRef.current = event.transcript
          setCurrentTranscript(event.transcript)
        } else {
          console.warn('⚠️ Transcription completed event missing transcript:', event)
        }
        break

      case 'response.output_item.added':
        console.log('📝 New AI response starting')
        // Mark that we're processing a response to prevent duplicate state changes
        isProcessingResponseRef.current = true
        // Clear fallback timeout since server_vad worked
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
          commitTimeoutRef.current = null
        }
        // Stop any currently playing audio immediately
        if (isPlayingAudioRef.current && audioPlayerRef.current) {
          console.log('🛑 Stopping current audio playback for new response')
          audioPlayerRef.current.reset()
          isPlayingAudioRef.current = false
          audioPlaybackPromiseRef.current = null
        }
        // Reset audio player and buffer for new response
        if (audioPlayerRef.current) {
          audioPlayerRef.current.reset()
          isExecutingCommandRef.current = false
        }
        audioBufferRef.current = [] // Clear audio buffer for new response
        // Reset accumulated transcript for new response
        accumulatedTranscriptRef.current = ''
        // Don't clear userTranscriptRef here - it should already have the transcription
        // Stop recording since OpenAI is now responding
        if (audioRecorderRef.current) {
          console.log('🛑 Stopping recording - response starting')
          audioRecorderRef.current.stop()
        }
        // Only set state if not already processing
        if (wakeWordServiceRef.current?.getState() !== 'processing') {
          wakeWordServiceRef.current?.setState('processing')
        }
        break

      case 'input_audio_buffer.speech_stopped':
        console.log('🎤 User stopped speaking (OpenAI VAD detected silence)')
        setCurrentTranscript(userTranscriptRef.current || 'Processing...')
        
        // Only set state if not already processing a response
        if (!isProcessingResponseRef.current && wakeWordServiceRef.current?.getState() !== 'processing') {
          wakeWordServiceRef.current?.setState('processing')
        }
        
        // Clear any existing timeout
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
        }
        
        // Fallback: If OpenAI doesn't auto-commit within 200ms, manually commit
        // This ensures responses trigger even if server_vad has issues
        // Only set timeout if we're not already processing a response
        if (!isProcessingResponseRef.current) {
          commitTimeoutRef.current = setTimeout(() => {
            // Double-check we're still not processing before committing
            if (!isProcessingResponseRef.current && realtimeClientRef.current?.isConnected()) {
              console.log('🔄 Fallback: Manually committing audio after silence')
              realtimeClientRef.current.commitAudio()
              realtimeClientRef.current.createResponse()
            }
            commitTimeoutRef.current = null
          }, 200) // Give server_vad 200ms to auto-commit first
        }
        break

      // Check text content EARLY (before audio completes) to detect IoT commands
      case 'response.audio_transcript.delta':
        if (event.delta) {
          console.log('🔤 AI text delta:', event.delta)
          
          // Accumulate the transcript
          accumulatedTranscriptRef.current += event.delta
          
          // Check if accumulated text contains a JSON command
          const accumulated = accumulatedTranscriptRef.current
          const hasJsonStart = accumulated.includes('{"type"') || 
                               accumulated.includes('{ "type"') ||
                               (accumulated.includes('{') && accumulated.includes('"type"'))
          
          if (hasJsonStart && !isExecutingCommandRef.current) {
            console.log('⚡ EARLY DETECTION: JSON command in progress, blocking audio NOW')
            console.log('   Accumulated text so far:', accumulated)
            isExecutingCommandRef.current = true
            if (audioPlayerRef.current) {
              audioPlayerRef.current.reset()
            }
            // NOTE: We do NOT cancel the response here. Let it complete so we get the full JSON.
            // The isExecutingCommandRef flag will prevent audio from playing while we wait for completion.
          }
        }
        break

      case 'response.audio_transcript.done':
        if (event.transcript) {
          console.log('🤖 AI TRANSCRIPT (what it wrote):', event.transcript)
          
          // Check if response contains IoT commands (single or multiple)
          const iotCommands = parseMultipleIoTCommands(event.transcript)
          
          if (iotCommands.length > 0) {
            console.log(`🎮 DETECTED ${iotCommands.length} IoT COMMAND(S):`, iotCommands)
            
            // Ensure execution flag is set (should already be from early detection)
            if (!isExecutingCommandRef.current) {
              console.log('🔇 LATE DETECTION - Setting execution flag to TRUE')
              isExecutingCommandRef.current = true
              
              if (audioPlayerRef.current) {
                console.log('⏹️ Stopping current audio playback')
                audioPlayerRef.current.reset()
              }
            } else {
              console.log('✅ Execution flag already set from early detection')
            }
            
            // Extract the friendly message from the transcript (everything after the JSON)
            // The AI generates: {"type":"light",...} Turning on the Door Light.
            // We want: "Turning on the Door Light."
            const extractFriendlyMessage = (transcript: string): string => {
              // Remove all JSON objects from the transcript
              const withoutJson = transcript.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').trim()
              return withoutJson || `Executed ${iotCommands.length} command${iotCommands.length > 1 ? 's' : ''}`
            }
            
            const friendlyMessage = extractFriendlyMessage(event.transcript)
            console.log('💬 Friendly message extracted:', friendlyMessage)
            
            // Start TTS immediately (don't wait for command execution)
            const responseText = friendlyMessage
            setLastResponse(responseText)
            setCurrentTranscript('')
            
            // Speak immediately via TTS (parallel with command execution)
            const ttsPromise = ttsServiceRef.current ? (async () => {
              try {
                console.log('🔊 Speaking via TTS immediately (parallel with command execution):', responseText)
                // Suppress wake word during TTS
                wakeWordServiceRef.current?.suppressWakeWord(true)
                wakeWordServiceRef.current?.setState('speaking')

                await ttsServiceRef.current.speakText(responseText, { voice: 'alloy', speed: 1.1 })

                // Re-enable wake word after TTS
                wakeWordServiceRef.current?.suppressWakeWord(false)
                // Only reset if we're not processing a new response
                if (!isProcessingResponseRef.current) {
                  wakeWordServiceRef.current?.reset()
                }
                console.log('✅ TTS completed')
              } catch (err) {
                console.error('TTS error:', err)
                // Ensure wake word is re-enabled even on error
                wakeWordServiceRef.current?.suppressWakeWord(false)
                // Only reset if we're not processing a new response
                if (!isProcessingResponseRef.current) {
                  wakeWordServiceRef.current?.reset()
                }
              }
            })() : Promise.resolve()
            
            // Execute IoT commands in parallel (don't wait for TTS)
            const commandPromise = Promise.all(iotCommands.map(async (cmd, idx) => {
              console.log(`📤 Executing command ${idx + 1}/${iotCommands.length}:`, cmd)
              const result = await IoTController.executeCommand(cmd)
              console.log(`${result.success ? '✅' : '❌'} Command ${idx + 1} result:`, result)
              return result
            }))
              .then(results => {
                const successCount = results.filter(r => r.success).length
                const failCount = iotCommands.length - successCount

                console.log(`✅ Commands completed: ${successCount}/${iotCommands.length} successful`)

                // Show subtle visual feedback
                if (successCount > 0) {
                  console.log(`✨ ${successCount} command(s) executed successfully`)
                  setCommandNotification({
                    message: `${successCount} command${successCount > 1 ? 's' : ''} executed`,
                    type: 'success'
                  })
                  setTimeout(() => setCommandNotification(null), 3000)
                }

                // If commands failed, log details and show notification
                if (failCount > 0) {
                  console.warn(`⚠️ ${failCount} command(s) failed:`)
                  results.forEach((r, idx) => {
                    if (!r.success) {
                      console.error(`  ❌ Command ${idx + 1}: ${r.message}`)
                    }
                  })

                  // Show error notification
                  if (successCount === 0) {
                    setCommandNotification({
                      message: 'Command failed - check console',
                      type: 'error'
                    })
                    setTimeout(() => setCommandNotification(null), 5000)
                  }
                }

                isExecutingCommandRef.current = false
                console.log('🔊 AUDIO UNBLOCKED - Execution flag set to FALSE')
                
                // Return to idle state for next wake word (after both TTS and commands complete)
                return Promise.all([ttsPromise]).then(() => {
                  // Only reset if we're not processing a new response
                  if (!isProcessingResponseRef.current) {
                    wakeWordServiceRef.current?.reset()
                  }
                })
              })
              .catch(async err => {
                console.error('❌ Error executing commands:', err)
                
                // Commands failed, but TTS already spoke - just log it
                isExecutingCommandRef.current = false
                console.log('🔊 AUDIO UNBLOCKED - Execution flag set to FALSE (error)')
                
                // Wait for TTS to finish before resetting
                await ttsPromise
                // Only reset if we're not processing a new response
                if (!isProcessingResponseRef.current) {
                  wakeWordServiceRef.current?.reset()
                }
              })
            
            // Don't await - let both run in parallel
            // TTS will speak immediately, commands will execute in background
            commandPromise.catch(err => {
              console.error('Command execution error:', err)
            })
          } else {
            console.log('💬 No IoT commands detected, normal response')
            // If early detection was triggered but no commands found, reset the flag
            if (isExecutingCommandRef.current) {
              console.log('⚠️ Early detection fired but no valid commands found - resetting flag')
              isExecutingCommandRef.current = false
            }
            setLastResponse(event.transcript)
            setCurrentTranscript('')
          }
        }
        break

      case 'response.audio.delta':
        // Buffer audio chunks instead of streaming to prevent overlap
        if (event.delta) {
          if (!isExecutingCommandRef.current) {
            // Only buffer if not executing command (skip JSON command audio)
            audioBufferRef.current.push(event.delta)
            console.log('📦 Buffered audio chunk (total chunks:', audioBufferRef.current.length, ')')
          } else {
            console.log('🔇 BLOCKING audio chunk (execution flag:', isExecutingCommandRef.current, ')')
          }
        }
        break

      case 'response.audio.done':
        console.log('✅ Audio response completed - playing buffered audio')
        // Play all buffered audio chunks sequentially (no streaming to prevent overlap)
        // Only play if not already playing and not executing command
        if (audioBufferRef.current.length > 0 && audioPlayerRef.current && !isExecutingCommandRef.current && !isPlayingAudioRef.current) {
          console.log('🔊 Playing', audioBufferRef.current.length, 'buffered audio chunks sequentially')
          
          // Mark as playing to prevent overlap
          isPlayingAudioRef.current = true
          
          // Reset audio player timing for clean sequential playback
          audioPlayerRef.current.reset()
          
          // Suppress wake word during playback
          wakeWordServiceRef.current?.suppressWakeWord(true)
          wakeWordServiceRef.current?.setState('speaking')
          
          // Store buffer before clearing (needed for playback)
          const bufferToPlay = [...audioBufferRef.current]
          audioBufferRef.current = [] // Clear buffer immediately
          
          // Play all chunks sequentially (await each one to prevent overlap)
          const playBufferedAudio = async () => {
            try {
              for (const chunk of bufferToPlay) {
                // Check if playback was cancelled
                if (!isPlayingAudioRef.current) {
                  console.log('🛑 Audio playback cancelled')
                  break
                }
                const pcm16Data = base64ToPCM16(chunk)
                await audioPlayerRef.current!.playPCM16(pcm16Data)
              }
              
              // Re-enable wake word after all audio is played
              isPlayingAudioRef.current = false
              audioPlaybackPromiseRef.current = null
              wakeWordServiceRef.current?.suppressWakeWord(false)
              // Only set to idle if we're not processing a new response
              if (!isProcessingResponseRef.current) {
                const currentState = wakeWordServiceRef.current?.getState()
                if (currentState === 'speaking') {
                  wakeWordServiceRef.current?.setState('idle')
                }
              }
              console.log('✅ Finished playing buffered audio')
            } catch (err) {
              console.error('Error playing buffered audio:', err)
              isPlayingAudioRef.current = false
              audioPlaybackPromiseRef.current = null
              wakeWordServiceRef.current?.suppressWakeWord(false)
              // Only set to idle if we're not processing a new response
              if (!isProcessingResponseRef.current) {
                const currentState = wakeWordServiceRef.current?.getState()
                if (currentState === 'speaking') {
                  wakeWordServiceRef.current?.setState('idle')
                }
              }
            }
          }
          
          // Store playback promise and play buffered audio
          audioPlaybackPromiseRef.current = playBufferedAudio()
        } else {
          console.log('🔇 Skipping audio playback (execution flag:', isExecutingCommandRef.current, ', already playing:', isPlayingAudioRef.current, ', buffer:', audioBufferRef.current.length, ')')
          audioBufferRef.current = [] // Clear buffer even if not playing
        }
        break

      case 'response.done':
        console.log('✅ Response fully completed - returning to wake word listening')
        // Mark that we're no longer processing
        isProcessingResponseRef.current = false
        
        // Clear any pending fallback timeout
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current)
          commitTimeoutRef.current = null
        }
        
        // Return to idle state and resume wake word detection
        // Only reset if not executing commands and not currently playing audio
        if (!isExecutingCommandRef.current && !isPlayingAudioRef.current) {
          const currentState = wakeWordServiceRef.current?.getState()
          // Only reset if we're actually in a processing state
          if (currentState === 'processing' || currentState === 'listening') {
            wakeWordServiceRef.current?.reset()
            // Ensure wake word detection is active (start() will check if already active)
            if (wakeWordServiceRef.current) {
              wakeWordServiceRef.current.start().catch(err => {
                console.error('Failed to restart wake word detection:', err)
              })
            }
          } else if (currentState !== 'idle') {
            // If we're in an unexpected state, try to reset to idle
            console.log('⚠️ Unexpected state in response.done:', currentState, '- resetting to idle')
            wakeWordServiceRef.current?.reset()
            wakeWordServiceRef.current?.start().catch(err => {
              console.error('Failed to restart wake word detection:', err)
            })
          }
        }
        // Clear any accumulated state
        accumulatedTranscriptRef.current = ''
        userTranscriptRef.current = ''
        setCurrentTranscript('')
        break
    }
  }

  if (!isConfigured || showSetup) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-white/80">Voice Assistant Setup</h3>
          {showSetup && (
            <button onClick={() => setShowSetup(false)} className="text-white/60 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="OpenAI API Key"
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm font-light focus:outline-none focus:border-blue-500/50"
          />
          <input
            type="password"
            value={picovoiceKey}
            onChange={(e) => setPicovoiceKey(e.target.value)}
            placeholder="Picovoice Access Key"
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm font-light focus:outline-none focus:border-blue-500/50"
          />
          <div className="text-xs text-white/50 font-light">
            Get free Picovoice key at: console.picovoice.ai
          </div>
          <button
            onClick={() => { setIsConfigured(true); handleConnect(); }}
            disabled={!apiKey || !picovoiceKey}
            className="w-full bg-blue-600/80 hover:bg-blue-600 text-white font-light py-2 px-4 rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Configure & Connect
          </button>
        </div>
      </div>
    )
  }

  const getStateDisplay = () => {
    switch (assistantState) {
      case 'idle':
        return { text: `Listening for "${wakeWordLabel}"`, color: 'text-emerald-400/80', icon: '👂' }
      case 'listening':
        return { text: 'Recording...', color: 'text-red-400/80', icon: '🎤' }
      case 'processing':
        return { text: 'Processing...', color: 'text-amber-400/80', icon: '⚡' }
      case 'speaking':
        return { text: 'Speaking...', color: 'text-blue-400/80', icon: '🔊' }
      default:
        return { text: 'Ready', color: 'text-white/60', icon: '💤' }
    }
  }

  const stateDisplay = getStateDisplay()

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-emerald-500' :
            connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
            'bg-gray-500'
          }`}></div>
          <h3 className="text-lg font-light text-white/80">Voice Assistant</h3>
        </div>

        {isConnected && (
          <button
            onClick={handleDisconnect}
            className="text-xs font-light text-white/60 hover:text-white/80"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Voice Control */}
      <div className="flex gap-3 mb-4">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-light py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Connect
          </button>
        ) : (
          <div className="flex-1 bg-black/30 border border-white/10 rounded-xl py-3 px-4 flex items-center justify-center gap-2">
            <span className="text-lg">{stateDisplay.icon}</span>
            <span className={`font-light ${stateDisplay.color}`}>
              {stateDisplay.text}
            </span>
          </div>
        )}
      </div>

      {/* Transcript Display */}
      {(currentTranscript || lastResponse) && (
        <div className="space-y-2">
          {currentTranscript && (
            <div className="text-sm font-light text-amber-400/80 italic">
              {currentTranscript}
            </div>
          )}
          {lastResponse && (
            <div className="text-sm font-light text-white/70 border-l-2 border-blue-500/30 pl-3">
              {lastResponse}
            </div>
          )}
        </div>
      )}

      {/* Command Notification */}
      {commandNotification && (
        <div className={`mt-3 text-xs font-light px-3 py-2 rounded-lg border ${
          commandNotification.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        } animate-fade-in`}>
          {commandNotification.type === 'success' ? '✓' : '⚠'} {commandNotification.message}
        </div>
      )}
    </div>
  )
}

