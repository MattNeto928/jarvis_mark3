'use client'

import { useEffect, useRef, useState } from 'react'
import { WakeWordService, type AssistantState } from '@/lib/wakeWordService'
import { parseMultipleIoTCommands } from '@/lib/iotTypes'
import { IoTController } from '@/lib/iotController'
import { getEphemeralToken, JARVIS_INSTRUCTIONS, SESSION_CONFIG } from '@/lib/jarvisAgent'
import { RealtimeWebRTCClient } from '@/lib/realtimeWebRTCClient'
// Tools disabled - search handled via transcript detection
// import { getRealtimeToolSchemas, allTools } from '@/lib/realtimeTools'
import { useSmartMirror } from '@/lib/smartMirrorContext'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export default function VoiceAssistant() {
  const { weather, stocks, news, devices } = useSmartMirror()
  const [isConnected, setIsConnected] = useState(false)
  const [assistantState, setAssistantState] = useState<AssistantState>('idle')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [apiKey, setApiKey] = useState('')
  const [picovoiceKey, setPicovoiceKey] = useState('')
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [timeTrigger, setTimeTrigger] = useState(0)

  const rtcClientRef = useRef<RealtimeWebRTCClient | null>(null)
  const wakeWordServiceRef = useRef<WakeWordService | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isProcessingRef = useRef(false)
  const isExecutingCommandRef = useRef(false)
  const isSearchingRef = useRef(false) // Track if we're doing a web search
  const pendingSearchQueryRef = useRef<string | null>(null) // Store the search query
  const llmSaidSearchingRef = useRef(false) // Track if LLM said "Searching"
  const searchCompletedRef = useRef(false) // Track if search was already done this turn
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Track listening timeout
  const userTranscriptRef = useRef('')
  const accumulatedTranscriptRef = useRef('')

  // Load keys on mount
  useEffect(() => {
    const envPicovoiceKey = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
    const storedApiKey = localStorage.getItem('openai_api_key')
    const storedPicovoiceKey = localStorage.getItem('picovoice_access_key')

    if (storedApiKey) setApiKey(storedApiKey)
    const picoKey = envPicovoiceKey || storedPicovoiceKey
    if (picoKey) setPicovoiceKey(picoKey)

    if (storedApiKey && picoKey) {
      void handleConnect()
    }

    return () => {
      handleDisconnect()
    }
  }, [])

  // Auto reconnect
  useEffect(() => {
    if (!isConnected && apiKey && picovoiceKey) {
      reconnectTimeoutRef.current = setTimeout(() => {
        // console.log('🔄 Auto-reconnecting...')
        void handleConnect()
      }, 5000)
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [isConnected, apiKey, picovoiceKey])

  // Clock trigger to update context time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTrigger(prev => prev + 1)
    }, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])

  // Update session instructions when context changes
  useEffect(() => {
    if (rtcClientRef.current && isConnected) {
      const contextInstructions = buildContextInstructions(weather, stocks, news, devices)
      const fullInstructions = JARVIS_INSTRUCTIONS + "\n\n" + contextInstructions
      
      // We need a way to update instructions on the fly
      // Since RealtimeWebRTCClient doesn't expose updateSession directly in a clean way for just instructions,
      // we can use the send method.
      rtcClientRef.current.send({
        type: 'session.update',
        session: {
          instructions: fullInstructions
        }
      })
      console.log('🧠 Updated Jarvis context with latest data')
    }
  }, [weather, stocks, news, devices, isConnected, timeTrigger])

  const handleConnect = async () => {
    if (!apiKey || !picovoiceKey) return

    try {
      setConnectionStatus('connecting')
      localStorage.setItem('openai_api_key', apiKey)
      localStorage.setItem('picovoice_access_key', picovoiceKey)

      // Wake word setup
      const wakeWordService = new WakeWordService({
        accessKey: picovoiceKey,
        keywords: [
          { keywordPath: '/wake-words/jarvis.ppn', keywordLabel: 'Jarvis', sensitivity: 0.5 },
          { keywordPath: '/wake-words/jarvis-lights_en_wasm_v3_0_0.ppn', keywordLabel: 'Jarvis Lights', sensitivity: 0.5 },
        ],
      })
      wakeWordServiceRef.current = wakeWordService
      await wakeWordService.initialize(handleWakeWordDetected, handleStateChange)

      // Build initial instructions with current context
      const contextInstructions = buildContextInstructions(weather, stocks, news, devices)
      const fullInstructions = JARVIS_INSTRUCTIONS + "\n\n" + contextInstructions

      const client = new RealtimeWebRTCClient({
        instructions: fullInstructions,
        sessionConfig: SESSION_CONFIG.config,
        tools: [], // Disable tools - we handle search manually via transcript detection
        onEvent: handleRealtimeEvent,
        onOpen: () => {
          setIsConnected(true)
          setConnectionStatus('connected')
          wakeWordServiceRef.current?.start().catch(err => console.error('Wake word start error', err))
          console.log('✅ Jarvis connected and listening for wake word')
        },
        onClose: () => {
          setIsConnected(false)
          setConnectionStatus('disconnected')
        },
        onError: (error) => {
          console.error('Realtime WebRTC error:', error)
          setConnectionStatus('error')
        },
      })

      rtcClientRef.current = client

      // console.log('🔌 Getting ephemeral token...')
      const ephemeralToken = await getEphemeralToken(apiKey, 'alloy')
      // console.log('✅ Got ephemeral token (length:', ephemeralToken.length, ')')

      await client.connect(ephemeralToken)
    } catch (error) {
      console.error('❌ Connection error:', error)
      handleDisconnect()
      setConnectionStatus('error')
      setIsConnected(false)
    }
  }

  const handleDisconnect = () => {
    rtcClientRef.current?.disconnect()
    rtcClientRef.current = null

    wakeWordServiceRef.current?.cleanup()
    wakeWordServiceRef.current = null

    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  // Reset all state to idle - used after response completes or on timeout
  const resetState = () => {
    console.log('🔄 Resetting all state to idle')
    isProcessingRef.current = false
    isSearchingRef.current = false
    isExecutingCommandRef.current = false
    llmSaidSearchingRef.current = false
    searchCompletedRef.current = false
    pendingSearchQueryRef.current = null
    accumulatedTranscriptRef.current = ''
    userTranscriptRef.current = ''
    // Clear any pending listening timeout
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current)
      listeningTimeoutRef.current = null
    }
    rtcClientRef.current?.setMicrophoneEnabled(false)
    wakeWordServiceRef.current?.reset()
    wakeWordServiceRef.current?.start().catch(err => console.error('Wake word restart error', err))
    setCurrentTranscript('')
  }

  const handleRealtimeEvent = (event: any) => {
    switch (event.type) {
      case 'session.created':
        console.log('📡 Session created')
        break

      case 'session.updated':
        console.log('📡 Session updated - tools:', event.session?.tools?.map((t: any) => t.name))
        break

      case 'error':
        console.error('❌ API Error:', event.error)
        break

      case 'input_audio_buffer.speech_started':
        setAssistantState('listening')
        rtcClientRef.current?.resumeAudio() // Ensure audio plays for new turn
        userTranscriptRef.current = ''
        // Cancel listening timeout - speech detected!
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current)
          listeningTimeoutRef.current = null
        }
        setCurrentTranscript('Listening...')
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
          console.log('📝 User transcript stored:', event.transcript)
          
          // If LLM already said "Searching", execute the search now
          if (llmSaidSearchingRef.current && !pendingSearchQueryRef.current && !isSearchingRef.current) {
            console.log('🔍 LLM already said searching, executing now...')
            const searchQuery = extractSearchQuery(event.transcript)
            console.log('🔍 Will search for:', searchQuery)
            pendingSearchQueryRef.current = searchQuery
            llmSaidSearchingRef.current = false
            setTimeout(() => {
              if (pendingSearchQueryRef.current && !isSearchingRef.current) {
                console.log('🔍 Executing search...')
                void executeWebSearch(pendingSearchQueryRef.current)
              }
            }, 500)
          }
        }
        break

      case 'input_audio_buffer.speech_stopped':
        setAssistantState('processing')
        rtcClientRef.current?.setMicrophoneEnabled(false)
        break

      case 'response.output_item.added':
        isProcessingRef.current = true
        // Don't suppress wake word - allow interruption
        wakeWordServiceRef.current?.setState('processing')
        break

      case 'response.audio_transcript.delta':
        if (event.delta) {
          accumulatedTranscriptRef.current += event.delta
          // Check for JSON in delta to mute audio early (without cancelling the stream)
          if (accumulatedTranscriptRef.current.includes('{')) {
            rtcClientRef.current?.muteAudio()
          }
        }
        break

      case 'response.audio_transcript.done':
        console.log('🎤 LLM transcript done:', event.transcript)
        // Clear accumulated first to prevent response.audio.done from re-processing
        accumulatedTranscriptRef.current = ''
        if (event.transcript) {
          handleLLMResponse(event.transcript)
        }
        break

      // Fallback: use response.audio.done with accumulated transcript (only if transcript.done didn't fire)
      case 'response.audio.done':
        if (accumulatedTranscriptRef.current) {
          console.log('🎤 LLM response (from accumulated):', accumulatedTranscriptRef.current)
          const transcript = accumulatedTranscriptRef.current
          accumulatedTranscriptRef.current = '' // Clear immediately
          handleLLMResponse(transcript)
        }
        break

      // Tool call handlers disabled - search handled via transcript detection
      // case 'response.function_call_arguments.delta':
      // case 'response.function_call_arguments.done':

      case 'response.audio.delta':
        // Audio is streaming - ensure it's playing
        rtcClientRef.current?.resumeAudio()
        break

      case 'response.done':
        console.log('📍 response.done - isSearching:', isSearchingRef.current, 'pendingSearch:', pendingSearchQueryRef.current)
        
        // If we're in the middle of a search or have a pending search, don't reset
        if (isSearchingRef.current || pendingSearchQueryRef.current) {
          console.log('🔄 Search in progress or pending, keeping state...')
          return
        }
        
        console.log('✅ Final response done, resetting state')
        resetState()
        break

      case 'response.created':
        console.log('🎬 Response created:', event.response?.id)
        break

      default:
        // Log all events for debugging
        if (event.type?.includes('function') || event.type?.includes('tool')) {
          console.log('🧰 Tool-related event:', event.type, event)
        } else if (event.type?.startsWith('response.')) {
          console.log('📨 Response event:', event.type)
        }
        break
    }
  }

  // Handle LLM response - check for search confirmation or process normally
  const handleLLMResponse = (transcript: string) => {
    if (isExecutingCommandRef.current || isSearchingRef.current) {
      console.log('ℹ️ Skipping - already executing command or searching')
      return
    }

    // Skip search detection if we already completed a search this turn
    if (searchCompletedRef.current) {
      console.log('ℹ️ Search already completed this turn, processing as normal response')
      handleTranscript(transcript)
      return
    }

    const llmResponse = transcript.toLowerCase().trim()
    
    // Check if LLM said "Searching" - at the start of the response
    // Use regex to handle variations like "Searching.", "Searching...", etc.
    const startsWithSearching = 
      /^searching[.\s]*/i.test(llmResponse) || 
      /^let me search/i.test(llmResponse) || 
      /^looking that up/i.test(llmResponse) ||
      /^let me look/i.test(llmResponse) ||
      /^i('ll| will) search/i.test(llmResponse)
    
    console.log('🔍 Checking for search intent:', { llmResponse: llmResponse.substring(0, 50), startsWithSearching })
    
    if (startsWithSearching && !pendingSearchQueryRef.current) {
      console.log('🔎 LLM confirmed search intent with:', transcript)
      llmSaidSearchingRef.current = true
      
      // If we already have the user transcript, execute search now
      if (userTranscriptRef.current) {
        const searchQuery = extractSearchQuery(userTranscriptRef.current)
        console.log('🔍 Will search for:', searchQuery)
        pendingSearchQueryRef.current = searchQuery
        // Execute search after a short delay to let audio finish
        setTimeout(() => {
          if (pendingSearchQueryRef.current && !isSearchingRef.current) {
            console.log('🔍 Executing search...')
            void executeWebSearch(pendingSearchQueryRef.current)
          }
        }, 500)
      } else {
        console.log('⏳ Waiting for user transcript to complete...')
        // User transcript will trigger search when it completes
      }
      return
    }
    
    // Normal transcript handling (IoT commands, etc.)
    handleTranscript(transcript)
  }

  const handleTranscript = (transcript: string) => {
    if (isExecutingCommandRef.current) {
      console.log('ℹ️ Skipping transcript parsing while tool is executing')
      return
    }
    const iotCommands = parseMultipleIoTCommands(transcript)
    if (iotCommands.length > 0) {
      console.log(`🛠️ Detected ${iotCommands.length} IoT command(s)`, iotCommands)
      isExecutingCommandRef.current = true
      const friendlyMessage = extractFriendlyMessage(transcript, iotCommands.length)
      setLastResponse(friendlyMessage)
      setCurrentTranscript('')

      Promise.all(iotCommands.map(cmd => IoTController.executeCommand(cmd)))
        .then(() => {
          console.log('✅ IoT commands executed successfully')
          isExecutingCommandRef.current = false
          wakeWordServiceRef.current?.reset()
        })
        .catch(err => {
          console.error('❌ Error executing commands:', err)
          isExecutingCommandRef.current = false
          wakeWordServiceRef.current?.reset()
        })
    } else {
      console.log('ℹ️ No IoT command detected in transcript')
      setLastResponse(transcript)
      setCurrentTranscript('')
    }
  }

  const extractFriendlyMessage = (transcript: string, count: number) => {
    const withoutJson = transcript.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').trim()
    return withoutJson || `Executed ${count} command${count > 1 ? 's' : ''}`
  }

  // Extract search query from user's transcript
  // Called after LLM confirms search intent by saying "Searching"
  const extractSearchQuery = (transcript: string): string => {
    // Try to extract the specific topic from common patterns
    const extractPatterns = [
      /search (?:for |the web for |online for )?(.+)/i,
      /look up (.+)/i,
      /find (?:out |information (?:about |on )?)?(.+)/i,
      /what(?:'s| is) (?:the )?(?:latest |recent )?(?:news |happening )(?:about |with |on )?(.+)/i,
      /tell me about (.+)/i,
      /who (?:is |are )(.+)/i,
      /what happened (?:with |to )?(.+)/i,
      /(?:news|update|latest|recent|current) (?:about |on |for )?(.+)/i,
    ]
    
    for (const pattern of extractPatterns) {
      const match = transcript.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    
    // Fallback: use the whole transcript as the query
    return transcript
  }

  // Execute web search and inject results
  const executeWebSearch = async (query: string) => {
    console.log('🔍 Executing web search:', query)
    isSearchingRef.current = true
    setCurrentTranscript('Searching...')
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, searchDepth: 'basic', maxResults: 5 }),
      })
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('✅ Search results received')
      
      // Format results for the LLM
      let searchResults = ''
      if (data.answer) {
        searchResults = data.answer
      } else if (data.results && data.results.length > 0) {
        searchResults = data.results
          .slice(0, 3)
          .map((r: any) => `${r.title}: ${r.content}`)
          .join('\n\n')
      } else {
        searchResults = 'No results found.'
      }
      
      // Inject the search results as a user message and trigger response
      console.log('📤 Injecting search results into conversation')
      
      // Create a conversation item with the search context
      rtcClientRef.current?.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `[Web search results for "${query}"]\n\n${searchResults}\n\nPlease summarize these search results conversationally in 2-3 sentences.`
            }
          ]
        }
      })
      
      // Trigger a response
      rtcClientRef.current?.send({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
        }
      })
      
      // Mark search as completed so we don't trigger again on the response
      searchCompletedRef.current = true
      
    } catch (error) {
      console.error('❌ Search error:', error)
      setCurrentTranscript('Search failed')
      setTimeout(() => setCurrentTranscript(''), 2000)
    } finally {
      isSearchingRef.current = false
      pendingSearchQueryRef.current = null
    }
  }

  // Tool call handlers removed - search is now triggered by LLM saying "Searching"

  const handleWakeWordDetected = (keywordIndex: number) => {
    console.log('🎤 Wake word detected, index:', keywordIndex)

    if (!rtcClientRef.current) return

    // If currently processing/speaking, interrupt the LLM
    if (isProcessingRef.current || isSearchingRef.current) {
      console.log('🛑 Interrupting LLM response')
      rtcClientRef.current.interruptAudio()
      resetState()
    }

    if (keywordIndex === 1) {
      setCurrentTranscript('Toggling lights...')
      IoTController.toggleLights()
        .then(result => {
          setCurrentTranscript(result.message)
          setTimeout(() => setCurrentTranscript(''), 2000)
        })
        .catch(err => {
          console.error('❌ Toggle lights error:', err)
          setCurrentTranscript('Failed to toggle lights')
          setTimeout(() => setCurrentTranscript(''), 2000)
        })
      wakeWordServiceRef.current?.reset()
      return
    }

    // Reset search state for new conversation turn
    searchCompletedRef.current = false
    llmSaidSearchingRef.current = false
    pendingSearchQueryRef.current = null
    
    rtcClientRef.current.setMicrophoneEnabled(true)
    setAssistantState('listening')
    setCurrentTranscript('Listening...')
    
    // Clear any existing timeout
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current)
    }
    
    // Safety timeout - if no speech detected in 10 seconds, reset to idle
    // This timeout is cancelled when speech_started event fires
    listeningTimeoutRef.current = setTimeout(() => {
      console.log('⚠️ Listening timeout - no speech detected, resetting')
      listeningTimeoutRef.current = null
      resetState()
    }, 10000)
  }

  const handleStateChange = (state: AssistantState) => {
    setAssistantState(state)
  }

  const buildContextInstructions = (weather: any, stocks: any[], news: any[], devices: any[]) => {
    const now = new Date()
    const dateTime = now.toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    })

    let context = `CURRENT CONTEXT (as of ${dateTime}):\n`
    
    if (weather) {
      context += `\nWeather in ${weather.city}: ${weather.temp}°F, ${weather.description}, Humidity: ${weather.humidity}%, Wind: ${weather.wind_speed}mph.`
    }
    
    if (stocks.length > 0) {
      context += "\n\nStocks:\n" + stocks.map(s => `- ${s.symbol}: $${s.price} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join("\n")
    }
    
    if (news.length > 0) {
      context += "\n\nLatest News:\n" + news.map(n => `- ${n.title} (${n.source})`).join("\n")
    }
    
    if (devices.length > 0) {
      context += "\n\nDevices Status:\n" + devices.map(d => `- ${d.name}: ${d.online ? 'Online' : 'Offline'}`).join("\n")
    }
    
    return context
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full transition-all duration-700 ${
          isConnected ? 'bg-emerald-500 saturate-100' : 'bg-gray-500 saturate-0'
        }`}
      ></div>
      <span
        className={`text-sm font-light transition-all duration-700 ${
          isConnected ? 'text-emerald-400 saturate-100' : 'text-gray-500 saturate-0'
        }`}
      >
        jarvis {isConnected ? 'online' : 'offline'}
      </span>
    </div>
  )
}
