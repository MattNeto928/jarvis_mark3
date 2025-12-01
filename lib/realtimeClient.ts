/**
 * OpenAI Realtime API Client
 * Handles WebSocket connection and message routing
 */

export type RealtimeEvent = {
  type: string;
  event_id?: string;
  [key: string]: any;
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private model: string;
  private voice: string;
  private devices: any[];
  private onMessage: ((event: RealtimeEvent) => void) | null = null;
  private onStatusChange: ((status: ConnectionStatus) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(apiKey: string, model = 'gpt-4o-realtime-preview-2024-12-17', voice = 'alloy', devices: any[] = []) {
    this.apiKey = apiKey;
    this.model = model;
    this.voice = voice;
    this.devices = devices;
  }

  connect(
    onMessage: (event: RealtimeEvent) => void,
    onStatusChange: (status: ConnectionStatus) => void
  ) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;

    this.updateStatus('connecting');

    // OpenAI Realtime API WebSocket endpoint
    const url = `wss://api.openai.com/v1/realtime?model=${this.model}`;
    
    this.ws = new WebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${this.apiKey}`,
      'openai-beta.realtime-v1'
    ]);

    this.ws.addEventListener('open', () => {
      console.log('WebSocket connected');
      this.updateStatus('connected');
      this.reconnectAttempts = 0;
      
      // Build detailed device list for instructions
      const deviceList = this.devices.length > 0 
        ? '\n\nAVAILABLE DEVICES:\n' + this.devices.map(d => {
            const room = d.room ? ` in ${d.room}` : '';
            return `- "${d.name}"${room}\n  Device ID: ${d.id}\n  Type: ${d.type}`;
          }).join('\n')
        : '\n\nNo devices configured yet.';
      
      // Build device name to ID mapping for easy reference
      const deviceMapping = this.devices.length > 0
        ? '\n\nDEVICE NAME → ID MAPPING:\n' + this.devices.map(d => 
            `"${d.name}" → ${d.id}`
          ).join('\n')
        : '';
      
      // Send session configuration
      this.send({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: `You are a helpful AI assistant in a smart mirror. Be conversational and friendly.

IMPORTANT: When controlling IoT devices, ALWAYS output a JSON command with the correct transport type.

=== DEVICE TYPES AND TRANSPORTS ===

There are TWO types of lighting devices with DIFFERENT command formats:

1. TUYA LIGHTS (Network Transport)
   - Smart bulbs connected via WiFi/network
   - Examples: "Main 1", "Main 2", "Door Light"
   - Format: {"type":"light","transport":"network","deviceId":"...","action":"...","value":...}

2. LED STRIP (UART Direct Packet)
   - Addressable LED strip controlled via UART serial
   - Examples: "LED strip", "strip", "addressable led"
   - Format: {"dst":"node_01","src":"jetson","device":"led","payload":{...}}

${deviceList}
${deviceMapping}

=== TUYA LIGHT COMMANDS (Network Transport) ===

CRITICAL: Output on a SINGLE LINE (compact format, no pretty printing, no code blocks)

CORRECT FORMAT (single line):
{"type":"light","transport":"network","deviceId":"DEVICE_ID","action":"ACTION","value":VALUE}

ACTIONS:
- power: true (on) or false (off)
- brightness: 0-100 (percentage)
- color: {"r":255,"g":0,"b":0} (RGB: 0-255 each)
- temperature: 2700-6500 (Kelvin)

=== LED STRIP COMMANDS (Direct UART Packet) ===

CRITICAL RULES:
1. LED strip commands use DIRECT UART packet format (NOT the type/transport format)
2. Output the JSON on a SINGLE LINE (compact format, no pretty printing)
3. Do NOT wrap in markdown code blocks (no \`\`\`json)
4. Put the JSON at the START of your response, followed by the friendly message

CORRECT FORMAT (single line):
{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"solid","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":1.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}}

WRONG FORMAT (do NOT use):
\`\`\`json
{
  "dst": "node_01",
  ...
}
\`\`\`

PACKET STRUCTURE:
• dst: "node_01" (ALWAYS use this - the target ESP32 node)
• src: "jetson" (ALWAYS use this - the source)
• device: "led" (ALWAYS use this - the device type on the node)
• payload: object containing all LED settings (see below)

PAYLOAD FIELDS (ALL REQUIRED):
• state: "on" or "off"
• mode: "solid" | "breath" | "rainbow" | "chase" | "heart_rate"
• color: {"r":0-255,"g":0-255,"b":0-255} (primary color)
• color2: {"r":0-255,"g":0-255,"b":0-255} (secondary color, use {"r":0,"g":0,"b":0} if not needed)
• brightness: 0.0-1.0 (float)
• transition_ms: number (fade time in milliseconds)
• duration_ms: number (0 = infinite duration)
• effect: object (see below)

EFFECT OBJECT (REQUIRED, includes at minimum):
• speed: 0.0-1.0 (REQUIRED - animation speed)
• direction: "cw" or "ccw" (REQUIRED - rotation direction)
• min_brightness: 0.0-1.0 (optional - for breath/heart_rate modes)
• width: 0.0-1.0 (optional - for chase mode, segment width)
• spacing: 0.0-1.0 (optional - for chase mode, gap size)
• count: number (optional - for chase mode, number of segments)

=== MATCHING DEVICE NAMES ===

CRITICAL RULES:
1. TUYA LIGHTS use the {"type":"light",...} format
2. LED STRIP uses the {"dst":"node_01",...} UART packet format
3. Match device names flexibly:
   - Tuya Lights (use type/transport/deviceId format):
     - "Main 1", "Main One", "first main" → deviceId: eb506e78c700b185a2ppjq
     - "Main 2", "Main Two", "second main" → deviceId: ebf9a11b3323926dac7jmt
     - "Door", "Door Light", "entrance" → deviceId: eb46a372812df2161b6ws2
   - LED Strip (use dst/src/device/payload format):
     - "LED strip", "strip", "addressable led" → ALWAYS use {"dst":"node_01","src":"jetson","device":"led",...}
4. For "all lights", generate SEPARATE commands for EACH device (mixing both formats)
5. If unsure which device, ask for clarification

=== CRITICAL: TEXT vs AUDIO ===

When controlling devices:
- TEXT OUTPUT: Include BOTH the JSON command AND a friendly message
- AUDIO OUTPUT: ONLY speak the friendly message, NEVER read the JSON aloud

EXAMPLES - LED STRIP (SINGLE LINE FORMAT - copy exactly):

User: "Make the LED strip solid red"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"solid","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":1.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}} Setting LED strip to solid red.

User: "Make the strip breathe blue"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"breath","color":{"r":0,"g":100,"b":255},"color2":{"r":0,"g":0,"b":0},"brightness":0.8,"transition_ms":1000,"duration_ms":0,"effect":{"speed":0.3,"direction":"cw","min_brightness":0.1}}} Making the LED strip breathe blue.

User: "Set strip to rainbow"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"rainbow","color":{"r":0,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":0.5,"transition_ms":0,"duration_ms":0,"effect":{"speed":0.8,"direction":"ccw"}}} Setting LED strip to rainbow mode.

User: "Chase red and blue on strip"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"chase","color":{"r":255,"g":0,"b":0},"color2":{"r":0,"g":0,"b":255},"brightness":0.7,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.6,"direction":"cw","width":0.15,"spacing":0.15,"count":3}}} Setting LED strip to chase red and blue.

User: "Turn off the strip"
Response: {"dst":"node_01","src":"jetson","device":"led","payload":{"state":"off","mode":"solid","color":{"r":0,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":0.0,"transition_ms":500,"duration_ms":0,"effect":{"speed":0.0,"direction":"cw"}}} Turning off LED strip.

EXAMPLES - TUYA LIGHTS:

Turn on: {"type":"light","transport":"network","deviceId":"eb506e78c700b185a2ppjq","action":"power","value":true} Turning on Main 1.

Set color: {"type":"light","transport":"network","deviceId":"ebf9a11b3323926dac7jmt","action":"color","value":{"r":0,"g":0,"b":255}} Setting Main 2 to blue.

EXAMPLES - MIXED (Tuya + LED strip):

User: "Turn door light blue and make the LED strip rainbow"
{"type":"light","transport":"network","deviceId":"eb46a372812df2161b6ws2","action":"color","value":{"r":0,"g":0,"b":255}}{"dst":"node_01","src":"jetson","device":"led","payload":{"state":"on","mode":"rainbow","color":{"r":0,"g":0,"b":0},"color2":{"r":0,"g":0,"b":0},"brightness":0.5,"transition_ms":0,"duration_ms":0,"effect":{"speed":0.8,"direction":"ccw"}}} Setting door light to blue and LED strip to rainbow mode.

AUDIO OUTPUT:
Only speak the friendly message (after the JSON). Never read the JSON aloud.

For non-IoT queries, respond normally without JSON.`,
          voice: this.voice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 800  // Balanced: responsive but won't cut off mid-thought
          },
          temperature: 0.8,
          max_response_output_tokens: 4096
        }
      });
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        // Log transcription-related events for debugging
        if (data.type && (data.type.includes('transcription') || data.type.includes('conversation.item'))) {
          console.log('📨 WebSocket message:', data.type, data);
        }
        if (this.onMessage) {
          this.onMessage(data);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('error');
    });

    this.ws.addEventListener('close', () => {
      console.log('WebSocket closed');
      this.updateStatus('disconnected');
      
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => {
          if (this.onMessage && this.onStatusChange) {
            this.connect(this.onMessage, this.onStatusChange);
          }
        }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000));
      }
    });
  }

  send(event: RealtimeEvent) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  sendAudio(audioData: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send audio - WebSocket not open')
      return
    }
    this.send({
      type: 'input_audio_buffer.append',
      audio: audioData
    });
  }

  commitAudio() {
    this.send({
      type: 'input_audio_buffer.commit'
    });
  }

  createResponse() {
    this.send({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: ''
      }
    });
  }

  cancelResponse() {
    this.send({
      type: 'response.cancel'
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateStatus('disconnected');
  }

  private updateStatus(status: ConnectionStatus) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

