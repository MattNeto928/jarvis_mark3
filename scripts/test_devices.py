#!/usr/bin/env python3
"""
Test which device is at which IP
"""

import tinytuya
import json

# Load device config
with open('devices_local.json', 'r') as f:
    devices = json.load(f)

# IPs from router
ips = ['192.168.1.2', '192.168.1.3', '192.168.1.4']

print("=" * 60)
print("Testing Tuya Devices")
print("=" * 60)
print()

found_matches = []

for ip in ips:
    print(f"\nTesting IP: {ip}")
    
    for device in devices:
        try:
            test_device = tinytuya.BulbDevice(
                dev_id=device['id'],
                address=ip,
                local_key=device['local_key'],
                version=3.3
            )
            test_device.set_socketTimeout(2)
            
            # Try to get status
            status = test_device.status()
            
            if status and 'dps' in status:
                print(f"  ✅ Found {device['name']}!")
                print(f"     Status: {status}")
                found_matches.append({
                    'name': device['name'],
                    'id': device['id'],
                    'ip': ip,
                    'local_key': device['local_key']
                })
                break
        except Exception as e:
            pass

print()
print("=" * 60)
print(f"✅ Found {len(found_matches)} devices!")
print("=" * 60)
print()

if found_matches:
    for match in found_matches:
        print(f"  • {match['name']}: {match['ip']}")
    
    # Update config
    for device in devices:
        match = next((m for m in found_matches if m['id'] == device['id']), None)
        if match:
            device['ip'] = match['ip']
    
    with open('devices_local.json', 'w') as f:
        json.dump(devices, f, indent=2)
    
    print()
    print("✅ Configuration updated!")
    print()
    print("Next: Restart local server")
    print("  pkill -f tuya_local_server")
    print("  ./run_server.sh")
else:
    print("No matches found. Devices might be off or in standby.")

