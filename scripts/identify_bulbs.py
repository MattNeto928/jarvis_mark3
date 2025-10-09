#!/usr/bin/env python3
"""
Interactive script to identify which physical bulb is which
"""

import tinytuya
import json
import time

with open('devices_local.json') as f:
    devices = json.load(f)

print("=" * 60)
print("BULB IDENTIFICATION TEST")
print("=" * 60)
print()
print("This will flash each bulb to help you identify them.")
print("Watch your bulbs carefully!")
print()

for i, device_info in enumerate(devices, 1):
    print(f"\n{'='*60}")
    print(f"TEST {i}/3: {device_info['name']}")
    print(f"ID: {device_info['id']}")
    print(f"IP: {device_info['ip']}")
    print(f"{'='*60}\n")
    
    input(f"Press Enter to flash {device_info['name']}...")
    
    d = tinytuya.BulbDevice(
        device_info['id'],
        device_info['ip'],
        device_info['local_key']
    )
    d.set_version(3.5)
    d.set_socketTimeout(2)
    
    print("\n🔦 FLASHING NOW - Watch which bulb blinks!")
    print("Flashing 5 times...\n")
    
    for flash in range(5):
        print(f"  Flash {flash + 1}/5...")
        
        # Off
        d.set_value(20, False)
        time.sleep(0.3)
        
        # On
        d.set_value(20, True)
        time.sleep(0.3)
    
    print("\n✅ Flashing complete!")
    
    location = input(f"\nWhich physical bulb flashed? (e.g., 'kitchen', 'bedroom door', 'left side'): ")
    
    print(f"\n📝 You identified:")
    print(f"   Config name: {device_info['name']}")
    print(f"   Actual location: {location}")
    print(f"   Device ID: {device_info['id']}")

print("\n" + "="*60)
print("IDENTIFICATION COMPLETE!")
print("="*60)
print("\nNow you know which device is which!")
print("You can rename them in public/DEVICES.json if needed.")

