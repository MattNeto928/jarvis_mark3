# UART Transmission Diagnostics

## Changes Made

### 1. Frontend Notification System
✅ Added subtle visual confirmation when commands execute
- **Green notification**: Command executed successfully
- **Red notification**: Command failed (check console)
- Auto-dismisses after 3-5 seconds

### 2. Enhanced Logging Throughout
Added comprehensive logging at every step:

#### Frontend (`VoiceAssistant.tsx`)
```
📤 Executing command 1/1: {command}
✅ Command 1 result: {result}
✨ 1 command(s) executed successfully
```

#### UART Service (`uartService.ts`)
```
📤 Preparing UART Packet
📋 Packet structure: {formatted}
✅ Packet validation passed
📦 Compact JSON to send: {compact}
📏 Size: XXX bytes
```

#### API Endpoint (`app/api/iot/uart/route.ts`)
```
🔌 UART API endpoint called
📦 Request body: {body}
✅ Packet received: {packet}
⚙️ Final config: {config}
🐍 Spawning Python script...
⚡ Python process spawned, PID: XXXX
📤 Python stdout: {output}
📡 Python stderr: {errors}
🏁 Python process exited with code X
✅ UART command successful
```

#### Python Script
```
📡 Connected to /dev/ttyTHS1 @ 115200
📤 Sending XXX bytes over UART
📦 Payload: {compact JSON}
🔍 First 100 chars: ...
✅ Transmission complete
```

### 3. Test Endpoint
Created `/api/iot/uart/test` to check system readiness:
- Python3 availability
- pyserial library installation
- UART script existence
- Serial port availability

## Testing Steps

### Step 1: Check System Readiness

Open in browser:
```
http://localhost:3000/api/iot/uart/test
```

You should see:
```json
{
  "overall": "READY",
  "checks": [
    {"name": "Python3", "status": "OK"},
    {"name": "pyserial", "status": "OK"},
    {"name": "UART Script", "status": "OK"},
    {"name": "Serial Port", "status": "EXISTS"}
  ]
}
```

**If pyserial is missing:**
```bash
pip3 install pyserial
```

### Step 2: Test LED Strip Command

Say to Jarvis:
```
"Make the LED strip solid yellow"
```

Watch for these logs in sequence:

#### 1. Browser Console (F12)
```
📋 Parsed UART packet: {...}
✅ Packet validation passed
📦 Compact JSON to send: {"dst":"node_01",...}
📏 Size: 234 bytes
📤 Executing command 1/1: {uart packet}
✅ Command 1 result: {success: true}
✨ 1 command(s) executed successfully
```

**Visual UI**: Green notification appears saying "✓ 1 command executed"

#### 2. Terminal (Next.js server)
```
🔌 UART API endpoint called
📦 Request body: {deviceId, packet, config}
✅ Packet received: {compact packet}
⚙️ Final config: {serialPort: "/dev/ttyTHS1", ...}
✓ Python script exists at: ...
🐍 Spawning Python script with input: ...
⚡ Python process spawned, PID: 12345
📡 Python stderr: 📡 Connected to /dev/ttyTHS1 @ 115200
📡 Python stderr: 📤 Sending 235 bytes over UART
📡 Python stderr: 📦 Payload: {"dst":"node_01",...}
📡 Python stderr: ✅ Transmission complete
📤 Python stdout: {"success":true,...}
🏁 Python process exited with code 0
✅ UART command successful
```

#### 3. ESP32 Serial Monitor
```
Raw JSON received (len=234):
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on",...}}
Parsed -> state=on, mode=solid, color=(255,255,0), ...
```

## Common Issues & Solutions

### Issue 1: No logs in Terminal

**Symptom**: Browser shows command executed, but no terminal logs
**Cause**: API endpoint not being called
**Check**:
```bash
# In browser console:
fetch('/api/iot/uart/test').then(r => r.json()).then(console.log)
```

### Issue 2: "Failed to spawn Python process"

**Symptom**: Error in terminal logs
**Possible Causes**:
1. Python3 not in PATH
2. Script doesn't exist
3. No execute permissions

**Solution**:
```bash
# Check Python
which python3

# Check script exists
ls -la scripts/send_uart_command.py

# Make executable if needed
chmod +x scripts/send_uart_command.py
```

### Issue 3: "Error opening serial port"

**Symptom**: Python stderr shows serial error
**Possible Causes**:
1. Port doesn't exist (/dev/ttyTHS1)
2. No permissions
3. Port already open

**Solutions**:
```bash
# Check port exists
ls -l /dev/ttyTHS1

# Add user to dialout group
sudo usermod -a -G dialout $USER
# Then log out and back in

# Check if port is busy
lsof /dev/ttyTHS1
```

### Issue 4: JSON parse failed on ESP32

**Symptom**: ESP32 shows "JSON parse failed"
**Cause**: Malformed or truncated JSON
**Check**:
- Terminal logs show the exact payload sent
- Compare to what ESP32 received
- Check buffer size (512 bytes on Arduino)

**If buffer overflow**:
```cpp
// In Arduino code, increase buffer:
char msg[1024];  // was 512
StaticJsonDocument<1024> doc;  // was 512
```

### Issue 5: Red notification appears

**Symptom**: Red "⚠ Command failed" notification
**Action**: Check browser console for detailed error
- Look for the specific error message
- Check if it's validation, API, or transmission error

## Debugging Checklist

When a command fails, check logs in this order:

1. ✅ **Browser Console**: Did the packet parse and validate?
2. ✅ **Terminal**: Did the API receive the request?
3. ✅ **Terminal**: Did Python script spawn successfully?
4. ✅ **Terminal**: Did Python connect to serial port?
5. ✅ **Terminal**: Did Python send the data?
6. ✅ **ESP32 Monitor**: Did ESP32 receive the data?
7. ✅ **ESP32 Monitor**: Did JSON parse successfully?

The logs will tell you exactly where in the chain it fails.

## Manual Test Command

To test UART directly (bypass the frontend):

```bash
# Create test packet
cat > /tmp/test_packet.json << 'EOF'
{
  "deviceId": "led_strip_01",
  "packet": {
    "dst": "node_01",
    "src": "jetson",
    "device": "led",
    "payload": {
      "state": "on",
      "mode": "solid",
      "color": {"r": 255, "g": 255, "b": 0},
      "color2": {"r": 0, "g": 0, "b": 0},
      "brightness": 1.0,
      "transition_ms": 500,
      "duration_ms": 0,
      "effect": {"speed": 0.0, "direction": "cw"}
    }
  },
  "config": {
    "serialPort": "/dev/ttyTHS1",
    "baudRate": 115200
  }
}
EOF

# Send via API
curl -X POST http://localhost:3000/api/iot/uart \
  -H "Content-Type: application/json" \
  -d @/tmp/test_packet.json | jq
```

## Success Indicators

When everything is working, you should see:

1. ✅ Green notification in UI
2. ✅ All logs show success messages
3. ✅ Python exits with code 0
4. ✅ ESP32 receives and parses JSON
5. ✅ LED strip changes to the requested state

## Next Steps

If you see errors, share:
1. Full browser console log
2. Full terminal output
3. ESP32 serial monitor output
4. Output of `/api/iot/uart/test`

This will show exactly where the problem is!
