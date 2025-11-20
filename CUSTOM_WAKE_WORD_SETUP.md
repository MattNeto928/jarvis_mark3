# Custom Wake Word Setup Guide

Perfect! You're right that "jarvis" isn't a built-in keyword. The system is now configured to use your custom `.ppn` file.

## 📁 Where to Place Your .ppn File

Place your custom Jarvis wake word file here:

```
public/wake-words/jarvis.ppn
```

**Full path from project root:**
```
/home/matt/smart-mirror/jarvis_mark3/public/wake-words/jarvis.ppn
```

## 📥 How to Get/Import Your Wake Word File

### Option 1: You Already Have a .ppn File

If you already have a `jarvis.ppn` file:

```bash
# Copy it to the correct location
cp /path/to/your/jarvis.ppn public/wake-words/jarvis.ppn

# Example if it's in Downloads:
cp ~/Downloads/jarvis_en_linux_v3_0_0.ppn public/wake-words/jarvis.ppn
```

### Option 2: Download from Picovoice Console

1. Go to: https://console.picovoice.ai
2. Log in with your account
3. Navigate to: **Porcupine** → **Custom Wake Words**
4. If you already trained "Jarvis":
   - Find it in your list
   - Click **"Download"**
   - **CRITICAL:** Select platform: **"Web (WASM)"** ← Must be Web/WASM, not Linux/Mac/Windows!
   - Download the `.ppn` file (should be 30-100KB)
5. Copy to the project:
   ```bash
   # Make sure you're using the Web/WASM version!
   cp ~/Downloads/jarvis*wasm*.ppn public/wake-words/jarvis.ppn
   
   # Or if the file name doesn't have "wasm" in it, check the size:
   # Web/WASM files are usually 30-100KB, other platforms are 3-10KB
   ls -lh ~/Downloads/jarvis*.ppn
   ```

### Option 3: Train a New Wake Word

If you need to train a new "Jarvis" wake word:

1. Go to: https://console.picovoice.ai
2. Navigate to: **Porcupine** → **Custom Wake Words**
3. Click **"Train Wake Word"**
4. Enter wake word: **"Jarvis"**
5. Choose training method:
   - **Quick train:** Use AI-generated samples (faster)
   - **Custom train:** Record your own voice (more accurate)
6. Wait for training to complete (usually 5-10 minutes)
7. Download the `.ppn` file for **Web** platform
8. Copy to project:
   ```bash
   cp ~/Downloads/jarvis*.ppn public/wake-words/jarvis.ppn
   ```

## ✅ Verify File is in Place

```bash
# Check if file exists
ls -lh public/wake-words/jarvis.ppn

# Should show something like:
# -rw-r--r-- 1 user user 45K Jan 1 12:00 public/wake-words/jarvis.ppn
```

## 🚀 Start the System

Once the file is in place:

```bash
# Start the dev server
npm run dev
```

## 🧪 Test the Wake Word

1. Open http://localhost:3000
2. Open browser console (F12 → Console tab)
3. Click "Connect" in Voice Assistant widget
4. Look for these console messages:

```
🎯 Loading custom wake word from: /wake-words/jarvis.ppn
✅ Wake word service initialized with: Jarvis
👂 Listening for wake word...
```

5. Say **"Jarvis"** clearly
6. Should see:
```
🎯 Wake word detected: "Jarvis"
🔄 State changed: listening
```

## 🔧 Configuration Details

The system is configured in `components/widgets/VoiceAssistant.tsx`:

```typescript
// Line 24-25
const wakeWordPath = '/wake-words/jarvis.ppn'
const wakeWordLabel = 'Jarvis'
```

### Using a Different File Name

If your file is named differently:

```typescript
// Example: hey-jarvis.ppn
const wakeWordPath = '/wake-words/hey-jarvis.ppn'
const wakeWordLabel = 'Hey Jarvis'
```

### Adjusting Sensitivity

If wake word detection is too sensitive or not sensitive enough:

