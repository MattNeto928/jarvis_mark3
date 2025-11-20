# LED Strip Command Schema

## Overview
The LLM now generates **direct UART packets** in **compact, single-line format** that match the exact format your Arduino ESP32 expects.

## ⚠️ CRITICAL: Format Requirements
1. **Single line** - No newlines or pretty printing in the JSON
2. **No markdown** - No ``` code blocks
3. **Compact** - No extra spaces between keys/values
4. **Clean parsing** - System strips any markdown if present

## Correct Format

### LED Strip Commands (UART)
```json
{
  "dst": "node_01",
  "src": "jetson",
  "device": "led",
  "payload": {
    "state": "on",
    "mode": "solid",
    "color": {"r": 255, "g": 0, "b": 0},
    "color2": {"r": 0, "g": 0, "b": 0},
    "brightness": 1.0,
    "transition_ms": 500,
    "duration_ms": 0,
    "effect": {
      "speed": 0.5,
      "direction": "cw"
    }
  }
}
```

### Tuya Light Commands (Network)
```json
{
  "type": "light",
  "transport": "network",
  "deviceId": "eb506e78c700b185a2ppjq",
  "action": "power",
  "value": true
}
```

## Required Fields

### UART Packet Structure
- **dst**: `"node_01"` (always - target ESP32 node)
- **src**: `"jetson"` (always - source system)
- **device**: `"led"` (always - device type)
- **payload**: Object with LED settings

### Payload Structure (ALL REQUIRED)
- **state**: `"on"` | `"off"`
- **mode**: `"solid"` | `"breath"` | `"rainbow"` | `"chase"` | `"heart_rate"`
- **color**: `{"r": 0-255, "g": 0-255, "b": 0-255}`
- **color2**: `{"r": 0-255, "g": 0-255, "b": 0-255}` (use `{"r":0,"g":0,"b":0}` if not needed)
- **brightness**: `0.0-1.0` (float)
- **transition_ms**: number (milliseconds)
- **duration_ms**: number (0 = infinite)
- **effect**: Object (see below)

### Effect Object (REQUIRED)
- **speed**: `0.0-1.0` (REQUIRED)
- **direction**: `"cw"` | `"ccw"` (REQUIRED)
- **min_brightness**: `0.0-1.0` (optional - for breath/heart_rate)
- **width**: `0.0-1.0` (optional - for chase mode)
- **spacing**: `0.0-1.0` (optional - for chase mode)
- **count**: number (optional - for chase mode)

## Examples

### Solid Red
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"solid","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":1.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}}
```

### Breathing Blue
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"breath","color":{"r":0,"g":100,"b":255},"color2":{"r":0,"g":0,"b":0},"brightness":0.8,"transition_ms":1000,"duration_ms":0,"effect":{"speed":0.3,"direction":"cw","min_brightness":0.1}}}
```

### Rainbow
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"rainbow","color":{"r":0,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":0.5,"transition_ms":0,"duration_ms":0,"effect":{"speed":0.8,"direction":"ccw"}}}
```

### Chase (Red/Blue)
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"chase","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":255},"brightness":0.7,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.6,"direction":"cw","width":0.15,"spacing":0.15,"count":3}}}
```

### Turn Off
```json
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"off","mode":"solid","color":{"r":0,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":0.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}}
```

## What Changed

### Before (WRONG ❌)
```json
{
  "type": "led_strip",
  "transport": "uart",
  "deviceId": "led_strip_01",
  "action": "set_effect",
  "value": { ...payload... }
}
```

### After (CORRECT ✅)
```json
{
  "dst": "node_01",
  "src": "jetson",
  "device": "led",
  "payload": { ...payload... }
}
```

## Validation

The system now includes strict schema validation:
- All required fields are checked before sending
- Clear error messages if fields are missing
- TypeScript type safety enforces the schema at compile time

## Code Flow

```
User: "Make LED strip blue"
  ↓
LLM generates UART packet (single line, compact)
  ↓
parseIoTCommand() strips markdown, extracts JSON
  ↓
IoTController.handleUartPacket()
  ↓
sendDirectUartPacket() validates schema
  ↓
Python script sends compact JSON over UART
  ↓
Master ESP32 receives via UART
  ↓
Master ESP32 forwards via ESP-NOW to node_01
  ↓
Target ESP32 (node_01) receives and executes
```

## Debug Logging

The system now includes comprehensive logging at each step:

### 1. Parsing Stage (`iotTypes.ts`)
```
📋 Parsed UART packet: {compact JSON shown here}
```

### 2. Validation Stage (`uartService.ts`)
```
📤 Preparing UART Packet
📋 Packet structure: {formatted for readability}
✅ Packet validation passed
📦 Compact JSON to send: {actual bytes to send}
📏 Size: XXX bytes
```

### 3. Transmission Stage (Python script)
```
📡 Connected to /dev/ttyTHS1 @ 115200
📤 Sending XXX bytes over UART
📦 Payload: {compact JSON}
🔍 First 100 chars: ...
✅ Transmission complete
```

### 4. Arduino Reception (ESP32 Serial Monitor)
```
Raw JSON received (len=XXX):
{the actual JSON received}
```

## Troubleshooting

### Issue: "JSON parse failed" on Arduino
**Cause**: Arduino received malformed JSON
**Check**:
1. Look at Python script output - is the JSON compact?
2. Check Arduino serial monitor - what was actually received?
3. Verify no extra text before/after the JSON

### Issue: Validation fails before sending
**Cause**: Missing required fields
**Solution**: Check the validation error message - it tells you exactly which field is missing

### Issue: LLM generates pretty-printed JSON
**Cause**: LLM not following instructions
**Solution**: System now strips markdown and reformats, but verify logs show compact output

## Testing

To test the complete flow:

1. Say: "Make the LED strip solid red"
2. Check browser console for:
   - `📋 Parsed UART packet`
   - `✅ Packet validation passed`
   - `📦 Compact JSON to send`
3. Check terminal running Next.js for Python script output
4. Check ESP32 serial monitor for received JSON

All logs should show the same compact JSON string.
