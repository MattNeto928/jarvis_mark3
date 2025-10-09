'use client'

import { useState, useEffect, useRef } from 'react'
import { RealtimeClient, type ConnectionStatus, type RealtimeEvent } from '@/lib/realtimeClient'
import { AudioRecorder, AudioPlayer, base64ToPCM16 } from '@/lib/audioUtils'
import { parseIoTCommand, parseMultipleIoTCommands } from '@/lib/iotTypes'
import { IoTController } from '@/lib/iotController'
import { TTSService } from '@/lib/ttsService'

type Voice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar'

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [apiKey, setApiKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [selectedVoice] = useState<Voice>('alloy')
  const [devices, setDevices] = useState<any[]>([])
  const [showSetup, setShowSetup] = useState(false)

  const realtimeClientRef = useRef<RealtimeClient | null>(null)
  const audioRecorderRef = useRef<AudioRecorder | null>(null)
  const audioPlayerRef = useRef<AudioPlayer | null>(null)
  const ttsServiceRef = useRef<TTSService | null>(null)
  const isExecutingCommandRef = useRef(false)
  const accumulatedTranscriptRef = useRef('')

  useEffect(() => {
    const storedKey = localStorage.getItem('openai_api_key')
    if (storedKey) {
      setApiKey(storedKey)
      setIsConfigured(true)
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
    if (!apiKey) return

    try {
      localStorage.setItem('openai_api_key', apiKey)
      
      audioRecorderRef.current = new AudioRecorder()
      audioPlayerRef.current = new AudioPlayer()
      ttsServiceRef.current = new TTSService(apiKey)
      
      await audioRecorderRef.current.initialize((base64Audio) => {
        if (realtimeClientRef.current?.isConnected()) {
          realtimeClientRef.current.sendAudio(base64Audio)
        }
      })
      
      await audioPlayerRef.current.initialize()

      realtimeClientRef.current = new RealtimeClient(apiKey, 'gpt-4o-realtime-preview-2024-12-17', selectedVoice, devices)

      realtimeClientRef.current.connect(
        handleRealtimeEvent,
        (status) => {
          setConnectionStatus(status)
          setIsConnected(status === 'connected')
        }
      )
      setShowSetup(false)
    } catch (err) {
      console.error('Connection error:', err)
    }
  }

  const handleDisconnect = () => {
    if (isRecording) stopRecording()
    realtimeClientRef.current?.disconnect()
    audioRecorderRef.current?.cleanup()
    audioPlayerRef.current?.cleanup()
    realtimeClientRef.current = null
    audioRecorderRef.current = null
    audioPlayerRef.current = null
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  const startRecording = () => {
    if (audioRecorderRef.current && realtimeClientRef.current?.isConnected()) {
      audioRecorderRef.current.start()
      setIsRecording(true)
    }
  }

  const stopRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop()
      setIsRecording(false)
      if (realtimeClientRef.current) {
        realtimeClientRef.current.commitAudio()
        realtimeClientRef.current.createResponse()
      }
    }
  }

  const handleRealtimeEvent = async (event: RealtimeEvent) => {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        console.log('🎤 User started speaking')
        setCurrentTranscript('Listening...')
        break

      case 'response.output_item.added':
        console.log('📝 New AI response starting')
        // Reset audio player for new response
        if (audioPlayerRef.current) {
          audioPlayerRef.current.reset()
          isExecutingCommandRef.current = false
        }
        // Reset accumulated transcript for new response
        accumulatedTranscriptRef.current = ''
        break

      case 'input_audio_buffer.speech_stopped':
        console.log('🎤 User stopped speaking')
        setCurrentTranscript('Processing...')
        break

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          console.log('📝 USER SAID:', event.transcript)
          setCurrentTranscript(event.transcript)
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
            
            // Execute IoT commands
            setCurrentTranscript(`Executing ${iotCommands.length} command${iotCommands.length > 1 ? 's' : ''}...`)
            
            // Execute all commands in parallel
            Promise.all(iotCommands.map(cmd => IoTController.executeCommand(cmd)))
              .then(async results => {
                const successCount = results.filter(r => r.success).length
                console.log(`✅ Commands completed: ${successCount}/${iotCommands.length} successful`)
                
                // Use the friendly message or fallback to generic success message
                const responseText = successCount > 0 ? friendlyMessage : 'Some commands failed'
                setLastResponse(responseText)
                setCurrentTranscript('')
                
                // Speak the friendly message using TTS
                if (ttsServiceRef.current && successCount > 0) {
                  try {
                    console.log('🔊 Speaking via TTS:', responseText)
                    await ttsServiceRef.current.speakText(responseText, { voice: 'alloy', speed: 1.1 })
                  } catch (err) {
                    console.error('TTS error:', err)
                  }
                }
                
                isExecutingCommandRef.current = false
                console.log('🔊 AUDIO UNBLOCKED - Execution flag set to FALSE')
              })
              .catch(async err => {
                console.error('❌ Error executing commands:', err)
                const errorText = 'Failed to execute commands'
                setLastResponse(errorText)
                setCurrentTranscript('')
                
                // Speak error message
                if (ttsServiceRef.current) {
                  try {
                    await ttsServiceRef.current.speakText(errorText, { voice: 'alloy' })
                  } catch (ttsErr) {
                    console.error('TTS error:', ttsErr)
                  }
                }
                
                isExecutingCommandRef.current = false
                console.log('🔊 AUDIO UNBLOCKED - Execution flag set to FALSE (error)')
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
        // Only play audio if we're not executing a command
        // This prevents hearing JSON commands being read aloud
        const shouldPlayAudio = !isExecutingCommandRef.current
        
        if (event.delta && audioPlayerRef.current) {
          if (shouldPlayAudio) {
            console.log('🔊 PLAYING audio chunk (execution flag:', isExecutingCommandRef.current, ')')
            try {
              const pcm16Data = base64ToPCM16(event.delta)
              audioPlayerRef.current.playPCM16(pcm16Data)
            } catch (err) {
              console.error('Error playing audio:', err)
            }
          } else {
            console.log('🔇 BLOCKING audio chunk (execution flag:', isExecutingCommandRef.current, ')')
          }
        }
        break
    }
  }

  if (!isConfigured || showSetup) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-light text-white/80">Voice Assistant</h3>
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
            placeholder="Enter OpenAI API Key"
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm font-light focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={() => { setIsConfigured(true); handleConnect(); }}
            className="w-full bg-blue-600/80 hover:bg-blue-600 text-white font-light py-2 px-4 rounded-xl transition-all text-sm"
          >
            Configure
          </button>
        </div>
      </div>
    )
  }

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
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex-1 font-light py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
              isRecording 
                ? 'bg-red-600/80 hover:bg-red-600 text-white' 
                : 'bg-emerald-600/80 hover:bg-emerald-600 text-white'
            }`}
          >
            {isRecording ? (
              <>
                <div className="w-3 h-3 bg-white rounded-sm"></div>
                Stop
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Talk
              </>
            )}
          </button>
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
    </div>
  )
}

