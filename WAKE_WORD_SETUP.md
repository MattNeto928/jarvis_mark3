# Wake Word Implementation Guide

## Overview

Your Jarvis smart mirror now uses **Picovoice Porcupine** for wake word detection, eliminating the always-listening issues that caused stutters, TTS interruptions, and audio quality problems.

## What Changed

### Before (Always Listening)
- Audio was continuously recorded and sent to OpenAI when "Talk" button was pressed
- Caused stutters from constant processing
- TTS could trigger the microphone (self-triggering)
- No break for the system to breathe

### After (Wake Word Detection)
- System listens ONLY for the wake word (default: "Jarvis")
- Audio is only recorded and sent to OpenAI AFTER wake word is detected
- TTS playback automatically suppresses wake word detection
- Automatic timeout after 8 seconds of recording
- Smooth state transitions with visual feedback

## How It Works

### State Machine

```
┌──────────────────────────────────────────────────┐
│                                                  │
│   IDLE (Listening for wake word)                │
│   - Only Porcupine is active                    │
│   - Minimal CPU/bandwidth usage                 │
│                                                  │
└─────────────┬────────────────────────────────────┘
              │
              │ Wake word detected ("Jarvis")
              ▼
┌──────────────────────────────────────────────────┐
│                                                  │
│   LISTENING (Recording audio)                   │
│   - Sending audio to OpenAI Realtime API        │
│   - Wake word detection still active            │
│   - 8 second timeout                            │
│                                                  │
└─────────────┬────────────────────────────────────┘
              │
              │ User stops speaking (VAD) or timeout
              ▼
┌──────────────────────────────────────────────────┐
│                                                  │
│   PROCESSING                                     │
│   - OpenAI is generating response               │
│   - Wake word detection active                  │
│                                                  │
└─────────────┬────────────────────────────────────┘
              │
              │ Response ready
              ▼
┌──────────────────────────────────────────────────┐
│                                                  │
│   SPEAKING (Playing TTS)                        │
│   - Wake word detection SUPPRESSED              │
│   - Prevents self-triggering                    │
│                                                  │
└─────────────┬────────────────────────────────────┘
              │
              │ Audio playback complete
              │
              └────► Back to IDLE
```

## Setup Instructions

### 1. Get a Picovoice Access Key

1. Go to: https://console.picovoice.ai
2. Sign up for a free account (no credit card required)
3. Navigate to "Access Keys" in the dashboard
4. Click "Create Access Key"
5. Copy the access key (starts with something like `VqP...`)

**Free Tier Includes:**
- Unlimited wake word detections
- All built-in wake words
- No expiration

### 2. Configure the Voice Assistant

1. Open your smart mirror application
2. Go to the Voice Assistant widget
3. Enter your **OpenAI API Key**
4. Enter your **Picovoice Access Key**
5. Click "Configure & Connect"

### 3. Test the Wake Word

1. Wait for the status to show: 👂 Listening for "jarvis"
2. Say: **"Jarvis"** (or your selected wake word)
3. Status changes to: 🎤 Recording...
4. Speak your command/question
5. System processes and responds
6. Returns to listening for wake word

## Available Wake Words

The following built-in wake words are available:

- **jarvis** (default) - "Jarvis"
- **computer** - "Computer"
- **alexa** - "Alexa"
- **hey google** - "Hey Google"
- **hey siri** - "Hey Siri"
- **ok google** - "OK Google"
- **picovoice** - "Picovoice"
- **porcupine** - "Porcupine"
- **bumblebee** - "Bumblebee"
- **americano** - "Americano"
- **blueberry** - "Blueberry"
- **terminator** - "Terminator"
- **grapefruit** - "Grapefruit"

To change the wake word, edit line 23 in `components/widgets/VoiceAssistant.tsx`:

```typescript
const [selectedWakeWord] = useState<'jarvis' | 'computer'>('jarvis')
```

## Key Features

### 1. Audio Suppression During TTS
- Wake word detection is automatically suppressed during TTS playback
- Prevents the assistant from triggering itself
- Applies to both OpenAI audio responses and IoT command confirmations

### 2. Automatic Recording Timeout
- Recording automatically stops after 8 seconds
- Prevents the system from getting stuck in recording mode
- Configurable in the code (see EnhancedAudioRecorder initialization)

### 3. State Visualization
- Visual feedback shows current state
- Icons and colors indicate what the system is doing
- Helps with debugging and user experience

### 4. Seamless Integration
- Works with existing OpenAI Realtime API
- Compatible with IoT device control
- No changes needed to IoT command handling

## Troubleshooting

### Wake Word Not Detected

**Check microphone permissions:**
- Browser must have microphone access
- Check browser console for permission errors

**Try increasing sensitivity:**
Edit `components/widgets/VoiceAssistant.tsx` line 76:
```typescript
sensitivity: 0.7  // Higher = more sensitive (0.0 to 1.0)
```

**Check background noise:**
- Reduce ambient noise
- Speak clearly and at normal volume
- Position microphone properly

### TTS Triggering Wake Word

This should be automatically prevented by wake word suppression. If it still occurs:
- Check console logs for "🔇 Wake word suppressed" messages
- Verify the `suppressWakeWord` calls are working
- Reduce speaker volume

### Recording Timeout Too Short/Long

Edit the timeout value in `components/widgets/VoiceAssistant.tsx` line 85:
```typescript
audioRecorderRef.current = new EnhancedAudioRecorder(10000) // 10 seconds
```

## Files Modified/Created

### New Files
- `lib/wakeWordService.ts` - Wake word detection service
- `lib/audioUtilsEnhanced.ts` - Enhanced audio recorder/player

### Modified Files
- `components/widgets/VoiceAssistant.tsx` - Integrated wake word functionality
- `package.json` - Added Picovoice dependencies

## Console Logs

When working correctly, you should see:

```
✅ Wake word service initialized with keyword: jarvis
👂 Listening for wake word...
🎯 Wake word detected!
🔄 State changed: listening
🎤 User started speaking
🎤 User stopped speaking
📝 USER SAID: turn on the lights
🤖 AI TRANSCRIPT: {...}
🔊 PLAYING audio chunk
✅ Audio response completed
🔄 State changed: idle
```

## Benefits

✅ **No more stutters** - Audio only processed when needed
✅ **No TTS interference** - Smart suppression prevents self-triggering
✅ **Better performance** - Minimal CPU usage in idle state
✅ **Natural interaction** - Just say the wake word and speak
✅ **Visual feedback** - Always know what the system is doing
✅ **Automatic cleanup** - Returns to idle after each interaction

## Advanced Configuration

### Custom Wake Words

You can train custom wake words using Picovoice Console:
1. Go to: https://console.picovoice.ai
2. Click "Porcupine" → "Custom Wake Words"
3. Train your custom wake word
4. Download the `.ppn` file
5. Update the WakeWordService to use the custom file instead of built-in keywords

### Adjusting VAD Settings

Voice Activity Detection (VAD) settings in `lib/realtimeClient.ts` line 133-138:

```typescript
turn_detection: {
  type: 'server_vad',
  threshold: 0.5,              // Sensitivity (0.0 - 1.0)
  prefix_padding_ms: 300,      // Audio before speech
  silence_duration_ms: 500     // Silence to trigger response
}
```

## Support

For issues or questions:
- Check browser console for error messages
- Verify both API keys are valid
- Ensure microphone permissions are granted
- Test with different wake words
- Adjust sensitivity settings

---

**Built with:**
- Picovoice Porcupine (Wake word detection)
- OpenAI Realtime API (Speech recognition & response)
- Web Audio API (Audio processing)
- Next.js 15 & React 19
