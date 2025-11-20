#!/usr/bin/env python3
"""
UART Command Sender
Sends JSON commands over UART serial communication
CRITICAL: Only sends clean, compact JSON with no extra text
"""

import serial
import json
import sys
import time

def main():
    try:
        # Parse input from command line
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "message": "No input provided"}))
            sys.exit(1)

        input_data = json.loads(sys.argv[1])
        device_id = input_data.get('deviceId')
        packet = input_data.get('packet')
        config = input_data.get('config', {})

        # Extract configuration
        serial_port = config.get('serialPort', '/dev/ttyTHS1')
        baud_rate = config.get('baudRate', 115200)

        # Setup Serial Connection
        try:
            ser = serial.Serial(serial_port, baud_rate, timeout=1)
            print(f"📡 Connected to {serial_port} @ {baud_rate}", file=sys.stderr)
            time.sleep(0.5)  # Allow serial to stabilize
        except serial.SerialException as e:
            error_msg = f"Error opening serial port: {e}"
            print(json.dumps({"success": False, "message": error_msg}))
            sys.exit(1)

        # CRITICAL: Convert packet to compact JSON (no spaces, no newlines in the JSON itself)
        # This uses separators=(',', ':') to ensure compact format
        json_payload = json.dumps(packet, separators=(',', ':'), ensure_ascii=False)

        # Verify it's valid JSON before sending
        json.loads(json_payload)  # Will throw if invalid

        # Send with newline delimiter (UART receivers expect \n terminator)
        bytes_to_send = (json_payload + '\n').encode('utf-8')

        print(f"📤 Sending {len(bytes_to_send)} bytes over UART", file=sys.stderr)
        print(f"📦 Payload: {json_payload}", file=sys.stderr)
        print(f"🔍 First 100 chars: {json_payload[:100]}...", file=sys.stderr)

        ser.write(bytes_to_send)
        ser.flush()  # Ensure all data is sent

        print(f"✅ Transmission complete", file=sys.stderr)

        # Close serial connection
        ser.close()

        # Return success
        print(json.dumps({
            "success": True,
            "message": "Command sent successfully",
            "deviceId": device_id,
            "bytesSent": len(bytes_to_send),
            "packet": packet
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
