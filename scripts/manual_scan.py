#!/usr/bin/env python3
"""
Extended network scan with longer timeout
"""

import tinytuya
import json

print("Scanning local network with extended timeout (60 seconds)...")
print("This will find devices even on congested networks.")
print()

# Extended scan - 60 second timeout
devices = tinytuya.deviceScan(False, 60)

print(f"\nFound {len(devices)} devices:")
print()

if devices:
    for device in devices:
        print(f"Device: {device.get('gwId', 'Unknown ID')}")
        print(f"  IP: {device.get('ip', 'Unknown')}")
        print(f"  Version: {device.get('version', 'Unknown')}")
        print(f"  Product ID: {device.get('productKey', 'Unknown')}")
        print()
    
    # Save for manual configuration
    with open('scan_results.json', 'w') as f:
        json.dump(devices, f, indent=2)
    
    print(f"Results saved to scan_results.json")
else:
    print("No devices found. Try:")
    print("  1. Check Smart Life app - are devices online?")
    print("  2. Power cycle the bulbs")
    print("  3. Make sure Mac is on same network as bulbs")
    print("  4. Temporarily disable macOS firewall")

