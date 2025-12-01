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
  const isAwaitingToolResponseRef = useRef(false) // Track if we're waiting for LLM to speak tool results
  const isSearchingRef = useRef(false) // Track if we're doing a web search
  const pendingSearchQueryRef = useRef<string | null>(null) // Store the search query
  const userTranscriptRef = useRef('')
  const accumulatedTranscriptRef = useRef('')
  const toolCallBufferRef = useRef<Record<string, { name?: string; arguments: string; itemId?: string }>>({})

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
          
          // Check for search intent in user's speech
          const searchQuery = detectSearchIntent(event.transcript)
          if (searchQuery && !isSearchingRef.current && !pendingSearchQueryRef.current) {
            console.log('🔎 Search intent detected:', searchQuery)
            pendingSearchQueryRef.current = searchQuery
            // Execute search immediately - don't wait for response.done
            // This ensures the search runs even if response.done fires first
            setTimeout(() => {
              if (pendingSearchQueryRef.current && !isSearchingRef.current) {
                console.log('🔍 Executing search from transcription handler...')
                void executeWebSearch(pendingSearchQueryRef.current)
              }
            }, 1500) // Wait 1.5s for the "Searching" audio to play
          }
        }
        break

      case 'input_audio_buffer.speech_stopped':
        setAssistantState('processing')
        rtcClientRef.current?.setMicrophoneEnabled(false)
        break

      case 'response.output_item.added':
        isProcessingRef.current = true
        wakeWordServiceRef.current?.suppressWakeWord(true)
        wakeWordServiceRef.current?.setState('processing')
        handleFunctionCallItem(event)
        break

      case 'response.audio_transcript.delta':
        if (event.delta) {
          accumulatedTranscriptRef.current += event.delta
          // Check for JSON in delta to mute audio early (without cancelling the stream)
          // Checking for just '{' is faster/safer than '{"' to prevent the start of JSON from being heard
          if (accumulatedTranscriptRef.current.includes('{')) {
            rtcClientRef.current?.muteAudio()
          }
        }
        break

      case 'response.audio_transcript.done':
        if (event.transcript) {
          handleTranscript(event.transcript)
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
        
        // If we're awaiting a tool response, don't reset yet - the spoken response is coming
        if (isAwaitingToolResponseRef.current) {
          console.log('🔄 Function call response done, waiting for spoken response...')
          isAwaitingToolResponseRef.current = false
          return
        }
        
        // If we're in the middle of a search or have a pending search, don't reset
        if (isSearchingRef.current || pendingSearchQueryRef.current) {
          console.log('🔄 Search in progress or pending, keeping state...')
          return
        }
        
        console.log('✅ Final response done, resetting state')
        isProcessingRef.current = false
        rtcClientRef.current?.setMicrophoneEnabled(false)
        wakeWordServiceRef.current?.suppressWakeWord(false)
        wakeWordServiceRef.current?.reset()
        wakeWordServiceRef.current?.start().catch(err => console.error('Wake word restart error', err))
        accumulatedTranscriptRef.current = ''
        userTranscriptRef.current = ''
        setCurrentTranscript('')
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

  // Detect if user is asking for a web search
  const detectSearchIntent = (transcript: string): string | null => {
    const lower = transcript.toLowerCase()
    
    // Explicit search patterns
    const searchPatterns = [
      /search (?:for |the web for |online for )?(.+)/i,
      /look up (.+)/i,
      /find (?:out |information (?:about |on )?)?(.+)/i,
      /what(?:'s| is) (?:the )?(?:latest |recent )?(?:news |happening )(?:about |with |on )?(.+)/i,
      /tell me about (.+)/i,
      /who (?:is |are )(.+)/i,
      /what happened (?:with |to )?(.+)/i,
    ]
    
    for (const pattern of searchPatterns) {
      const match = transcript.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    
    // Keywords that suggest search intent
    const searchKeywords = ['news', 'latest', 'current', 'today', 'yesterday', 'recent', 'update', 'happening']
    if (searchKeywords.some(kw => lower.includes(kw))) {
      // Use the whole transcript as the query
      return transcript
    }
    
    return null
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
      
    } catch (error) {
      console.error('❌ Search error:', error)
      setCurrentTranscript('Search failed')
      setTimeout(() => setCurrentTranscript(''), 2000)
    } finally {
      isSearchingRef.current = false
      pendingSearchQueryRef.current = null
    }
  }

  const handleFunctionCallItem = (event: any) => {
    const item = event.item
    // Only process function_call items
    if (!item || item.type !== 'function_call') {
      return
    }

    console.log('🧰 handleFunctionCallItem:', event)

    const callId = item.call_id || item.id
    if (!callId) return

    console.log('🧰 Registering function call:', callId, item.name)
    toolCallBufferRef.current[callId] = {
      name: item.name,
      arguments: '',
      itemId: item.id,
    }
    isExecutingCommandRef.current = true
  }

  const handleFunctionCallArgumentsDelta = (event: any) => {
    // console.log('🧰 handleFunctionCallArgumentsDelta:', event)
    const callId = event.call_id
    if (!callId) return

    const deltaArgs = event.delta ?? ''
    const existing = toolCallBufferRef.current[callId] ?? { arguments: '' }
    existing.arguments += deltaArgs
    toolCallBufferRef.current[callId] = {
      ...existing,
    }
    isExecutingCommandRef.current = true
  }

  const handleFunctionCallCompleted = (event: any) => {
    console.log('🧰 handleFunctionCallCompleted:', event)
    const callId = event.call_id
    if (!callId) return

    const buffered = toolCallBufferRef.current[callId]
    delete toolCallBufferRef.current[callId]

    const argsString = event.arguments || buffered?.arguments || ''
    const toolName = buffered?.name

    console.log('🧰 Function call ready:', toolName, argsString)

    // Set this BEFORE executing so response.done doesn't reset state
    isAwaitingToolResponseRef.current = true

    if (!toolName) {
      console.warn('⚠️ Function call completed without known tool', event)
      rtcClientRef.current?.sendFunctionCallOutput(callId, 'Unknown tool, unable to execute.')
      isExecutingCommandRef.current = false
      isAwaitingToolResponseRef.current = false
      wakeWordServiceRef.current?.reset()
      return
    }

    void executeTool(callId, toolName, argsString)
  }

  const executeTool = async (callId: string, toolName: string, argsString: string) => {
    const tool = toolMap[toolName]
    if (!tool) {
      const message = `Unknown tool: ${toolName}`
      console.warn('⚠️', message)
      rtcClientRef.current?.sendFunctionCallOutput(callId, message)
      isExecutingCommandRef.current = false
      wakeWordServiceRef.current?.reset()
      return
    }

    let outputMessage = ''
    try {
      const parsedArgs = argsString ? JSON.parse(argsString) : {}
      console.log('⚙️ Executing tool:', toolName, parsedArgs)
      const result = await tool.execute(parsedArgs)
      outputMessage = typeof result === 'string' ? result : JSON.stringify(result)
      console.log('✅ Tool execution complete:', toolName)
    } catch (error) {
      console.error('❌ Tool execution error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown tool error'
      outputMessage = `Tool ${toolName} error: ${errorMessage}`
    } finally {
      console.log('📤 Sending function call output:', outputMessage?.substring(0, 100) + '...')
      // Resume audio before sending output so we can hear the response
      rtcClientRef.current?.resumeAudio()
      rtcClientRef.current?.sendFunctionCallOutput(callId, outputMessage || `Tool ${toolName} executed`)
      isExecutingCommandRef.current = false
      // isAwaitingToolResponseRef is already set in handleFunctionCallCompleted
      // Don't reset wake word yet - wait for the spoken response
    }
  }

  const handleWakeWordDetected = (keywordIndex: number) => {
    // console.log('🎤 Wake word detected:', keywordIndex)

    if (!rtcClientRef.current) return

    if (isProcessingRef.current) {
      // console.log('⏭️ Skipping wake word - processing response')
      return
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

    rtcClientRef.current.setMicrophoneEnabled(true)
    setAssistantState('listening')
    setCurrentTranscript('Listening...')
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
