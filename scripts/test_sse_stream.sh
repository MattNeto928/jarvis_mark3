#!/bin/bash
# Test SSE stream to verify complete packets are being received

echo "🧪 Testing SSE UART Stream for 15 seconds..."
echo "Trigger both heartbeat and presence sensors now!"
echo "=========================================="
echo ""

timeout 15 curl -N http://localhost:3000/api/iot/uart/stream 2>/dev/null | while IFS= read -r line; do
    if [[ $line == data:* ]]; then
        # Extract JSON after "data: "
        json="${line#data: }"

        # Parse packet type
        if echo "$json" | jq -e '.data | fromjson | has("ir_value")' >/dev/null 2>&1; then
            echo "✅ HEARTRATE packet received (complete)"
        elif echo "$json" | jq -e '.data | fromjson | has("event")' >/dev/null 2>&1; then
            event=$(echo "$json" | jq -r '.data | fromjson | .event')
            echo "✅ PRESENCE packet received: $event (complete)"
        elif echo "$json" | jq -e '.type == "connected"' >/dev/null 2>&1; then
            echo "🔗 Connected to SSE stream"
        else
            # Show first 100 chars of packet
            echo "📦 Other packet: $(echo "$json" | jq -r '.data' | cut -c1-80)..."
        fi
    fi
done

echo ""
echo "✅ Test complete!"
