#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
echo "Starting TinyTuya Local Control Server..."
python3 tuya_local_server.py
