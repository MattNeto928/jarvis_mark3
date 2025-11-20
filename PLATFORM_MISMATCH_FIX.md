# Fix: Porcupine Keyword File Platform Mismatch

## Error Message

```
Initialization failed: 
  [0] Keyword file (.ppn) file has incorrect format or belongs to a different platform.
  [1] Picovoice Error (code `00000136`)
  [2] Loading keyword file at `Jarvis` failed with `INVALID_ARGUMENT`.
```

## Root Cause

Porcupine keyword files (`.ppn`) are **platform-specific**. The file you have is likely for:
- Linux
- macOS  
- Windows
- Raspberry Pi
- Android
- iOS

But you need the **Web (WASM)** platform version for browsers!

## Solution

### Step 1: Download the Correct Platform Version

1. **Go to Picovoice Console:**
   ```
   https://console.picovoice.ai/
   ```

2. **Navigate to your wake word:**
   - Click **"Porcupine"** in the sidebar
   - Click **"Custom Wake Words"**
   - Find your wake word (e.g., "Jarvis")
   - Click on it to open details

3. **Download the Web/WASM version:**
   - Click **"Download"** button
   - **IMPORTANT:** Select platform: **"Web (WASM)"** ← This is critical!
   - **DO NOT** select Linux, Mac, Windows, etc.
   - The file will download (usually 30-100KB)

4. **Replace the file:**
   ```bash
   # Backup the old file (optional)
   mv public/wake-words/jarvis.ppn public/wake-words/jarvis.ppn.backup
   
   # Copy the new Web/WASM file to the correct location
   cp ~/Downloads/jarvis_en_wasm_v3_0_0.ppn public/wake-words/jarvis.ppn
   
   # Or if it has a different name:
   cp ~/Downloads/*wasm*.ppn public/wake-words/jarvis.ppn
   ```

### Step 2: Verify the File

```bash
# Check file size (Web/WASM files are usually 30-100KB)
ls -lh public/wake-words/jarvis.ppn

# Should show something like:
# -rw-r--r-- 1 user user 45K ... jarvis.ppn
```

**Warning signs:**
- File size < 10KB → Probably wrong platform
- File size > 200KB → Probably wrong platform  
- File name contains `linux`, `mac`, `windows`, `raspberry` → Wrong platform!

**Correct file:**
- File name contains `wasm` or `web`
- File size: 30-100KB typically
- Platform selected: "Web (WASM)" in Picovoice Console

### Step 3: Test

1. **Restart dev server:**
   ```bash
   npm run dev
   ```

2. **Open browser console** (F12)

3. **Click "Connect"** in Voice Assistant

4. **Expected output:**
   ```
   🎯 Loading custom wake word from: /wake-words/jarvis.ppn
   🏷️  Wake word label: Jarvis
   ⚠️  IMPORTANT: Ensure the .ppn file is for "Web (WASM)" platform!
   ✅ File found, file size: 45000 bytes
   ✅ Porcupine model file found
   ✅ Wake word service initialized with: Jarvis
   ```

5. **Say "Jarvis"** - Should work!

## Quick Checklist

- [ ] Went to https://console.picovoice.ai/
- [ ] Navigated to: Porcupine → Custom Wake Words
- [ ] Found my wake word (e.g., "Jarvis")
- [ ] Clicked "Download"
- [ ] Selected platform: **"Web (WASM)"** ← Critical!
- [ ] Saved file to: `public/wake-words/jarvis.ppn`
- [ ] File size is 30-100KB (not 3-4KB)
- [ ] Restarted dev server
- [ ] Tested wake word detection

## Common Mistakes

❌ **Wrong:** Downloading Linux version for web app  
✅ **Right:** Downloading Web (WASM) version

❌ **Wrong:** Using a 3KB file (too small)  
✅ **Right:** Using a 30-100KB file (correct size)

❌ **Wrong:** File name like `jarvis_en_linux_v3_0_0.ppn`  
✅ **Right:** File name like `jarvis_en_wasm_v3_0_0.ppn`

## File Size Reference

| Platform | Typical Size |
|----------|-------------|
| Web (WASM) | 30-100KB ✅ |
| Linux | 3-10KB ❌ |
| macOS | 3-10KB ❌ |
| Windows | 3-10KB ❌ |
| Raspberry Pi | 3-10KB ❌ |

## Still Having Issues?

1. **Check file name:**
   ```bash
   ls -lh public/wake-words/
   # Should see jarvis.ppn with wasm in name or 30-100KB size
   ```

2. **Check browser console:**
   - Look for the exact error message
   - Check if file size warning appears

3. **Re-download from Picovoice Console:**
   - Make absolutely sure you select **"Web (WASM)"**
   - Try downloading again

4. **Verify file format:**
   ```bash
   file public/wake-words/jarvis.ppn
   # Should show: data (binary file)
   ```

## Summary

The error occurs because Porcupine keyword files are platform-specific. You must download the **Web (WASM)** platform version from Picovoice Console, not Linux/Mac/Windows versions.

**Key point:** Always select **"Web (WASM)"** when downloading .ppn files for web browsers!
