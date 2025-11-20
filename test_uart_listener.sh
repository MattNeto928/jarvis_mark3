#!/bin/bash
# Test UART listener by running it directly

echo "Testing UART listener..."
echo "This will listen for incoming UART data on /dev/ttyTHS1"
echo "Press Ctrl+C to stop"
echo ""

python3 scripts/uart_listener.py /dev/ttyTHS1 115200
