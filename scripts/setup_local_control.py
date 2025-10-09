#!/usr/bin/env python3
"""
Setup script for TinyTuya local control
Gets local keys and IPs for your Tuya devices
"""

import tinytuya
import json
import os

print("=" * 60)
print("TinyTuya Local Control Setup")
print("=" * 60)
print()
print("This will scan your network for Tuya devices and get their")
print("local keys so you can control them WITHOUT the cloud API!")
print()
print("You'll need:")
print("  1. Your Tuya API credentials (already have them!)")
print("  2. Devices on your local network")
print()

# Get credentials
client_id = input("Enter Tuya Client ID [ywc889vmm783u84dukkv]: ").strip() or "ywc889vmm783u84dukkv"
client_secret = input("Enter Tuya Client Secret [8e52673176774438928f22703c9c74c0]: ").strip() or "8e52673176774438928f22703c9c74c0"
region = input("Enter region [us]: ").strip() or "us"

print("\nStep 1: Getting device information from Tuya Cloud...")
print("(This uses cloud API to get local keys, then you're free!)")

# Create cloud object
cloud = tinytuya.Cloud(
    apiRegion=region,
    apiKey=client_id,
    apiSecret=client_secret
)

# Get devices
devices = cloud.getdevices()

if not devices:
    print("\n❌ No devices found. Make sure:")
    print("  1. Devices are linked in Smart Life app")
    print("  2. Smart Life app is linked to Tuya IoT project")
    exit(1)

print(f"\n✅ Found {len(devices)} devices from cloud")

print("\nStep 2: Scanning local network for device IPs...")
print("(This may take 30-60 seconds...)")

# Scan network
devices_local = tinytuya.deviceScan(False, 20)

print(f"\n✅ Found {len(devices_local)} devices on local network")

# Match devices
matched_devices = []

for device in devices:
    device_id = device['id']
    device_name = device['name']
    local_key = device['key']
    
    # Find IP from local scan
    ip_address = None
    for local_dev in devices_local:
        if local_dev['gwId'] == device_id:
            ip_address = local_dev['ip']
            break
    
    if ip_address:
        matched_devices.append({
            'id': device_id,
            'name': device_name,
            'local_key': local_key,
            'ip': ip_address,
            'type': 'light',
            'version': 3.3
        })
        print(f"  ✅ {device_name}: {ip_address}")
    else:
        print(f"  ⚠️  {device_name}: No IP found (device might be offline)")

if not matched_devices:
    print("\n❌ No devices found on local network.")
    print("Make sure devices are:")
    print("  1. Powered on")
    print("  2. Connected to same WiFi network")
    print("  3. On 2.4GHz WiFi (not 5GHz)")
    exit(1)

# Save configuration
config_path = os.path.join(os.path.dirname(__file__), 'devices_local.json')
with open(config_path, 'w') as f:
    json.dump(matched_devices, f, indent=2)

print(f"\n✅ Configuration saved to: {config_path}")
print(f"\n{'='*60}")
print("Setup Complete! 🎉")
print("="*60)
print()
print("Your devices are now configured for LOCAL control!")
print()
print("Next steps:")
print("  1. Start the local server:")
print("     cd scripts && python3 tuya_local_server.py")
print()
print("  2. Update your smart mirror to use local control")
print()
print("Benefits of local control:")
print("  ✅ FREE forever (no API costs)")
print("  ✅ Faster response (<100ms)")
print("  ✅ Works without internet")
print("  ✅ More private")
print("  ✅ More reliable")
print()
print(f"Found devices:")
for dev in matched_devices:
    print(f"  • {dev['name']} ({dev['ip']})")
print()

