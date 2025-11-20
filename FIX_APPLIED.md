# Fix Applied - Custom Wake Word API

## Issue
```
Unknown keyword argument: {"custom":"/wake-words/jarvis.ppn","sensitivity":0.5}
```

## Root Cause
The Picovoice Porcupine Web API doesn't use `custom` as the property name for custom wake word files.

## Solution
Changed from:
```typescript
keywordConfig = {
  custom: this.config.keywordPath,  // ❌ Wrong
  sensitivity: this.config.sensitivity || 0.5
}
```

To:
```typescript
keywordConfig = {
  publicPath: this.config.keywordPath,  // ✅ Correct
  sensitivity: this.config.sensitivity || 0.5
}
```

## How to Test

1. **Ensure your jarvis.ppn file is in place:**
   ```bash
   ls -lh public/wake-words/jarvis.ppn
   ```

2. **Restart the dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

3. **Open browser and console:**
   - Go to http://localhost:3000
   - Press F12 → Console tab

4. **Click "Connect" and watch for:**
   ```
   🎯 Loading custom wake word from: /wake-words/jarvis.ppn
   📋 Keyword configuration: {"publicPath":"/wake-words/jarvis.ppn","sensitivity":0.5}
   ✅ Wake word service initialized with: Jarvis
   👂 Listening for wake word...
   ```

5. **Say "Jarvis"** and it should detect!

## Expected Console Output

### Success:
```
🔌 Starting connection process...
🎯 Initializing wake word service...
🎯 Loading custom wake word from: /wake-words/jarvis.ppn
📋 Keyword configuration: {"publicPath":"/wake-words/jarvis.ppn","sensitivity":0.5}
✅ Wake word service initialized with: Jarvis
✅ Audio recorder initialized successfully
✅ Audio player initialized successfully
📡 Connection status changed: connected
👂 Starting wake word detection...
```

### When you say "Jarvis":
```
🎯 Wake word detected: "Jarvis"
🔄 State changed: listening
🎤 Recording...
```

## If You Still Get Errors

### File Not Found
If you see `404` or `Failed to fetch`:
- Verify file exists: `ls public/wake-words/jarvis.ppn`
- Check file permissions: `chmod 644 public/wake-words/jarvis.ppn`
- Restart dev server

### Invalid File Format
If you see `Invalid .ppn file`:
- Ensure you downloaded the **Web** platform version
- File should be binary .ppn format (not text, not zip)
- Try re-downloading from Picovoice Console

### Access Key Error
If you see Picovoice access key errors:
- Verify key in .env: `cat .env | grep PICOVOICE`
- Check key hasn't expired at console.picovoice.ai
- Restart dev server after .env changes

## API Reference

Picovoice Porcupine Web supports these keyword configurations:

### Built-in Keywords:
```typescript
{
  builtin: 'picovoice',
  sensitivity: 0.5
}
```

### Custom Keywords:
```typescript
{
  publicPath: '/path/to/keyword.ppn',  // Served from public directory
  sensitivity: 0.5
}
```

### Custom Keywords (Base64):
```typescript
{
  base64: 'BASE64_ENCODED_PPN_FILE',
  sensitivity: 0.5
}
```

## Documentation

- Picovoice Docs: https://picovoice.ai/docs/
- Porcupine Web SDK: https://github.com/Picovoice/porcupine/tree/master/binding/web
