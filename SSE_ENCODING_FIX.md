# SSE Stream Encoding Fix

## Problem
UART packets were being received by the Python listener and logged in the terminal, but the web app was not receiving them.

## Root Cause
The SSE (Server-Sent Events) stream in `/app/api/iot/uart/stream/route.ts` was enqueuing **strings** directly to the ReadableStream controller:

```typescript
controller.enqueue(message)  // ❌ WRONG - message is a string
```

However, Next.js ReadableStream expects **Uint8Array** (bytes), not strings. The browser's EventSource API requires the response body to be a proper byte stream.

## Data Flow
1. ✅ Python `uart_listener.py` receives UART data from `/dev/ttyTHS1`
2. ✅ Python script outputs JSON to stdout
3. ✅ Node.js API route reads stdout and parses JSON
4. ✅ `broadcastToClients()` is called with packet data
5. ❌ **BUG HERE:** String enqueued instead of Uint8Array
6. ❌ Browser EventSource never receives properly formatted SSE messages
7. ❌ Web app console shows no UART packets

## Solution
Encode all SSE messages as Uint8Array before enqueuing:

```typescript
function broadcastToClients(packet: unknown) {
  const message = `data: ${JSON.stringify(packet)}\n\n`
  const encoder = new TextEncoder()
  const encoded = encoder.encode(message)  // ✅ Convert to Uint8Array
  
  for (const controller of streamClients) {
    try {
      controller.enqueue(encoded)  // ✅ Send bytes
    } catch (e) {
      streamClients.delete(controller)
    }
  }
}
```

## Fixed Locations
1. `broadcastToClients()` function - main packet broadcast
2. Welcome message in `start()` callback
3. Keep-alive ping messages
4. Error notification on listener process exit

## Testing
After this fix:
- Browser console should show: `📨 UART RX: {device: "hr", ...}`
- HeartRate widget should update in real-time
- EventSource connection should remain stable
