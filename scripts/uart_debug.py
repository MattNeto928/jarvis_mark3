#!/usr/bin/env python3
"""
UART Debug Tool - Monitor for collisions and packet corruption
Logs all received data with timing to detect overlapping transmissions
"""

import serial
import sys
import time
from datetime import datetime

def main():
    serial_port = sys.argv[1] if len(sys.argv) > 1 else '/dev/ttyTHS1'
    baud_rate = int(sys.argv[2]) if len(sys.argv) > 2 else 115200

    print(f"📡 UART Debug Monitor: {serial_port} @ {baud_rate}")
    print("=" * 80)

    try:
        ser = serial.Serial(
            port=serial_port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0.1
        )

        ser.reset_input_buffer()
        print("✅ Connected - monitoring for collisions...\n")

        last_packet_time = None
        packet_count = {'heartrate': 0, 'presence': 0, 'corrupted': 0, 'other': 0}

        while True:
            if ser.in_waiting > 0:
                receive_time = time.time()
                data = ser.read(ser.in_waiting)

                # Calculate time since last packet
                time_delta = 0
                if last_packet_time:
                    time_delta = (receive_time - last_packet_time) * 1000  # ms
                last_packet_time = receive_time

                # Try to decode
                try:
                    decoded = data.decode('utf-8').strip()

                    # Classify packet type
                    packet_type = "OTHER"
                    if 'avg_bpm' in decoded or 'ir_value' in decoded:
                        packet_type = "HEARTRATE"
                        packet_count['heartrate'] += 1
                    elif 'event' in decoded and ('EXIT' in decoded or 'ENTER' in decoded):
                        packet_type = "PRESENCE"
                        packet_count['presence'] += 1
                    else:
                        packet_count['other'] += 1

                    # Flag if packets arrived too close together (< 10ms = likely collision)
                    collision_flag = "⚠️ COLLISION?" if 0 < time_delta < 10 else ""

                    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    print(f"[{timestamp}] +{time_delta:6.1f}ms {packet_type:10} {collision_flag}")
                    print(f"  Data: {decoded[:100]}{'...' if len(decoded) > 100 else ''}")
                    print()

                except UnicodeDecodeError as e:
                    packet_count['corrupted'] += 1
                    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    print(f"[{timestamp}] +{time_delta:6.1f}ms {'🔴 CORRUPTED':10} ⚠️ DECODE ERROR")
                    print(f"  Hex: {data.hex()}")
                    print(f"  Error: {e}")
                    print()

            time.sleep(0.001)  # 1ms polling

    except KeyboardInterrupt:
        print("\n" + "=" * 80)
        print("📊 Packet Statistics:")
        print(f"  Heartrate: {packet_count['heartrate']}")
        print(f"  Presence:  {packet_count['presence']}")
        print(f"  Other:     {packet_count['other']}")
        print(f"  Corrupted: {packet_count['corrupted']} {'⚠️ BUS COLLISIONS DETECTED!' if packet_count['corrupted'] > 0 else ''}")

    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    main()
