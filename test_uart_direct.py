#!/usr/bin/env python3
"""
Direct test: Run listener and simultaneously send test data
"""
import serial
import time
import sys

print("Starting direct UART test...")
print("This will read from UART for 10 seconds")
print("Make sure your ESP32 is connected and sending data")
print("")

try:
    ser = serial.Serial(
        port='/dev/ttyTHS1',
        baudrate=115200,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=0.1
    )

    ser.reset_input_buffer()
    print("✅ Serial port opened successfully")
    print("Listening for 10 seconds...\n")

    start_time = time.time()
    data_received = False

    while time.time() - start_time < 10:
        if ser.in_waiting > 0:
            data = ser.read(ser.in_waiting)
            try:
                decoded = data.decode('utf-8', errors='ignore')
                if decoded.strip():
                    print(f"📨 RX: {decoded}")
                    data_received = True
            except:
                print(f"📨 RX (hex): {data.hex()}")
                data_received = True
        time.sleep(0.01)

    if not data_received:
        print("\n⚠️  No data received in 10 seconds")
        print("Troubleshooting:")
        print("  1. Is your ESP32 powered on and sending data?")
        print("  2. Are TX/RX pins connected correctly?")
        print("  3. Try running: python /home/matt/uart_test/receive.py")
    else:
        print("\n✅ Data received successfully!")

    ser.close()

except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
