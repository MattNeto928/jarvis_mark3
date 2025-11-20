# Natural Conversation Flow with OpenAI Realtime API

## Overview

The system now uses **OpenAI's server-side VAD (Voice Activity Detection)** for natural, intuitive conversation flow instead of hardcoded timeouts.

## How It Works

### 1. Wake Word Detection
- System listens for "Jarvis" wake word using Porcupine
- When detected, starts continuous audio streaming to OpenAI

### 2. Natural Turn Detection
- **OpenAI's server_vad** automatically detects:
  - When you start speaking (`input_audio_buffer.speech_started`)
  - When you stop speaking (`input_audio_buffer.speech_stopped`)
  - Natural pauses and silence (700ms threshold)

### 3. Automatic Response Generation
- When silence is detected, OpenAI automatically:
  - Commits the audio buffer
  - Creates a response
  - Generates both text and audio output

### 4. Continuous Conversation
- After response completes (`response.done`):
  - System returns to wake word listening
  - Ready for next interaction
  - No manual intervention needed

## Key Changes

### Before (Hardcoded Timing)
```typescript
// ❌ Manual timeout
setTimeout(() => {
  commitAudio()
  createResponse()
}, 8000)  // Hardcoded 8 seconds
```

### After (Natural VAD)
```typescript
// ✅ OpenAI handles turn detection automatically
turn_detection: {
  type: 'server_vad',
  silence_duration_ms: 700  // Natural pause detection
}
// No manual commit/createResponse needed!
```

## Conversation Flow

```
┌─────────────────────────────────────┐
│  IDLE: Listening for "Jarvis"      │
│  - Porcupine wake word active       │
└──────────────┬──────────────────────┘
               │
               │ "Jarvis" detected
               ▼
┌─────────────────────────────────────┐
│  LISTENING: Streaming audio         │
│  - Continuous audio to OpenAI      │
│  - OpenAI VAD monitoring speech    │
└──────────────┬──────────────────────┘
               │
               │ Silence detected (700ms)
               ▼
┌─────────────────────────────────────┐
│  PROCESSING: OpenAI generating     │
│  - Auto-commits audio              │
│  - Auto-creates response           │
│  - Generates text + audio          │
└──────────────┬──────────────────────┘
               │
               │ Response streaming
               ▼
┌─────────────────────────────────────┐
│  SPEAKING: Playing AI audio        │
│  - Wake word suppressed             │
│  - Audio playback active           │
└──────────────┬──────────────────────┘
               │
               │ response.done event
               ▼
┌─────────────────────────────────────┐
│  IDLE: Back to wake word listening │
│  - Ready for next interaction       │
└─────────────────────────────────────┘
```

## Configuration

### Turn Detection Settings
```typescript
turn_detection: {
  type: 'server_vad',           // Server-side VAD
  threshold: 0.5,                // Voice activity threshold
  prefix_padding_ms: 300,       // Audio before speech start
  silence_duration_ms: 700       // Natural pause detection
}
```

### Fallback Timeout
- **30 seconds** fallback timeout (should never trigger)
- Only used if OpenAI VAD fails
- Logs warning if triggered

## Events Handled

### User Speech Events
- `input_audio_buffer.speech_started` - User started speaking
- `input_audio_buffer.speech_stopped` - User stopped (silence detected)

### Response Events
- `response.output_item.added` - AI starting to respond
- `response.audio_transcript.delta` - Text streaming
- `response.audio.delta` - Audio streaming
- `response.audio.done` - Audio complete
- `response.done` - Full response complete

## Benefits

1. **Natural Conversation** - No hardcoded timeouts
2. **Low Latency** - OpenAI VAD detects silence quickly (700ms)
3. **Intuitive** - Works like talking to a person
4. **Reliable** - Server-side VAD is more accurate
5. **Flexible** - Handles pauses, interruptions naturally

## Testing

1. Say "Jarvis" - Should detect wake word
2. Start speaking - Should see "Listening..." 
3. Pause naturally - After ~700ms, should see "Processing..."
4. Wait for response - AI responds automatically
5. After response - Returns to wake word listening

## Troubleshooting

### If responses don't trigger automatically:
- Check `silence_duration_ms` setting (should be 700ms)
- Verify `turn_detection.type` is `'server_vad'`
- Check console for VAD events

### If wake word doesn't resume:
- Check `response.done` event handler
- Verify wake word service restart logic
- Check console for errors

### If audio doesn't stream:
- Verify WebSocket connection
- Check audio recorder is active
- Ensure `sendAudio()` is being called

## Summary

The system now provides **natural, intuitive conversation** using OpenAI's server-side VAD for turn detection. No hardcoded timeouts - just natural speech patterns!
