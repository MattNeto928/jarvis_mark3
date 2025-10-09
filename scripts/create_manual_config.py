#!/usr/bin/env python3
"""
Manual device configuration helper
If network scan doesn't work, you can manually enter device IPs
"""

import tinytuya
import json

print("=" * 60)
print("Manual Device Configuration")
print("=" * 60)
print()
print("Since network scan isn't working, let's configure devices manually.")
print()
print("You'll need to get device IPs from Smart Life app:")
print("  1. Open Smart Life app")
print("  2. Tap on a device")
print("  3. Tap the pencil icon (edit)")
print("  4. Tap 'Device Information'")
print("  5. Look for 'IP Address'")
print()

# Get credentials
client_id = input("Tuya Client ID [ywc889vmm783u84dukkv]: ").strip() or "ywc889vmm783u84dukkv"
client_secret = input("Tuya Client Secret [8e52673176774438928f22703c9c74c0]: ").strip() or "8e52673176774438928f22703c9c74c0"
region = input("Region [us]: ").strip() or "us"

print("\nGetting device information from cloud...")

# Get device info from cloud
cloud = tinytuya.Cloud(
    apiRegion=region,
    apiKey=client_id,
    apiSecret=client_secret
)

devices = cloud.getdevices()
print(f"Found {len(devices)} devices in cloud")
print()

# Show devices and let user enter IPs
configured_devices = []

for i, device in enumerate(devices, 1):
    print(f"\n--- Device {i}/{len(devices)} ---")
    print(f"Name: {device['name']}")
    print(f"ID: {device['id']}")
    print(f"Key: {device['key']}")
    print()
    
    ip = input(f"Enter IP for {device['name']} (or press Enter to skip): ").strip()
    
    if ip:
        configured_devices.append({
            'id': device['id'],
            'name': device['name'],
            'local_key': device['key'],
            'ip': ip,
            'type': 'light',
            'version': 3.3
        })
        print(f"✅ Added {device['name']}")

if configured_devices:
    # Save configuration
    with open('devices_local.json', 'w') as f:
        json.dump(configured_devices, f, indent=2)
    
    print()
    print("=" * 60)
    print(f"✅ Configuration saved!")
    print("=" * 60)
    print()
    print(f"Configured {len(configured_devices)} devices:")
    for dev in configured_devices:
        print(f"  • {dev['name']} ({dev['ip']})")
    print()
    print("Next steps:")
    print("  1. Start local server: python3 tuya_local_server.py")
    print("  2. Test: curl http://127.0.0.1:5000/devices")
    print()
else:
    print("\nNo devices configured. Exiting.")