```typescript
// In VoiceAssistant.tsx, around line 100
wakeWordServiceRef.current = new WakeWordService({
  accessKey: picovoiceKey,
  keywordPath: wakeWordPath,
  keywordLabel: wakeWordLabel,
  sensitivity: 0.5  // Adjust: 0.0 (less sensitive) to 1.0 (more sensitive)
})
```

## 📋 Expected Console Output

### Successful Initialization:

```
🔍 Loading configuration...
Environment Picovoice Key: pXJMLaJhR...
✅ Using Picovoice key from: environment
✅ Auto-configured with both keys
🔌 Starting connection process...
API Key present: true
Picovoice Key present: true
🎯 Initializing wake word service...
🎯 Loading custom wake word from: /wake-words/jarvis.ppn
✅ Wake word service initialized with: Jarvis
✅ Audio recorder initialized successfully
✅ Audio player initialized successfully
📡 Connection status changed: connected
👂 Starting wake word detection...
```

### Wake Word Detection:

```
🎯 Wake word detected: "Jarvis"
🔄 State changed: listening
🎤 User started speaking
📝 USER SAID: [your command]
```

## ❌ Troubleshooting

### Error: "Failed to fetch wake word file"

**Solution:**
- Verify file exists: `ls public/wake-words/jarvis.ppn`
- Check file name matches exactly (case-sensitive)
- Restart dev server after adding file

### Error: "Invalid wake word file" or "Failed to initialize Porcupine"

**Possible causes:**
1. **Wrong platform:** File must be **Web (WASM)** version, not Linux/Mac/Windows/Raspberry Pi
2. **Corrupted file:** Try re-downloading
3. **Wrong format:** Must be `.ppn` file (not .zip, .txt, etc.)

**Solution:**
- Re-download from Picovoice Console
- **CRITICAL:** Make sure to select **"Web (WASM)"** as platform (not "Web" or any other platform)
- Verify file size is reasonable:
  - ✅ Web/WASM: 30-100KB (correct)
  - ❌ Linux/Mac/Windows: 3-10KB (wrong platform!)
- Check file name contains "wasm" or "web" (not "linux", "mac", "windows")

### Wake Word Not Detected

**Solutions:**
1. **Increase sensitivity:**
   ```typescript
   sensitivity: 0.7  // Higher = more sensitive
   ```

2. **Check microphone:**
   - Ensure browser has microphone permission
   - Test: `navigator.mediaDevices.getUserMedia({ audio: true })`

3. **Speak clearly:**
   - Say "Jarvis" clearly and at normal volume
   - Try different pronunciations
   - Position microphone properly

4. **Check training:**
   - Verify the wake word you trained matches what you're saying
   - Consider retraining with your own voice samples

## 📝 File Structure

```
jarvis_mark3/
├── public/
│   └── wake-words/
│       ├── jarvis.ppn        ← Your wake word file goes here
│       ├── README.md          ← Instructions
│       └── .gitkeep
├── components/
│   └── widgets/
│       └── VoiceAssistant.tsx ← Wake word configuration
└── lib/
    └── wakeWordService.ts     ← Wake word logic
```

## 🎯 Quick Checklist

- [ ] Downloaded `.ppn` file from Picovoice Console (Web platform)
- [ ] File named `jarvis.ppn`
- [ ] File placed in `public/wake-words/` directory
- [ ] Verified file exists: `ls public/wake-words/jarvis.ppn`
- [ ] Restarted dev server: `npm run dev`
- [ ] Opened browser console to check logs
- [ ] Clicked "Connect" in Voice Assistant
- [ ] Saw "✅ Wake word service initialized with: Jarvis"
- [ ] Tried saying "Jarvis"

## 💡 Tips

1. **Train with your own voice** for better accuracy
2. **Adjust sensitivity** if false positives/negatives occur
3. **Check console logs** for detailed error messages
4. **Test in quiet environment** first
5. **Speak at normal volume** - not too loud or soft

---

**Ready to test? Place your `jarvis.ppn` file in `public/wake-words/` and restart the dev server!**
