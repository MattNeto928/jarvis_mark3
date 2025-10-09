#!/bin/bash
cd /Users/mattneto/SoftwareApplications/Jarvis3/scripts
source venv/bin/activate
echo "Starting TinyTuya Local Control Server on http://127.0.0.1:5000"
echo "Press Ctrl+C to stop"
echo ""
python3 tuya_local_server.py

