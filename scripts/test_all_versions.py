#!/usr/bin/env python3
"""
Test devices with all protocol versions
"""

import tinytuya
import json

# Load device config
with open('devices_local.json', 'r') as f:
    devices = json.load(f)

# IPs from router
ips = ['192.168.1.2', '192.168.1.3', '192.168.1.4']

# Try different versions
versions = [3.1, 3.3, 3.4]

print("=" * 60)
print("Testing All Protocol Versions")
print("=" * 60)
print()

found_matches = []

for ip in ips:
    print(f"\nTesting IP: {ip}")
    
    for device in devices:
        for version in versions:
            try:
                print(f"  Trying {device['name']} with v{version}...", end=' ')
                
                test_device = tinytuya.BulbDevice(
                    dev_id=device['id'],
                    address=ip,
                    local_key=device['local_key'],
                    version=version
                )
                test_device.set_socketTimeout(1)
                
                # Try to get status
                status = test_device.status()
                
                if status and 'dps' in status:
                    print(f"✅ FOUND!")
                    print(f"     Version: {version}")
                    print(f"     Status: {status}")
                    found_matches.append({
                        'name': device['name'],
                        'id': device['id'],
                        'ip': ip,
                        'local_key': device['local_key'],
                        'version': version
                    })
                    break
                else:
                    print("No")
            except Exception as e:
                print(f"No ({str(e)[:30]}...)")
        
        if any(m['id'] == device['id'] for m in found_matches):
            break

print()
print("=" * 60)
print(f"Results: Found {len(found_matches)} devices")
print("=" * 60)
print()

if found_matches:
    for match in found_matches:
        print(f"  ✅ {match['name']}: {match['ip']} (v{match['version']})")
    
    # Update config
    for device in devices:
        match = next((m for m in found_matches if m['id'] == device['id']), None)
        if match:
            device['ip'] = match['ip']
            device['version'] = match['version']
    
    with open('devices_local.json', 'w') as f:
        json.dump(devices, f, indent=2)
    
    print()
    print("✅ Configuration updated in devices_local.json!")
    print()
    print("Next: Test a command")
    print("  python3 test_command.py")
else:
    print("\n⚠️  No devices responding.")
    print("\nTry:")
    print("  1. Turn bulbs off and on in Smart Life app")
    print("  2. Power cycle the bulbs physically")
    print("  3. Check they're actually online in Smart Life")

