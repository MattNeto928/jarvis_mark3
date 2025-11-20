# Final Fix - Custom Wake Word API

## Root Cause

The Picovoice Porcupine Web API **requires** a `label` property for custom wake words. This was missing from the configuration.

## What Was Wrong

```typescript
// ❌ Missing required 'label' property
{
  publicPath: '/wake-words/jarvis.ppn',
  sensitivity: 0.5
}
```

## The Fix

```typescript
// ✅ Includes required 'label' property
{
  publicPath: '/wake-words/jarvis.ppn',
  label: 'Jarvis',              // ← REQUIRED for custom keywords
  sensitivity: 0.5
}
```

## According to Picovoice API Docs

From `@picovoice/porcupine-web/dist/types/types.d.ts`:

```typescript
export type PorcupineKeywordCustom = PvModel & {
    /** An arbitrary label that you want Porcupine to report when detection occurs */
    label: string;  // ← REQUIRED!
    /** Value in range [0,1] that trades off miss rate for false alarm */
    sensitivity?: number;  // Optional, defaults to 0.5
};
```

## How to Test Now

1. **Ensure your jarvis.ppn file is in place:**
   ```bash
   ls -lh public/wake-words/jarvis.ppn
   # Should show the file
   ```

2. **Restart the dev server:**
   ```bash
   # Press Ctrl+C to stop
   npm run dev
   ```

3. **Open browser console (F12)**

4. **Click "Connect" - You should now see:**
   ```
   🔌 Starting connection process...
   🎯 Initializing wake word service...
   🎯 Loading custom wake word from: /wake-words/jarvis.ppn
   🏷️  Wake word label: Jarvis
   📋 Keyword configuration: {"publicPath":"/wake-words/jarvis.ppn","label":"Jarvis","sensitivity":0.5}
   ✅ Wake word service initialized with: Jarvis
   ✅ Audio recorder initialized successfully
   ✅ Audio player initialized successfully
   📡 Connection status changed: connected
   👂 Starting wake word detection...
   ```

5. **Say "Jarvis" - Should see:**
   ```
   🎯 Wake word detected: "Jarvis"
   🔄 State changed: listening
   🎤 Recording...
   ```

## Correct API Examples

### Using publicPath (recommended for local files):
```typescript
import { PorcupineWorker } from '@picovoice/porcupine-web'

const porcupine = await PorcupineWorker.create(
  'YOUR_ACCESS_KEY',
  [
    {
      publicPath: '/wake-words/jarvis.ppn',  // Path from public directory
      label: 'Jarvis',                        // Required!
      sensitivity: 0.5                        // Optional (0.0 to 1.0)
    }
  ],
  (detection) => {
    console.log(`Detected: ${detection.label}`)  // Outputs "Jarvis"
  }
)
```

### Using base64 (for embedded files):
```typescript
const porcupine = await PorcupineWorker.create(
  'YOUR_ACCESS_KEY',
  [
    {
      base64: 'BASE64_ENCODED_PPN_STRING',  // Base64 of .ppn file
      label: 'Jarvis',                      // Required!
      sensitivity: 0.5
    }
  ],
  (detection) => {
    console.log(`Detected: ${detection.label}`)
  }
)
```

### Using built-in keywords (no label needed):
```typescript
const porcupine = await PorcupineWorker.create(
  'YOUR_ACCESS_KEY',
  [
    {
      builtin: 'picovoice',  // Built-in keyword name
      sensitivity: 0.5       // Optional
    }
  ],
  (detection) => {
    console.log('Detected built-in keyword')
  }
)
```

## Required vs Optional Properties

### For Custom Keywords:
- **REQUIRED:**
  - `label` (string) - Arbitrary identifier
  - One of: `publicPath` OR `base64` - The wake word file

- **OPTIONAL:**
  - `sensitivity` (number, 0.0-1.0, default: 0.5)
  - `customWritePath` (string)
  - `forceWrite` (boolean)
  - `version` (number)

### For Built-in Keywords:
- **REQUIRED:**
  - `builtin` (string) - Keyword name

- **OPTIONAL:**
  - `sensitivity` (number, 0.0-1.0, default: 0.5)

## Current Configuration

Your system is now configured with:

**File:** `components/widgets/VoiceAssistant.tsx`
```typescript
const wakeWordPath = '/wake-words/jarvis.ppn'
const wakeWordLabel = 'Jarvis'  // This gets passed as the 'label' property
```

**Service:** `lib/wakeWordService.ts`
```typescript
keywordConfig = {
  publicPath: this.config.keywordPath,  // '/wake-words/jarvis.ppn'
  label: this.config.keywordLabel,      // 'Jarvis' ← Now included!
  sensitivity: this.config.sensitivity || 0.5
}
```

## Troubleshooting

### If file not found (404):
```bash
# Verify file exists
ls public/wake-words/jarvis.ppn

# If not, place your .ppn file there
cp /path/to/jarvis.ppn public/wake-words/jarvis.ppn
```

### If invalid .ppn file:
- Ensure you downloaded the **Web** platform version from Picovoice Console
- File should be binary .ppn format (not .zip, not text)

### If still getting "Unknown keyword argument":
- Check console log shows: `"label":"Jarvis"` in the configuration
- Restart dev server after code changes
- Clear browser cache (Ctrl+Shift+R)

## Summary

**The fix:** Added the required `label` property to custom wake word configuration.

**Status:** ✅ Ready to test with your jarvis.ppn file!

**Next step:** Place your jarvis.ppn file in `public/wake-words/` and restart the dev server.
