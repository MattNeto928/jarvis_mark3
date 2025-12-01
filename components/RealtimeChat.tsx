'use client'

import { useState, useEffect, useRef } from 'react'
import { OpenAIRealtimeWebSocket, RealtimeSession, RealtimeItem } from '@openai/agents/realtime'
import { createJarvisAgent, SESSION_CONFIG, getEphemeralToken } from '@/lib/jarvisAgent'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const VOICES = {
  alloy: 'Alloy - Neutral & Balanced',
  ash: 'Ash - Clear & Articulate',
  ballad: 'Ballad - Smooth & Melodic',
  coral: 'Coral - Warm & Engaging',
  echo: 'Echo - Calm & Clear',
  sage: 'Sage - Wise & Thoughtful',
  shimmer: 'Shimmer - Soft & Gentle',
}

type Voice = keyof typeof VOICES

export default function RealtimeChat() {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [messages, setMessages] = useState<Message[]>([])
  const [apiKey, setApiKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<Voice>('alloy')

  const sessionRef = useRef<RealtimeSession | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const storedKey = localStorage.getItem('openai_api_key')
    if (storedKey) {
      setApiKey(storedKey)
      setIsConfigured(true)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleConnect = async () => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key')
      return
    }

    try {
      setError(null)
      setConnectionStatus('connecting')
      localStorage.setItem('openai_api_key', apiKey)

      // Create Jarvis agent and session (WebSocket transport for compatibility)
      const agent = createJarvisAgent()
      const transport = new OpenAIRealtimeWebSocket({
        useInsecureApiKey: true,
      })

      sessionRef.current = new RealtimeSession(agent, {
        model: SESSION_CONFIG.model,
        transport,
        config: {
          ...SESSION_CONFIG.config,
          voice: selectedVoice,
        },
      })

      // Set up event handlers
      setupSessionEventHandlers()

      // Get ephemeral token and connect to OpenAI
      console.log('🔌 Getting ephemeral token...')
      const ephemeralToken = await getEphemeralToken(apiKey, selectedVoice)
      console.log('✅ Got ephemeral token')
      console.log('   Token prefix:', ephemeralToken?.substring(0, 30) + '...')
      console.log('   Starts with ek_:', ephemeralToken?.startsWith('ek_'))
      
      if (!ephemeralToken || !ephemeralToken.startsWith('ek_')) {
        throw new Error(`Invalid ephemeral token format. Expected ek_... but got: ${ephemeralToken?.substring(0, 10)}...`)
      }
      
      console.log('🔌 Connecting with ephemeral token...')
      await sessionRef.current.connect({ 
        apiKey: ephemeralToken,
        model: SESSION_CONFIG.model,
      })

      setIsConnected(true)
      setConnectionStatus('connected')
      console.log('✅ Connected to OpenAI Realtime API')

    } catch (err) {
      setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setConnectionStatus('error')
      console.error('Connection error:', err)
    }
  }

  const setupSessionEventHandlers = () => {
    if (!sessionRef.current) return

    const session = sessionRef.current

    // Handle when agent starts responding
    session.on('agent_start', () => {
      console.log('🎙️ Response started')
      setCurrentTranscript('')
    })

    // Handle when agent finishes responding
    session.on('agent_end', (_context, _agent, output) => {
      console.log('✅ Response completed:', output)
      if (output) {
        addMessage('assistant', output)
      }
      setCurrentTranscript('')
    })

    // Handle history updates (includes user messages and transcripts)
    session.on('history_updated', (history: RealtimeItem[]) => {
      // Sync messages from history
      const newMessages: Message[] = []
      for (const item of history) {
        if (item.type === 'message') {
          const role = item.role as 'user' | 'assistant'
          const content = 'transcript' in item ? (item.transcript as string) : ''
          if (content) {
            newMessages.push({
              id: item.id || Date.now().toString(),
              role,
              content,
              timestamp: new Date(),
            })
          }
        }
      }
      if (newMessages.length > 0) {
        setMessages(newMessages)
      }
      
      // Update current transcript from last item if it's in progress
      const lastItem = history[history.length - 1]
      if (lastItem && lastItem.type === 'message' && lastItem.role === 'assistant') {
        const transcript = 'transcript' in lastItem ? (lastItem.transcript as string) : ''
        if (transcript && !newMessages.find(m => m.content === transcript)) {
          setCurrentTranscript(transcript)
        }
      }
    })

    // Handle audio interruption
    session.on('audio_interrupted', () => {
      console.log('🛑 Audio interrupted')
      setIsRecording(false)
    })

    // Handle errors
    session.on('error', (error) => {
      console.error('❌ Session error:', error.error)
      const errorMessage = error.error instanceof Error 
        ? error.error.message 
        : String(error.error)
      setError(`API Error: ${errorMessage}`)
    })

    // Auto-approve tool calls
    session.on('tool_approval_requested', (_context, _agent, request) => {
      console.log('🔧 Auto-approving tool:', request)
      session.approve(request.approvalItem)
    })
  }

  const handleDisconnect = () => {
    if (isRecording) {
      stopRecording()
    }
    
    if (sessionRef.current) {
      sessionRef.current.close()
      sessionRef.current = null
    }
    
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  const startRecording = () => {
    if (sessionRef.current && isConnected) {
      // SDK handles audio capture automatically
      setIsRecording(true)
      console.log('🎤 Recording started')
    }
  }

  const stopRecording = () => {
    if (sessionRef.current && isRecording) {
      setIsRecording(false)
      console.log('🎤 Recording stopped')
    }
  }

  const sendTextMessage = (text: string) => {
    if (sessionRef.current && isConnected && text.trim()) {
      // Add user message to UI immediately
      addMessage('user', text)
      // Send to agent
      sessionRef.current.sendMessage(text)
    }
  }

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    }])
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-emerald-500'
      case 'connecting': return 'bg-amber-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      case 'error': return 'Error'
      default: return 'Disconnected'
    }
  }

  if (!isConfigured) {
    return (
      <div className="glass rounded-2xl p-8 shadow-2xl max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">API Configuration</h2>
          <p className="text-gray-400">Enter your OpenAI API key to begin</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
          
          <button
            onClick={() => setIsConfigured(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="glass rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${connectionStatus === 'connecting' ? 'pulse-ring' : ''}`}></div>
              {connectionStatus === 'connected' && (
                <div className={`absolute inset-0 w-3 h-3 rounded-full ${getStatusColor()} animate-ping`}></div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{getStatusText()}</h3>
              <p className="text-sm text-gray-400">Jarvis (OpenAI Agents SDK)</p>
            </div>
          </div>

          {!isConnected && (
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value as Voice)}
                  className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  {(Object.keys(VOICES) as Voice[]).map((voice) => (
                    <option key={voice} value={voice}>
                      {VOICES[voice]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect
            </button>
          ) : (
            <>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex-1 font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 ${
                  isRecording 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isRecording ? (
                  <>
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                    Stop Recording
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Start Recording
                  </>
                )}
              </button>
              <button
                onClick={handleDisconnect}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-xl p-4 border-l-4 border-red-500 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-sm text-gray-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className="glass rounded-2xl p-6 shadow-2xl h-[500px] overflow-y-auto">
        {messages.length === 0 && !currentTranscript && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shimmer">
                <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {isConnected ? 'Ready to Talk' : 'Get Started'}
              </h3>
              <p className="text-gray-400">
                {isConnected 
                  ? 'Click "Start Recording" to begin your conversation' 
                  : 'Connect to the API to start talking with Jarvis'}
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600/90 text-white'
                  : 'bg-white/5 text-white border border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${message.role === 'user' ? 'bg-blue-300' : 'bg-emerald-400'}`}></div>
                <p className="text-xs font-semibold opacity-70">
                  {message.role === 'user' ? 'You' : 'Jarvis'}
                </p>
              </div>
              <p className="text-sm leading-relaxed">{message.content}</p>
              <p className="text-xs opacity-50 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {currentTranscript && (
          <div className="mb-4 flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-5 py-3 bg-white/5 border border-white/10 border-dashed">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                <p className="text-xs font-semibold text-amber-400">
                  Transcribing...
                </p>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{currentTranscript}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Text Input */}
      {isConnected && (
        <div className="glass rounded-xl p-4">
          <form onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.querySelector('input') as HTMLInputElement
            if (input.value.trim()) {
              sendTextMessage(input.value)
              input.value = ''
            }
          }} className="flex gap-3">
            <input
              type="text"
              placeholder="Type a message or use voice..."
              className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Instructions */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-300">
              Connect to begin, then use voice or text to talk with Jarvis. Try: "Turn on the lights" or "Set the LED strip to rainbow mode"
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
