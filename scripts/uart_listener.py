#!/usr/bin/env python3
"""
UART Listener Service
Continuously listens for incoming UART data and outputs to stdout
Outputs raw chunks immediately - JSON reassembly happens on the Node.js side
"""

import serial
import json
import sys
import time
from datetime import datetime

# Presence state: 'on', 'sleep', 'off'
presence_state = 'on'

def send_led_command(brightness):
    """Send LED brightness command over UART via send_uart_command.py"""
    import subprocess
    cmd = {"device": "ledhr", "source": "mirror", "payload": {"brightness": brightness}}
    packet_json = json.dumps({"deviceId": "led_strip_01", "packet": cmd})
    
    try:
        subprocess.Popen(
            ['python3', '/home/matt/smart-mirror/jarvis_mark3/scripts/send_uart_command.py', packet_json],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        print(f"💡 LED brightness set to {brightness}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"❌ Failed to send LED command: {e}", file=sys.stderr, flush=True)

def handle_presence_event(event):
    """Handle presence detection events"""
    global presence_state
    
    if event == "EXIT" and presence_state == "on":
        presence_state = "sleep"
        send_led_command(10)
        # Emit screen dim event
        output = {"timestamp": datetime.now().isoformat(), "data": json.dumps({"event": "screen_dim"}), "type": "uart_chunk"}
        print(json.dumps(output), flush=True)
        print(f"😴 Entering sleep mode", file=sys.stderr, flush=True)
    
    elif event == "ENTER" and presence_state == "sleep":
        presence_state = "on"
        send_led_command(100)
        # Emit screen brighten event
        output = {"timestamp": datetime.now().isoformat(), "data": json.dumps({"event": "screen_brighten"}), "type": "uart_chunk"}
        print(json.dumps(output), flush=True)
        print(f"👁️ Entering active mode", file=sys.stderr, flush=True)

def main():
    # Get config from command line if provided
    serial_port = sys.argv[1] if len(sys.argv) > 1 else '/dev/ttyTHS1'
    baud_rate = int(sys.argv[2]) if len(sys.argv) > 2 else 115200

    print(f"📡 UART Listener starting: {serial_port} @ {baud_rate}", file=sys.stderr, flush=True)

    try:
        # Initialize serial connection - matching receive.py settings
        ser = serial.Serial(
            port=serial_port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0.1  # Non-blocking read with short timeout
        )

        # Clear any initial garbage data
        ser.reset_input_buffer()

        print("✅ UART Listener connected - waiting for data...", file=sys.stderr, flush=True)

        # Line buffer to accumulate data until we get a complete line
        line_buffer = b''

        while True:
            try:
                # Read available bytes (non-blocking due to timeout)
                if ser.in_waiting > 0:
                    chunk = ser.read(ser.in_waiting)
                    line_buffer += chunk

                    # Process all complete lines in the buffer
                    while b'\n' in line_buffer:
                        # Extract one complete line
                        line, line_buffer = line_buffer.split(b'\n', 1)

                        if not line:
                            continue

                        try:
                            # Decode as UTF-8 text
                            decoded_data = line.decode('utf-8').strip()

                            if decoded_data:
                                # Output as JSON for the SSE endpoint to consume
                                output = {
                                    "timestamp": datetime.now().isoformat(),
                                    "data": decoded_data,
                                    "type": "uart_chunk"
                                }
                                print(json.dumps(output), flush=True)

                                # Log to stderr for debugging
                                print(f"📨 RX: {decoded_data[:80]}{'...' if len(decoded_data) > 80 else ''}", file=sys.stderr, flush=True)

                                # Check for presence detection packets (after outputting)
                                try:
                                    parsed = json.loads(decoded_data)
                                    if parsed.get("node_type") == "HP" and "event" in parsed:
                                        handle_presence_event(parsed["event"])
                                except Exception:
                                    # Silently ignore parsing errors
                                    pass

                        except UnicodeDecodeError:
                            # If decoding fails, send raw hex
                            output = {
                                "timestamp": datetime.now().isoformat(),
                                "data": line.hex(),
                                "type": "uart_raw_hex"
                            }
                            print(json.dumps(output), flush=True)
                            print(f"📨 RX (hex): {line.hex()}", file=sys.stderr, flush=True)

                    # Prevent buffer overflow - clear if too large without finding newline
                    if len(line_buffer) > 10000:
                        print(f"⚠️ Line buffer overflow, clearing {len(line_buffer)} bytes", file=sys.stderr, flush=True)
                        line_buffer = b''

                # Small sleep to prevent 100% CPU usage
                time.sleep(0.001)

            except Exception as e:
                # Log unexpected errors but keep running
                print(f"⚠️ Error in main loop: {e}", file=sys.stderr, flush=True)
                time.sleep(0.01)

    except serial.SerialException as e:
        print(f"❌ Error opening serial port: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    except KeyboardInterrupt:
        print("\n⚠️ UART Listener stopped by signal", file=sys.stderr, flush=True)

    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()
            print("🛑 Serial port closed", file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()
