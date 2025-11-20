# Wake Word Files

Place your custom Porcupine wake word `.ppn` files in this directory.

## How to Get Your Custom Wake Word

1. Go to: https://console.picovoice.ai
2. Log in with your account
3. Navigate to: **Porcupine** → **Custom Wake Words**
4. Click **"Train Wake Word"**
5. Follow the training process:
   - Enter the wake word phrase (e.g., "Jarvis")
   - Record or generate training samples
   - Wait for training to complete
6. **Download the `.ppn` file**
7. Place it in this directory

## File Naming

The default configuration expects:
- **File name:** `jarvis.ppn`
- **Full path:** `public/wake-words/jarvis.ppn`

## Using a Different Wake Word

If you name your file differently or use a different wake word:

1. Place your `.ppn` file in this directory (e.g., `hey-jarvis.ppn`)
2. Update `components/widgets/VoiceAssistant.tsx`:

```typescript
// Change these lines (around line 23-24):
const wakeWordPath = '/wake-words/hey-jarvis.ppn'  // Your file name
const wakeWordLabel = 'Hey Jarvis'                 // Display name
```

## Current Configuration

**Expected file:** `jarvis.ppn`

**To add it:**
```bash
# Copy your downloaded .ppn file to:
cp ~/Downloads/jarvis_en_linux_v3_0_0.ppn public/wake-words/jarvis.ppn

# Or whatever your .ppn file is named
```

## Supported Platforms

Porcupine provides different `.ppn` files for different platforms. For web browsers, you need:
- **Web** or **WASM** version of the `.ppn` file
- Platform-specific files (linux, mac, windows, etc.) won't work in the browser

When downloading from Picovoice Console, make sure to select **"Web"** as the platform.

## Testing Your Wake Word

After placing the file:

1. Restart the dev server: `npm run dev`
2. Open http://localhost:3000
3. Click "Connect" in Voice Assistant
4. Check browser console for:
   - `🎯 Loading custom wake word from: /wake-words/jarvis.ppn`
   - `✅ Wake word service initialized with: Jarvis`
5. Say your wake word and check if it's detected!

## Troubleshooting

**Error: "Failed to fetch wake word file"**
- File must be in `public/wake-words/` directory
- File name must match the path in code
- Restart dev server after adding file

**Error: "Invalid wake word file"**
- Ensure you downloaded the **Web/WASM** version
- File should be a `.ppn` file (not .zip or other format)
- File should not be corrupted (try re-downloading)

**Wake word not detected**
- Adjust sensitivity in VoiceAssistant.tsx (line ~88)
- Speak clearly and at normal volume
- Check microphone permissions
- Verify the wake word phrase you trained matches what you're saying
