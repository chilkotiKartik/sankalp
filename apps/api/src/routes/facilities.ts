import { facilitiesQuerySchema, languageSchema } from '@sanjeevani/types';
import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../container';
import { AppError } from '../lib/errors';
import { parseQuery } from '../lib/validate';

const detailQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  language: languageSchema.default('en'),
});

export function facilityRoutes(c: Container): Router {
  const router = Router();

  router.get('/v1/facilities', async (req, res) => {
    const q = parseQuery(facilitiesQuerySchema, req.query);
    const result = await c.facilities.find({
      location: { lat: q.lat, lng: q.lng },
      facilityType: q.type,
      specialty: q.specialty ?? (q.urgency === 'emergency' ? 'emergency_medicine' : 'general_medicine'),
      urgency: q.urgency,
      language: q.language,
      limit: q.limit,
    });
    res.json({ facilities: result.facilities, status: result.status, provider: result.provider, attribution: result.attribution });
  });

  router.get('/v1/facilities/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!/^(gp|cd)_[\w-]{3,300}$/.test(id)) throw AppError.notFound('Facility not found.');
    const q = parseQuery(detailQuery, req.query);
    const origin = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
    const facility = await c.facilities.details(id, q.language, origin).catch((err) => {
      c.logger.warn({ err }, 'facility details failed');
      throw AppError.unavailable('Hospital details are unavailable right now.');
    });
    if (!facility) throw AppError.notFound('Facility not found.');
    res.json({ facility, hasOrigin: Boolean(origin) });
  });

  return router;
}
