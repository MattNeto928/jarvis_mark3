#!/usr/bin/env python3
"""
TinyTuya Local Control Server
Provides a REST API for controlling Tuya devices locally via LAN
No cloud API calls = FREE forever!
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import tinytuya
import json
import os

app = Flask(__name__)
CORS(app)

# Load device configuration
DEVICES = {}

def load_devices():
    """Load devices from configuration file"""
    global DEVICES
    config_path = os.path.join(os.path.dirname(__file__), 'devices_local.json')
    
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            device_list = json.load(f)
            
        # Just store device info, don't create connections yet
        # Connections will be created on-demand to avoid startup hangs
        for device in device_list:
            DEVICES[device['id']] = {
                'info': device,
                'connection': None  # Will be created when first used
            }
            
        print(f"Loaded {len(DEVICES)} devices")
    else:
        print(f"No devices config found at {config_path}")

def get_device_connection(device_id):
    """Get or create device connection"""
    if device_id not in DEVICES:
        return None
    
    # Create connection if it doesn't exist
    if DEVICES[device_id]['connection'] is None:
        device_info = DEVICES[device_id]['info']
        
        # Don't use 'device22' parameter - devices are Type = default
        bulb = tinytuya.BulbDevice(
            dev_id=device_info['id'],
            address=device_info['ip'],
            local_key=device_info['local_key']
        )
        
        # Use protocol 3.5 (discovered via scan)
        bulb.set_version(device_info.get('version', 3.5))
        bulb.set_socketTimeout(3)  # Shorter timeout
        
        DEVICES[device_id]['connection'] = bulb
    
    return DEVICES[device_id]['connection']

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'devices_loaded': len(DEVICES)
    })

@app.route('/devices', methods=['GET'])
def list_devices():
    """List all configured devices"""
    device_list = [
        {
            'id': dev_id,
            'name': dev['info']['name'],
            'type': dev['info']['type'],
            'ip': dev['info']['ip']
        }
        for dev_id, dev in DEVICES.items()
    ]
    
    return jsonify({
        'success': True,
        'devices': device_list
    })

@app.route('/device/<device_id>/status', methods=['GET'])
def get_status(device_id):
    """Get device status"""
    if device_id not in DEVICES:
        return jsonify({'success': False, 'message': 'Device not found'}), 404
    
    try:
        device = get_device_connection(device_id)
        if not device:
            return jsonify({'success': False, 'message': 'Failed to connect to device'}), 500
            
        status = device.status()
        
        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/device/<device_id>/control', methods=['POST'])
def control_device(device_id):
    """Control a device"""
    if device_id not in DEVICES:
        return jsonify({'success': False, 'message': 'Device not found'}), 404
    
    try:
        data = request.json
        commands = data.get('commands', [])
        
        device = get_device_connection(device_id)
        if not device:
            return jsonify({'success': False, 'message': 'Failed to connect to device'}), 500
            
        results = []
        
        for cmd in commands:
            code = cmd['code']
            value = cmd['value']
            
            # Map command codes to TinyTuya bulb methods
            # CRITICAL: Always disable do_not_disturb (DPS 34) to ensure physical response
            if code == 'switch_led':
                # Turn on/off using explicit DPS commands
                print(f"Turning {'ON' if value else 'OFF'} for device")
                result = device.set_multiple_values({
                    20: value,  # Power on/off
                    34: False   # Disable do_not_disturb
                })
                results.append({'code': code, 'result': result})
                print(f"Result: {result}")
                
            elif code == 'bright_value' or code == 'bright_value_v2':
                # Set brightness (value is 10-1000)
                print(f"Setting brightness to {value}")
                result = device.set_multiple_values({
                    20: True,      # Ensure light is on
                    22: int(value), # Set brightness
                    34: False      # Disable do_not_disturb
                })
                results.append({'code': code, 'result': result})
                print(f"Result: {result}")
                
            elif code == 'colour_data' or code == 'colour_data_v2':
                # Set color using HSV
                # Value should be a dict with h, s, v
                print(f"Setting color to {value}")
                h = value.get('h', 0)
                s = value.get('s', 1000)
                v = value.get('v', 1000)
                
                # Format color data for DPS 24 (hhhhssssvvvv in hex)
                color_hex = f"{h:04x}{s:04x}{v:04x}"
                
                result = device.set_multiple_values({
                    20: True,          # Ensure light is on
                    21: 'colour',      # Set to color mode
                    24: color_hex,     # Set color data
                    34: False          # Disable do_not_disturb
                })
                results.append({'code': code, 'result': result})
                print(f"Result: {result}")
                
            elif code == 'temp_value' or code == 'temp_value_v2':
                # Set color temperature
                result = device.set_colourtemp(value)
                results.append({'code': code, 'result': result})
                
            else:
                # Generic DPS set
                # Try to parse DPS number from code
                results.append({
                    'code': code,
                    'result': f'Unknown command: {code}'
                })
        
        return jsonify({
            'success': True,
            'message': 'Commands executed',
            'results': results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/device/<device_id>/simple', methods=['POST'])
def simple_control(device_id):
    """Simplified control endpoint for common operations"""
    if device_id not in DEVICES:
        return jsonify({'success': False, 'message': 'Device not found'}), 404
    
    try:
        data = request.json
        action = data.get('action')
        value = data.get('value')
        
        device = get_device_connection(device_id)
        if not device:
            return jsonify({'success': False, 'message': 'Failed to connect to device'}), 500
        
        if action == 'power':
            result = device.turn_on() if value else device.turn_off()
        elif action == 'brightness':
            result = device.set_brightness(int(value))
        elif action == 'color':
            # Convert RGB to HSV
            r, g, b = value['r'] / 255, value['g'] / 255, value['b'] / 255
            h, s, v = rgb_to_hsv(r, g, b)
            result = device.set_colour(int(h * 360), s, v)
        elif action == 'temperature':
            result = device.set_colourtemp(value)
        else:
            return jsonify({'success': False, 'message': f'Unknown action: {action}'}), 400
        
        return jsonify({
            'success': True,
            'message': 'Command executed',
            'result': result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

def rgb_to_hsv(r, g, b):
    """Convert RGB (0-1) to HSV (h: 0-360, s: 0-1, v: 0-1)"""
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    diff = max_c - min_c
    
    if diff == 0:
        h = 0
    elif max_c == r:
        h = (60 * ((g - b) / diff) + 360) % 360
    elif max_c == g:
        h = (60 * ((b - r) / diff) + 120) % 360
    else:
        h = (60 * ((r - g) / diff) + 240) % 360
    
    s = 0 if max_c == 0 else diff / max_c
    v = max_c
    
    return h, s, v

if __name__ == '__main__':
    import sys
    
    # Disable buffering for background execution
    sys.stdout = sys.stderr
    
    print("Starting TinyTuya Local Control Server...", flush=True)
    print("This controls devices locally - NO cloud API calls!", flush=True)
    
    load_devices()
    
    # Disable debug mode to avoid reloader fork issues
    app.run(host='127.0.0.1', port=5001, debug=False, use_reloader=False)

