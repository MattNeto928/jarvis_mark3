# Deep Dive: Porcupine Platform Mismatch Diagnostics

## Current Situation

- **File size**: 3,668 bytes (3.6KB)
- **Expected size**: 30-100KB for Web/WASM platform
- **Error**: `INVALID_ARGUMENT` (code 00000136) - "incorrect format or belongs to a different platform"
- **Porcupine SDK**: v3.0.3

## Critical Finding

**Your file is 3.6KB, which is 8-27x smaller than expected for Web/WASM files.**

This strongly suggests the file is **NOT** for the Web/WASM platform, despite what you may have selected.

## Possible Causes

### 1. Wrong Platform Selected (Most Likely)

Even if you selected "Web (WASM)" in Picovoice Console, you might have:
- Downloaded the wrong file by mistake
- Selected a different platform dropdown
- Used an old file from a previous download

**Solution**: 
1. Go to https://console.picovoice.ai/
2. Navigate to: Porcupine → Custom Wake Words → Jarvis
3. Click "Download" 
4. **VERIFY** the dropdown shows "Web (WASM)" (not "Web" or any other option)
5. Download and check file size immediately
6. Should be 30-100KB, not 3-4KB

### 2. Version Mismatch

Porcupine SDK 3.0.3 might require keyword files from a specific version.

**Check**: 
- What version of Porcupine was used to train the keyword?
- Is there a version selector in Picovoice Console?

**Solution**: 
- Re-train the keyword if needed
- Or check if there's a version selector when downloading

### 3. File Corruption

The file might be corrupted or incomplete.

**Check**:
```bash
# Verify file integrity
ls -lh public/wake-words/jarvis.ppn
file public/wake-words/jarvis.ppn
hexdump -C public/wake-words/jarvis.ppn | head -5
```

**Solution**: Re-download the file

### 4. Next.js Static File Serving Issue

Sometimes Next.js doesn't serve binary files correctly.

**Check**: Open `http://localhost:3000/wake-words/jarvis.ppn` in browser
- Should download or show binary data
- Should NOT show HTML error page

**Solution**: Try base64 encoding (code now does this automatically for small files)

## Diagnostic Steps

### Step 1: Verify File Size

```bash
ls -lh public/wake-words/jarvis.ppn
# Should show: 30-100KB (not 3-4KB)
```

### Step 2: Check File Format

```bash
file public/wake-words/jarvis.ppn
hexdump -C public/wake-words/jarvis.ppn | head -10
```

### Step 3: Verify Download Source

1. Check browser download history
2. Verify file name contains "wasm" or "web"
3. Check file modification date matches recent download

### Step 4: Test with Base64

The code now automatically tries base64 encoding for small files. Check console for:
```
🔄 Attempting to load file as base64 instead of publicPath...
✅ Converted to base64, length: XXXX characters
📋 Using base64 encoding instead of publicPath
```

### Step 5: Check Porcupine Console

1. Log into https://console.picovoice.ai/
2. Go to: Porcupine → Custom Wake Words
3. Find "Jarvis"
4. Check:
   - When was it trained?
   - What platforms are available?
   - Is "Web (WASM)" listed?
   - What's the file size shown in console?

## File Size Reference

| Platform | Typical Size | Your File |
|----------|-------------|-----------|
| Web (WASM) | 30-100KB ✅ | 3.6KB ❌ |
| Linux | 3-10KB | 3.6KB ⚠️ |
| macOS | 3-10KB | 3.6KB ⚠️ |
| Windows | 3-10KB | 3.6KB ⚠️ |
| Raspberry Pi | 3-10KB | 3.6KB ⚠️ |

**Your file size matches Linux/Mac/Windows, NOT Web/WASM!**

## Solutions

### Solution 1: Re-download Web/WASM Version

1. **Delete current file:**
   ```bash
   rm public/wake-words/jarvis.ppn
   ```

2. **Download from Picovoice Console:**
   - Go to: https://console.picovoice.ai/
   - Navigate to: Porcupine → Custom Wake Words → Jarvis
   - Click "Download"
   - **VERIFY**: Dropdown shows "Web (WASM)" (not just "Web")
   - Download file

3. **Verify file size BEFORE copying:**
   ```bash
   ls -lh ~/Downloads/jarvis*.ppn
   # Should show 30-100KB
   ```

4. **Copy to project:**
   ```bash
   cp ~/Downloads/jarvis*wasm*.ppn public/wake-words/jarvis.ppn
   # Or if name doesn't have "wasm":
   cp ~/Downloads/jarvis*.ppn public/wake-words/jarvis.ppn
   # Then verify:
   ls -lh public/wake-words/jarvis.ppn
   # Should be 30-100KB
   ```

5. **Restart dev server:**
   ```bash
   npm run dev
   ```

### Solution 2: Use Base64 Encoding

The code now automatically tries base64 for small files. If that works, you can:

1. Convert file to base64:
   ```bash
   node scripts/convert-ppn-to-base64.js
   ```

2. Use the base64 string in your code (modify `VoiceAssistant.tsx`):
   ```typescript
   const wakeWordBase64 = 'PASTE_BASE64_HERE'
   ```

3. Update config to use `keywordBase64` instead of `keywordPath`

### Solution 3: Check Porcupine SDK Compatibility

Verify your Porcupine SDK version matches the keyword file version:

```bash
cat node_modules/@picovoice/porcupine-web/package.json | grep version
# Should show: "version": "3.0.3"
```

If there's a version mismatch, you may need to:
- Update Porcupine SDK
- Or re-download keyword file for SDK 3.0.3

## Enhanced Error Messages

The code now provides detailed diagnostics:

1. **File size warnings** - Warns if file < 10KB
2. **Automatic base64 conversion** - Tries base64 for small files
3. **Enhanced error messages** - Shows all possible causes
4. **Detailed logging** - Logs file size, format, and conversion attempts

## Next Steps

1. **Check console output** when connecting - it will show:
   - File size detected
   - Warnings if file is too small
   - Whether base64 conversion was attempted
   - Detailed error information

2. **Verify file download** - Make absolutely sure you downloaded "Web (WASM)" version

3. **Check file size** - Must be 30-100KB, not 3-4KB

4. **Try base64** - The code will automatically try this for small files

## If Still Not Working

If you've verified:
- ✅ File is 30-100KB
- ✅ Downloaded "Web (WASM)" platform
- ✅ File is not corrupted
- ✅ Porcupine SDK is 3.0.3

Then check:
1. **Browser console** for detailed error messages
2. **Network tab** - Is the file being served correctly?
3. **Porcupine Console** - Is there a version selector?
4. **File headers** - Does the file have correct MIME type?

## Summary

**Most likely issue**: The file is 3.6KB, which matches Linux/Mac/Windows platform files, NOT Web/WASM (30-100KB).

**Action**: Re-download from Picovoice Console, **double-check** you select "Web (WASM)", and verify file size is 30-100KB before using it.
