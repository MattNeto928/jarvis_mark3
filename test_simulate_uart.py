#!/usr/bin/env python3
"""
Simulate UART data transmission
This sends test packets to the serial port to verify the receive pipeline
"""
import serial
import json
import time
import sys

# Test packets matching your heart rate sensor format
test_packets = [
    {"device": "hr", "source": "ledhr", "payload": {"avg_bpm": 64, "inst_bpm": 78.63696, "finger": True, "timestamp_ms": 266711}},
    {"device": "hr", "source": "ledhr", "payload": {"avg_bpm": 65, "inst_bpm": 80.12345, "finger": True, "timestamp_ms": 267715}},
    {"device": "test", "source": "uart_test", "payload": {"message": "UART stack test", "iteration": 1}},
]

print("UART Data Simulator")
print("=" * 50)
print("")

try:
    # Open serial port for WRITING
    ser = serial.Serial(
        port='/dev/ttyTHS1',
        baudrate=115200,
        timeout=1
    )

    print(f"✅ Connected to /dev/ttyTHS1 @ 115200 baud")
    print(f"📤 Sending {len(test_packets)} test packets...")
    print("")

    for i, packet in enumerate(test_packets):
        # Convert to JSON and send
        json_str = json.dumps(packet, separators=(',', ':'))
        ser.write((json_str + '\n').encode('utf-8'))
        ser.flush()

        print(f"  [{i+1}] Sent: {json_str[:60]}...")
        time.sleep(0.5)  # Wait between packets

    print("")
    print("✅ All test packets sent!")
    print("")
    print("Next steps:")
    print("  1. Check your browser console")
    print("  2. Look for '📨 UART RX:' messages")
    print("  3. Verify packets appear in real-time")

    ser.close()

except serial.SerialException as e:
    print(f"❌ Error: {e}")
    print("")
    print("Note: If you get 'device busy' error:")
    print("  The UART listener might already have the port open")
    print("  This is GOOD - it means the listener is running!")
    print("  The listener will receive data from your ESP32")
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    sys.exit(1)
