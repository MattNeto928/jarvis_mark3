/**
 * OpenAI Text-to-Speech (TTS) Service
 * Converts text to speech using OpenAI's TTS API
 */

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';

export interface TTSOptions {
  model?: TTSModel;
  voice?: TTSVoice;
  speed?: number; // 0.25 to 4.0
}

export class TTSService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Convert text to speech using OpenAI TTS API
   * @param text The text to convert to speech (max 4096 characters)
   * @param options TTS options (model, voice, speed)
   * @returns Audio blob that can be played
   */
  async textToSpeech(
    text: string,
    options: TTSOptions = {}
  ): Promise<Blob> {
    const {
      model = 'tts-1', // tts-1 is faster, tts-1-hd is higher quality
      voice = 'alloy',
      speed = 1.0
    } = options;

    // Validate text length
    if (text.length > 4096) {
      throw new Error('Text exceeds maximum length of 4096 characters');
    }

    if (speed < 0.25 || speed > 4.0) {
      throw new Error('Speed must be between 0.25 and 4.0');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          speed,
          response_format: 'mp3', // mp3, opus, aac, flac, wav, pcm
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`TTS API error: ${error.error?.message || 'Unknown error'}`);
      }

      const audioBlob = await response.blob();
      return audioBlob;
    } catch (error) {
      console.error('TTS error:', error);
      throw error;
    }
  }

  /**
   * Convert text to speech and play immediately
   * @param text The text to convert to speech
   * @param options TTS options
   * @returns Audio element that is playing
   */
  async speakText(
    text: string,
    options: TTSOptions = {}
  ): Promise<HTMLAudioElement> {
    const audioBlob = await this.textToSpeech(text, options);
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    
    // Clean up the object URL when audio finishes
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl);
    });
    
    await audio.play();
    
    return audio;
  }

  /**
   * Stream text to speech for longer content
   * Note: The API doesn't support true streaming, but we can chunk text
   */
  async streamTextToSpeech(
    text: string,
    options: TTSOptions = {},
    onChunkReady?: (audio: HTMLAudioElement) => void
  ): Promise<void> {
    // Split text into chunks of ~4000 characters at sentence boundaries
    const chunks = this.splitTextIntoChunks(text, 4000);
    
    for (const chunk of chunks) {
      const audio = await this.speakText(chunk, options);
      
      if (onChunkReady) {
        onChunkReady(audio);
      }
      
      // Wait for this chunk to finish before playing the next
      await new Promise<void>((resolve) => {
        audio.addEventListener('ended', () => resolve());
      });
    }
  }

  /**
   * Split text into chunks at sentence boundaries
   */
  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
}

/**
 * Voice descriptions for UI
 */
export const VOICE_DESCRIPTIONS: Record<TTSVoice, string> = {
  alloy: 'Neutral and balanced',
  echo: 'Calm and clear',
  fable: 'Expressive and warm',
  onyx: 'Deep and authoritative',
  nova: 'Pleasant and friendly',
  shimmer: 'Soft and gentle',
};

