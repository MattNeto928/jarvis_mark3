#!/usr/bin/env python3
"""
Fix device IP addresses
Quick script to update device IPs without re-running full setup
"""

import json

print("=" * 60)
print("Fix Device IP Addresses")
print("=" * 60)
print()
print("Current devices need LOCAL IP addresses (192.168.x.x)")
print("NOT public IPs like 128.61.105.41")
print()
print("Get LOCAL IPs from Smart Life app:")
print("  Device → Edit (pencil icon) → Device Information → IP Address")
print()
print("=" * 60)
print()

# Load current config
with open('devices_local.json', 'r') as f:
    devices = json.load(f)

print(f"Found {len(devices)} devices to update:")
print()

updated_devices = []

for device in devices:
    print(f"Device: {device['name']}")
    print(f"  Current IP: {device['ip']}")
    
    new_ip = input(f"  Enter LOCAL IP for {device['name']} (or press Enter to keep): ").strip()
    
    if new_ip:
        # Validate it's a local IP
        if new_ip.startswith('192.168.') or new_ip.startswith('10.') or new_ip.startswith('172.'):
            device['ip'] = new_ip
            print(f"  ✅ Updated to {new_ip}")
        else:
            print(f"  ⚠️  Warning: {new_ip} doesn't look like a local IP")
            confirm = input("  Use it anyway? (y/n): ").lower()
            if confirm == 'y':
                device['ip'] = new_ip
                print(f"  ✅ Updated to {new_ip}")
            else:
                print(f"  Keeping {device['ip']}")
    else:
        print(f"  Keeping {device['ip']}")
    
    updated_devices.append(device)
    print()

# Save updated config
with open('devices_local.json', 'w') as f:
    json.dump(updated_devices, f, indent=2)

print("=" * 60)
print("✅ Configuration updated!")
print("=" * 60)
print()
print("Updated devices:")
for dev in updated_devices:
    print(f"  • {dev['name']}: {dev['ip']}")
print()
print("Next step:")
print("  python3 tuya_local_server.py")
print()

