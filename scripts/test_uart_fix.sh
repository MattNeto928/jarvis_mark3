#!/bin/bash
# Quick test to verify UART fix
echo "🧪 Testing UART fix for 15 seconds..."
echo "Place finger on heart sensor and trigger presence detector"
echo "=========================================================="

# Kill existing listener
pkill -f uart_listener.py 2>/dev/null
sleep 1

# Run debug script for 15 seconds
timeout 15 python3 /home/matt/smart-mirror/jarvis_mark3/scripts/uart_debug.py /dev/ttyTHS1 115200

echo ""
echo "✅ Test complete! Check if you saw:"
echo "   - Complete HEARTRATE packets (not fragmented)"
echo "   - Complete PRESENCE packets (not fragmented)"
echo "   - Both types working simultaneously"
