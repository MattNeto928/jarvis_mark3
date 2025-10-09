#!/usr/bin/env python3
"""
Scan local network for Tuya devices
Tests IPs to see which ones respond to Tuya protocol
"""

import tinytuya
import json
import socket

print("=" * 60)
print("Tuya Device Finder")
print("=" * 60)
print()

# Load device IDs and keys from cloud
with open('devices_local.json', 'r') as f:
    devices = json.load(f)

print(f"Testing for {len(devices)} known devices...")
print("Scanning local network 192.168.1.x...")
print()

found_devices = []

# Scan common IP range
for i in range(1, 255):
    ip = f"192.168.1.{i}"
    
    # Quick port check first (Tuya devices usually on port 6668)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.1)
    result = sock.connect_ex((ip, 6668))
    sock.close()
    
    if result == 0:
        print(f"Found device at {ip}, testing...")
        
        # Test each known device
        for device in devices:
            try:
                test_device = tinytuya.BulbDevice(
                    dev_id=device['id'],
                    address=ip,
                    local_key=device['local_key'],
                    version=3.3
                )
                test_device.set_socketTimeout(1)
                
                # Try to get status
                status = test_device.status()
                
                if status and 'dps' in status:
                    print(f"  ✅ {device['name']} found at {ip}!")
                    device['ip'] = ip
                    found_devices.append(device)
                    break
            except Exception as e:
                pass

if found_devices:
    print()
    print("=" * 60)
    print(f"✅ Found {len(found_devices)} devices!")
    print("=" * 60)
    print()
    
    for dev in found_devices:
        print(f"  • {dev['name']}: {dev['ip']}")
    
    # Update all devices with found IPs
    for device in devices:
        match = next((d for d in found_devices if d['id'] == device['id']), None)
        if match:
            device['ip'] = match['ip']
    
    # Save updated config
    with open('devices_local.json', 'w') as f:
        json.dump(devices, f, indent=2)
    
    print()
    print("Configuration updated!")
    print()
    print("Next step: Restart local server")
    print("  pkill -f tuya_local_server && ./run_server.sh")
    
else:
    print()
    print("No devices found. Try:")
    print("  1. Make sure bulbs are powered on")
    print("  2. Check they're on 2.4GHz WiFi")
    print("  3. Power cycle the bulbs")

