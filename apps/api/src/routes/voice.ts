import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { languageSchema, speakRequestSchema } from '@sanjeevani/types';
import { VoiceError } from '@sanjeevani/voice';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { Container } from '../container';
import { AppError } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { requireAuth } from '../middleware/auth';

const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|x-m4a)(;.*)?$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_AUDIO.test(file.mimetype)),
});

function voiceError(error: unknown): AppError {
  if (error instanceof VoiceError) {
    switch (error.kind) {
      case 'not_configured':
        return new AppError(501, 'voice_not_configured', 'Server voice is not configured. Using on-device speech.');
      case 'rate_limited':
        return new AppError(429, 'voice_rate_limited', 'Voice service is busy. Please try again in a moment.');
      case 'bad_audio':
        return new AppError(422, 'bad_audio', 'We couldn’t hear that clearly. Please try again.');
      case 'too_large':
        return new AppError(413, 'payload_too_large', 'That recording is too long.');
      case 'timeout':
        return new AppError(504, 'voice_timeout', 'The voice service took too long. Please try again.');
      default:
        return new AppError(502, 'voice_unavailable', 'Voice service is unavailable right now.');
    }
  }
  return new AppError(502, 'voice_unavailable', 'Voice service is unavailable right now.');
}

export function voiceRoutes(c: Container, voiceLimit: RequestHandler): Router {
  const router = Router();

  router.post('/v1/voice/transcribe', requireAuth, voiceLimit, upload.single('audio'), async (req, res) => {
    if (!req.file) throw new AppError(400, 'bad_audio', 'No audio received. Please try again.');
    const hint = languageSchema.safeParse(req.body?.languageHint);
    try {
      const result = await c.voice.stt.transcribe({
        audio: new Uint8Array(req.file.buffer),
        mimeType: req.file.mimetype,
        ...(hint.success ? { languageHint: hint.data } : {}),
      });
      res.json(result);
    } catch (error) {
      c.logger.warn({ err: error }, 'transcription failed');
      throw voiceError(error);
    }
  });

  router.post('/v1/voice/speak', requireAuth, voiceLimit, async (req, res) => {
    const body = parseBody(speakRequestSchema, req.body);
    let result;
    try {
      result = await c.voice.tts.synthesize({ text: body.text, language: body.language });
    } catch (error) {
      if (!(error instanceof VoiceError && error.kind === 'not_configured')) c.logger.warn({ err: error }, 'speech synthesis failed');
      throw voiceError(error);
    }
    res.status(200);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Voice-Provider', result.provider);
    const stream = Readable.fromWeb(result.stream as unknown as NodeReadableStream<Uint8Array>);
    req.on('close', () => stream.destroy());
    stream.on('error', (err) => {
      c.logger.warn({ err }, 'tts stream interrupted');
      res.destroy(err);
    });
    stream.pipe(res);
  });

  return router;
}
