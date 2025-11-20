# Quick Start - Wake Word Enabled

## Your Setup is Complete! 🎉

Your Picovoice access key has been configured in the `.env` file and the system is ready to use.

## How to Start

1. **Run the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser:**
   - Navigate to: http://localhost:3000

3. **The Voice Assistant widget should auto-configure:**
   - Your Picovoice key is already loaded from the environment
   - Your OpenAI key is already saved in localStorage
   - The widget should show "Connect" button

4. **Click "Connect"**
   - System initializes wake word detection
   - Status will show: 👂 Listening for "jarvis"

5. **Test it out:**
   - Say: **"Jarvis"**
   - Wait for status to change to: 🎤 Recording...
   - Speak your command/question
   - System processes and responds
   - Returns to listening state

## Expected Behavior

### State Flow:
```
👂 Listening for "jarvis"
    ↓ (say "Jarvis")
🎤 Recording...
    ↓ (speak your command)
⚡ Processing...
    ↓ (AI generates response)
🔊 Speaking...
    ↓ (response finishes)
👂 Listening for "jarvis" (ready for next command)
```

### Console Logs (Check Browser DevTools):
```
✅ Wake word service initialized with keyword: jarvis
👂 Listening for wake word...
🎯 Wake word detected!
🔄 State changed: listening
🎤 User started speaking
📝 USER SAID: [your command]
🤖 AI TRANSCRIPT: [AI response]
🔊 PLAYING audio chunk
✅ Audio response completed
```

## Testing Commands

### General Conversation:
- "Jarvis, what's the weather?"
- "Jarvis, tell me a joke"
- "Jarvis, what time is it?"

### IoT Control (if devices are configured):
- "Jarvis, turn on the lights"
- "Jarvis, make the light blue"
- "Jarvis, set brightness to 50%"

## Troubleshooting

### If wake word doesn't trigger:

1. **Check browser console** for error messages
2. **Check microphone permissions** - browser must have access
3. **Speak clearly** - say "Jarvis" at normal volume
4. **Try adjusting sensitivity** in VoiceAssistant.tsx line 76:
   ```typescript
   sensitivity: 0.7  // Higher = more sensitive (0.0 to 1.0)
   ```

### If you see errors about Picovoice key:

1. Verify the key in `.env` file
2. Restart the dev server (environment variables need reload)
3. Check the key hasn't expired at https://console.picovoice.ai

### If audio keeps recording:

- There's an 8-second automatic timeout
- Check console for timeout messages
- System should auto-stop after 8 seconds

### If TTS triggers the wake word:

- This should be automatically prevented
- Check console for "🔇 Wake word suppressed" messages
- Lower speaker volume if needed

## Key Features Working

✅ **Wake word detection** - Only listens after "Jarvis"
✅ **Auto timeout** - Stops recording after 8 seconds
✅ **TTS suppression** - Won't trigger itself
✅ **State visualization** - See what's happening
✅ **IoT integration** - Control your smart devices
✅ **No stutters** - Smooth audio processing

## Configuration Files

- **Environment variables:** `.env`
- **Wake word service:** `lib/wakeWordService.ts`
- **Voice Assistant:** `components/widgets/VoiceAssistant.tsx`
- **Audio components:** `lib/audioUtilsEnhanced.ts`

## Your API Keys

✅ **OpenAI API Key** - Already configured in localStorage
✅ **Picovoice Access Key** - Configured in `.env`:
   ```
   NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=pXJMLaJhRQnpGXK2TFRQFuYp6emsrITKvwudwd14YtNgXxwixx7O+Q==
   ```

## Next Steps

1. Run `npm run dev`
2. Open http://localhost:3000
3. Click "Connect" in Voice Assistant widget
4. Say "Jarvis" and start talking!

For detailed documentation, see: **WAKE_WORD_SETUP.md**

---

**Have fun with your wake word enabled smart mirror!** 🎤✨
