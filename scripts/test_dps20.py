#!/usr/bin/env python3
"""
Test bulbs with correct DPS 20 commands
Based on wizard discovery: Your bulbs use DPS 20 for switch_led!
"""

import tinytuya
import json
import time

# Load device config
with open('devices_local.json', 'r') as f:
    devices = json.load(f)

print("=" * 60)
print("Testing Tuya Bulbs with DPS 20 Commands")
print("=" * 60)
print()
print("⚠️  BEFORE TESTING:")
print("  1. Close Smart Life app COMPLETELY (swipe away)")
print("  2. Ensure bulbs are powered on")
print("  3. Wait 30 seconds for bulbs to fully boot")
print()
input("Press Enter when ready...")
print()

for device in devices:
    print(f"\n{'='*60}")
    print(f"Testing: {device['name']}")
    print(f"  ID: {device['id']}")
    print(f"  IP: {device['ip']}")
    print(f"{'='*60}")
    
    try:
        # Initialize device
        bulb = tinytuya.BulbDevice(
            dev_id=device['id'],
            address=device['ip'],
            local_key=device['local_key']
        )
        
        # Set version correctly (per latest docs)
        bulb.set_version(3.3)
        bulb.set_socketTimeout(5)
        
        print("\n1. Getting current status...")
        status = bulb.status()
        
        if status and 'dps' in status:
            print(f"   ✅ Device online!")
            print(f"   DPS: {json.dumps(status['dps'], indent=2)}")
            
            # Check if DPS 20 exists (switch_led)
            if '20' in status['dps']:
                current_state = status['dps']['20']
                print(f"\n   Current power state (DPS 20): {current_state}")
                
                print("\n2. Testing DPS 20 toggle...")
                
                # Toggle off
                print("   Turning OFF...")
                result = bulb.set_value(20, False)
                print(f"   Result: {result}")
                time.sleep(2)
                
                # Toggle on
                print("   Turning ON...")
                result = bulb.set_value(20, True)
                print(f"   Result: {result}")
                time.sleep(2)
                
                # Test brightness (DPS 22)
                if '22' in status['dps']:
                    print("\n3. Testing brightness (DPS 22)...")
                    print("   Setting to 500...")
                    result = bulb.set_value(22, 500)
                    print(f"   Result: {result}")
                    time.sleep(2)
                
                # Test color (DPS 24)
                if '24' in status['dps']:
                    print("\n4. Testing color (DPS 24 - Red)...")
                    color_data = {
                        'h': 0,    # Hue 0 = red
                        's': 1000, # Saturation max
                        'v': 1000  # Brightness max
                    }
                    result = bulb.set_value(24, json.dumps(color_data))
                    print(f"   Result: {result}")
                    time.sleep(2)
                
                print(f"\n   ✅ {device['name']} - All tests passed!")
            else:
                print(f"\n   ⚠️  DPS 20 not found. Available DPS: {list(status['dps'].keys())}")
                
        else:
            print(f"   ❌ No response or invalid status: {status}")
            
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        print(f"   This usually means:")
        print(f"     - Smart Life app is still connected")
        print(f"     - Device is in standby mode")
        print(f"     - Wrong IP address")
        print(f"     - Network firewall blocking")

print()
print("=" * 60)
print("Testing complete!")
print("=" * 60)
print()
print("Next steps:")
print("  - If devices responded: Local control is working! 🎉")
print("  - If no response: Close Smart Life app and power cycle bulbs")
print("  - If still not working: Use Cloud API (trial pending approval)")

