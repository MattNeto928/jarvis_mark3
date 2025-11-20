# Troubleshooting Guide

## "Failed to connect. Please check your API keys and try again."

This error happens during the connection initialization. Follow these steps to diagnose:

### Step 1: Restart the Dev Server

**IMPORTANT:** After adding the Picovoice key to `.env`, you MUST restart the dev server.

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 2: Open Browser Console

1. Open http://localhost:3000
2. Press **F12** to open Developer Tools
3. Click the **Console** tab
4. Keep the console open while testing

### Step 3: Check Initial Logs

When the page loads, you should see:

```
🔍 Loading configuration...
Environment Picovoice Key: pXJMLaJhR...
Stored API Key: found
✅ Using Picovoice key from: environment
✅ Auto-configured with both keys
```

**If you see:**
- `Environment Picovoice Key: not found` → Server needs restart OR .env file issue
- `Stored API Key: not found` → Need to configure OpenAI key

### Step 4: Click "Connect" and Watch Console

You should see logs in this order:

```
🔌 Starting connection process...
API Key present: true
Picovoice Key present: true
Picovoice Key length: 52
🎯 Initializing wake word service...
✅ Wake word service initialized successfully
🎤 Initializing audio recorder...
✅ Audio recorder initialized successfully
🔊 Initializing audio player...
✅ Audio player initialized successfully
🌐 Connecting to OpenAI Realtime API...
📡 Connection status changed: connected
👂 Starting wake word detection...
```

## Common Errors and Solutions

### Error: "Wake word initialization failed"

**Possible causes:**

1. **Invalid Picovoice Access Key**
   - Verify the key at: https://console.picovoice.ai
   - Check the key hasn't expired
   - Ensure you copied the complete key (with `==` at the end)

2. **Picovoice library not loaded**
   - Run: `npm install` to ensure packages are installed
   - Check that `@picovoice/porcupine-web` is in node_modules

3. **Browser compatibility**
   - Porcupine requires WebAssembly support
   - Try a modern browser (Chrome, Firefox, Edge)
   - Check browser console for WASM errors

**Test the key manually:**
```typescript
// In browser console:
import { testPicovoiceKey } from './lib/testPicovoice'
testPicovoiceKey('your-key-here')
```

### Error: "Audio recorder initialization failed"

**Possible causes:**

1. **Microphone permission denied**
   - Browser will ask for microphone permission
   - Click "Allow" when prompted
   - Check browser settings if already denied

2. **No microphone available**
   - Ensure a microphone is connected
   - Check system sound settings
   - Try a different microphone

3. **Microphone in use by another app**
   - Close other apps using the microphone
   - Restart the browser

**Check microphone manually:**
```javascript
// In browser console:
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(() => console.log('✅ Microphone access granted'))
  .catch(err => console.error('❌ Microphone error:', err))
```

### Error: Connection to OpenAI failed

**Possible causes:**

1. **Invalid OpenAI API Key**
   - Verify at: https://platform.openai.com/api-keys
   - Ensure key has credits/billing enabled
   - Check key permissions

2. **Network connectivity**
   - Check internet connection
   - Check firewall settings
   - Try disabling VPN

3. **API Rate limits**
   - Check OpenAI usage dashboard
   - Wait a few minutes and retry

## Environment Variable Issues

### .env file not loading

**Check these:**

1. File is named exactly `.env` (not `.env.txt`)
2. File is in the project root directory
3. Dev server was restarted after adding variables
4. Variable starts with `NEXT_PUBLIC_` for client-side access

**Verify in browser console:**
```javascript
// In browser console:
console.log(process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY)
// Should show your key, not undefined
```

### Key showing as undefined

**Solutions:**

1. **Restart the dev server** (most common fix)
   ```bash
   # Ctrl+C to stop
   npm run dev
   ```

2. **Clear browser cache**
   - Hard reload: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

3. **Check .env file syntax**
   ```bash
   # Correct:
   NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=pXJMLaJhRQnpGXK2TFRQFuYp6emsrITKvwudwd14YtNgXxwixx7O+Q==

   # Wrong (no spaces, no quotes):
   NEXT_PUBLIC_PICOVOICE_ACCESS_KEY = "key here"
   ```

## Debugging Steps

### 1. Verify Environment Variables

```bash
# Check .env file
cat .env | grep PICOVOICE

# Should show:
# NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=pXJMLaJhRQnpGXK2TFRQFuYp6emsrITKvwudwd14YtNgXxwixx7O+Q==
```

### 2. Check Package Installation

```bash
# Verify Picovoice packages
npm list @picovoice/porcupine-web @picovoice/web-voice-processor

# Should show:
# ├── @picovoice/porcupine-web@3.0.3
# └── @picovoice/web-voice-processor@4.0.9
```

### 3. Test in Clean State

```bash
# Clear all caches and rebuild
rm -rf .next node_modules
npm install
npm run dev
```

### 4. Check Browser Compatibility

**Requirements:**
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- WebAssembly support (enabled by default in modern browsers)
- Secure context (HTTPS or localhost)

**Test WebAssembly:**
```javascript
// In browser console:
console.log(typeof WebAssembly)
// Should show: "object"
```

## Still Having Issues?

### Collect Debug Information

1. **Browser console logs** - Copy all logs from clicking "Connect"
2. **Browser version** - Help → About
3. **Operating system** - Windows/Mac/Linux version
4. **Error messages** - Complete error text

### Fallback: Manual Configuration

If environment variables aren't working, you can manually enter keys:

1. Comment out auto-configuration in VoiceAssistant.tsx
2. Manually enter both keys in the UI
3. Click "Configure & Connect"

### Get Help

With the debug information above, you can:
- Check browser console for specific error messages
- Search the error message online
- Check Picovoice documentation: https://picovoice.ai/docs/
- Verify OpenAI API status: https://status.openai.com/

## Quick Fixes Checklist

- [ ] Restarted dev server after adding .env
- [ ] Verified .env file exists and has correct format
- [ ] Checked browser console for specific errors
- [ ] Granted microphone permissions
- [ ] Verified both API keys are valid
- [ ] Using a modern browser
- [ ] Internet connection is working
- [ ] No firewall blocking WebSocket connections
- [ ] Cleared browser cache and hard reloaded

---

**Most Common Fix:** Restart the dev server! 🔄
