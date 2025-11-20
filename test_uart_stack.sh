#!/bin/bash
# Comprehensive UART Stack Test
# Tests each layer of the UART receive pipeline

echo "========================================"
echo "UART Stack Test Suite"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if UART device exists
echo "TEST 1: UART Device Availability"
echo "----------------------------------------"
if [ -e /dev/ttyTHS1 ]; then
    echo -e "${GREEN}✓${NC} /dev/ttyTHS1 exists"
    ls -l /dev/ttyTHS1
else
    echo -e "${RED}✗${NC} /dev/ttyTHS1 not found"
    exit 1
fi
echo ""

# Test 2: Check permissions
echo "TEST 2: UART Permissions"
echo "----------------------------------------"
if [ -r /dev/ttyTHS1 ] && [ -w /dev/ttyTHS1 ]; then
    echo -e "${GREEN}✓${NC} Read/Write permissions OK"
else
    echo -e "${YELLOW}⚠${NC} Permission issue - try: sudo chmod 666 /dev/ttyTHS1"
fi
groups | grep -q dialout && echo -e "${GREEN}✓${NC} User in dialout group" || echo -e "${YELLOW}⚠${NC} User not in dialout group"
echo ""

# Test 3: Test Python UART listener directly (5 seconds)
echo "TEST 3: Python UART Listener (5 seconds)"
echo "----------------------------------------"
echo "Testing: python3 scripts/uart_listener.py"
echo "If your ESP32 is sending data, you should see it below..."
echo ""
timeout 5 python3 scripts/uart_listener.py /dev/ttyTHS1 115200 2>&1 || true
echo ""
echo -e "${YELLOW}ℹ${NC} If you saw JSON output above, the listener works!"
echo ""

# Test 4: Check if SSE endpoint is accessible
echo "TEST 4: SSE Endpoint Accessibility"
echo "----------------------------------------"
if curl -s --max-time 2 http://localhost:3001/api/iot/uart/stream > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SSE endpoint is accessible at http://localhost:3001/api/iot/uart/stream"
else
    echo -e "${RED}✗${NC} Cannot connect to SSE endpoint"
    echo "  Make sure Next.js dev server is running on port 3001"
fi
echo ""

# Test 5: Test SSE stream (10 seconds)
echo "TEST 5: SSE Stream Test (10 seconds)"
echo "----------------------------------------"
echo "Connecting to SSE stream..."
echo "Any UART data received will appear below:"
echo ""
timeout 10 curl -N http://localhost:3001/api/iot/uart/stream 2>/dev/null || true
echo ""
echo ""

# Test 6: Check server logs
echo "TEST 6: Server Logs Check"
echo "----------------------------------------"
echo "Recent server activity:"
echo "(Check for UART listener startup messages)"
echo ""

echo "========================================"
echo "Test Complete"
echo "========================================"
echo ""
echo "Next Steps:"
echo "1. If TEST 3 showed UART data → Python listener works"
echo "2. If TEST 5 showed UART data → Full stack works"
echo "3. If no data in TEST 5 → Check browser console"
echo "4. Open browser DevTools → Console tab"
echo "5. Look for '📡 Starting UART stream listener...'"
echo ""
