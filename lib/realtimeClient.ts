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

IMPORTANT: When controlling IoT devices, ALWAYS output a JSON command.

=== SMART LIGHT CONTROL ===

JSON FORMAT (required):
{"type":"light","deviceId":"EXACT_DEVICE_ID","action":"ACTION","value":VALUE}

ACTIONS:
- power: true (on) or false (off)
- brightness: 0-100 (percentage)
- color: {"r":255,"g":0,"b":0} (RGB: 0-255 each)
- temperature: 2700-6500 (Kelvin)
${deviceList}
${deviceMapping}

=== MATCHING DEVICE NAMES ===

CRITICAL RULES:
1. ALWAYS use the EXACT device ID from the list above
2. Match device names flexibly:
   - "Main 1", "Main One", "Main 1 light", "first main" → eb506e78c700b185a2ppjq
   - "Main 2", "Main Two", "Main 2 light", "second main" → ebf9a11b3323926dac7jmt  
   - "Door", "Door Light", "entrance", "door lamp" → eb46a372812df2161b6ws2
3. For "all lights", generate SEPARATE commands for EACH device
4. If unsure which light, ask for clarification

=== CRITICAL: TEXT vs AUDIO ===

When controlling devices:
- TEXT OUTPUT: Include BOTH the JSON command AND a friendly message
- AUDIO OUTPUT: ONLY speak the friendly message, NEVER read the JSON aloud

TEXT EXAMPLES (what you write):
User: "Turn on Main 1"
Text: {"type":"light","deviceId":"eb506e78c700b185a2ppjq","action":"power","value":true} Turning on Main 1.

User: "Make Main 2 blue"
Text: {"type":"light","deviceId":"ebf9a11b3323926dac7jmt","action":"color","value":{"r":0,"g":0,"b":255}} Setting Main 2 to blue.

User: "Turn on all lights"
Text: {"type":"light","deviceId":"eb506e78c700b185a2ppjq","action":"power","value":true}{"type":"light","deviceId":"ebf9a11b3323926dac7jmt","action":"power","value":true}{"type":"light","deviceId":"eb46a372812df2161b6ws2","action":"power","value":true} Turning on all lights.

AUDIO SPOKEN (what you say out loud):
- "Turning on Main 1"
- "Setting Main 2 to blue"  
- "Turning on all lights"

DO NOT read the JSON commands in your voice response. Only speak the friendly confirmation.

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
            silence_duration_ms: 500
          },
          temperature: 0.8,
          max_response_output_tokens: 4096
        }
      });
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
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

