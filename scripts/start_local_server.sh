#!/bin/bash
# Start TinyTuya Local Control Server
# Properly handles background execution and logging

cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Kill any existing server
pkill -9 -f tuya_local_server 2>/dev/null

echo "Starting TinyTuya Local Control Server on port 5001..."

# Start server with all output redirected
nohup python3 tuya_local_server.py > tuya_server.log 2>&1 </dev/null &

SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

# Wait a moment for startup
sleep 2

# Test if server is responding
if curl -s http://127.0.0.1:5001/health > /dev/null 2>&1; then
    echo "✅ Server is running and responding!"
    echo "   Health check: http://127.0.0.1:5001/health"
    echo "   Devices: http://127.0.0.1:5001/devices"
    echo ""
    echo "View logs: tail -f tuya_server.log"
else
    echo "⚠️  Server started but not responding yet..."
    echo "   Check logs: tail -f tuya_server.log"
    echo "   PID: $SERVER_PID"
fi

