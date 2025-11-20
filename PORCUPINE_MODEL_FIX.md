# Porcupine Custom Wake Word Fix

## Problem

You were getting these errors:
1. **Hydration error**: "Hydration failed because the server rendered text didn't match the client"
2. **Porcupine API error**: "The provided model doesn't contain a valid publicPath or base64 value"

## Root Cause

The `PorcupineWorker.create()` API requires **two separate model files**:

1. **Porcupine Engine Model** (`.pv` file) - Required for the Porcupine engine itself
2. **Keyword Model** (`.ppn` file) - Your custom wake word file (e.g., `jarvis.ppn`)

The code was missing the **Porcupine engine model** parameter, which is required by the API signature:

```typescript
PorcupineWorker.create(
  accessKey: string,
  keywords: PorcupineKeyword[],
  keywordDetectionCallback: DetectionCallback,
  model: PorcupineModel,  // ← This was missing!
  options?: PorcupineOptions
)
```

## The Fix

### 1. Added Required Model Parameter

Updated `lib/wakeWordService.ts` to include the Porcupine engine model:

```typescript
const porcupineModel = {
  publicPath: '/porcupine_params.pv'  // Porcupine engine model
}

this.porcupine = await PorcupineWorker.create(
  this.config.accessKey,
  [keywordConfig],  // Your custom keyword (.ppn)
  callback,
  porcupineModel,    // ← Now included!
  options
)
```

### 2. Fixed API Call Signature

- Added the missing `model` parameter (4th argument)
- Moved error callback to `options.processErrorCallback` (5th argument)
- Updated detection callback to use `detection.label` from Porcupine

### 3. Added Browser Environment Check

Added a check to prevent SSR/hydration errors:

```typescript
if (typeof window === 'undefined') {
  throw new Error('WakeWordService can only be initialized in a browser environment')
}
```

### 4. Downloaded Porcupine Model File

Created a script to download the required Porcupine engine model:

```bash
./scripts/download-porcupine-model.sh
```

The model file (`porcupine_params.pv`) is now in `public/porcupine_params.pv`.

## File Structure

```
jarvis_mark3/
├── public/
│   ├── porcupine_params.pv    ← Porcupine engine model (NEW)
│   └── wake-words/
│       └── jarvis.ppn          ← Your custom wake word
├── lib/
│   └── wakeWordService.ts      ← Fixed API call
└── scripts/
    └── download-porcupine-model.sh  ← Download script (NEW)
```

## Testing

1. **Verify model file exists:**
   ```bash
   ls -lh public/porcupine_params.pv
   # Should show: -rw-r--r-- ... 961K ... porcupine_params.pv
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```

3. **Open browser console** and click "Connect" in Voice Assistant

4. **Expected console output:**
   ```
   🎯 Loading custom wake word from: /wake-words/jarvis.ppn
   🏷️  Wake word label: Jarvis
   ✅ Porcupine model file found
   📋 Keyword configuration: {"publicPath":"/wake-words/jarvis.ppn","label":"Jarvis","sensitivity":0.5}
   ✅ Wake word service initialized with: Jarvis
   👂 Listening for wake word...
   ```

5. **Say "Jarvis"** - Should detect the wake word!

## If Model File is Missing

If you see an error about the model file:

```bash
# Download it manually:
./scripts/download-porcupine-model.sh

# Or download from:
# https://github.com/Picovoice/porcupine/raw/master/lib/common/porcupine_params.pv
# Place it in: public/porcupine_params.pv
```

## Key Changes

1. ✅ Added `model` parameter to `PorcupineWorker.create()` call
2. ✅ Fixed error callback placement (moved to `options.processErrorCallback`)
3. ✅ Added browser environment check to prevent hydration errors
4. ✅ Added model file verification before initialization
5. ✅ Downloaded required Porcupine engine model file
6. ✅ Updated detection callback to use `detection.label`

## API Reference

According to Porcupine Web SDK v3.0.3:

- **Model parameter** (`PorcupineModel`): Must have either `publicPath` or `base64`
- **Keyword parameter** (`PorcupineKeywordCustom`): Must have `publicPath` or `base64` + `label`
- Both are **required** and **separate** - the engine model is different from keyword files

## Summary

The issue was that Porcupine requires **two model files**:
- Engine model (`.pv`) - for the Porcupine engine
- Keyword model (`.ppn`) - for your custom wake word

The code was only providing the keyword model, missing the required engine model parameter. This has been fixed!
