import { VoiceError, type SpeechToTextProvider, type TextToSpeechProvider } from '../../types';

/**
 * Stand-in when no server voice provider is configured. It tells the client,
 * through capabilities and a clear error, to use the browser's own speech engine.
 */
export class BrowserDelegateSpeechToText implements SpeechToTextProvider {
  readonly id = 'browser';
  async transcribe(): Promise<never> {
    throw new VoiceError('not_configured', 'Server speech-to-text is not configured; use on-device recognition.');
  }
}

export class BrowserDelegateTextToSpeech implements TextToSpeechProvider {
  readonly id = 'browser';
  async synthesize(): Promise<never> {
    throw new VoiceError('not_configured', 'Server text-to-speech is not configured; use on-device speech.');
  }
}
