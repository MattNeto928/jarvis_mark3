# UART Transmission Fix - Summary

## Problem
The LLM was generating JSON that might have been:
1. Pretty-printed (with newlines and spaces)
2. Wrapped in markdown code blocks
3. Mixed with friendly text

This caused the Arduino ESP32 to fail parsing.

## Solution

### 1. **Enhanced JSON Parsing** (`lib/iotTypes.ts`)
- Strips markdown code blocks (`\`\`\`json`)
- Extracts only the JSON portion
- Re-serializes in compact format
- Added logging at parse stage

### 2. **Compact Transmission** (`lib/uartService.ts`)
- Validates packet schema before sending
- Creates compact JSON string (no whitespace)
- Logs the exact bytes being sent
- Shows size for verification

### 3. **Enhanced Python Script** (`app/api/iot/uart/route.ts`)
- Uses `separators=(',', ':')` for compact JSON
- Adds `ensure_ascii=False` for clean encoding
- Validates JSON before sending
- Comprehensive logging:
  - Connection status
  - Bytes being sent
  - First 100 chars preview
  - Transmission confirmation

### 4. **Updated LLM Instructions** (`lib/realtimeClient.ts`)
**New Critical Rules:**
- Output JSON on a SINGLE LINE (no pretty printing)
- Do NOT wrap in markdown code blocks
- Put JSON at START of response
- Follow with friendly message after

**Examples now show:**
```
User: "Make the LED strip solid red"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{...}} Setting LED strip to solid red.
```

## What Gets Sent Over UART

**Exactly this (compact, single line):**
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"solid","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":1.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}}\n
```

**NOT this (pretty-printed):**
```json
{
  "dst": "node_01",
  "src": "jetson",
  ...
}
```

## Verification

### Check These Logs:

1. **Browser Console:**
   ```
   📋 Parsed UART packet: {...}
   ✅ Packet validation passed
   📦 Compact JSON to send: {"dst":"node_01",...}
   📏 Size: 234 bytes
   ```

2. **Terminal (Next.js server):**
   ```
   📡 Connected to /dev/ttyTHS1 @ 115200
   📤 Sending 235 bytes over UART
   📦 Payload: {"dst":"node_01",...}
   ✅ Transmission complete
   ```

3. **ESP32 Serial Monitor:**
   ```
   Raw JSON received (len=234):
   {"dst":"node_01","src":"jetson","device":"led",...}
   ```

All three should show the **SAME compact JSON string**.

## If It Still Fails

### Check the Arduino Serial Output
The ESP32 will print:
1. `Raw JSON received (len=XXX):` - Shows what was received
2. `JSON parse failed: ...` - Shows ArduinoJson error if parsing fails

### Common Issues:

**1. Buffer overflow (len > 512)**
- JSON is too large for the 512-byte buffer
- Reduce field names or values if possible

**2. Invalid JSON syntax**
- Check the "Raw JSON received" output
- Look for extra characters or missing braces

**3. Wrong delimiter**
- Python script sends `\n` at the end
- Ensure UART receiver expects newline terminator

**4. Encoding issues**
- Check for non-ASCII characters
- Verify baud rate matches (115200)

## Files Changed

- ✅ `lib/iotTypes.ts` - Enhanced parsing with markdown stripping
- ✅ `lib/uartService.ts` - Added compact JSON logging
- ✅ `lib/realtimeClient.ts` - Updated LLM instructions for compact format
- ✅ `app/api/iot/uart/route.ts` - Enhanced Python script with better logging
- ✅ `LED_STRIP_SCHEMA.md` - Updated documentation
- ✅ `UART_FIX_SUMMARY.md` - This file

## Next Steps

1. Test with: "Make the LED strip solid yellow"
2. Check all three log locations for compact JSON
3. Verify ESP32 receives and parses successfully
4. If still failing, share:
   - Browser console logs
   - Terminal Python script output
   - ESP32 serial monitor output
