import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getOrCreateGamification, getOrCreateDailyQuests } from '../services/gamificationCore.js';

const router = express.Router();

/** GET /api/gamification/profile */
router.get('/profile', authMiddleware, async (req, res) => {
  const row = await getOrCreateGamification(req.userId);
  res.json(row);
});

/** GET /api/gamification/quests?world=study|career */
router.get('/quests', authMiddleware, async (req, res) => {
  const world = String(req.query.world || 'study');
  if (world !== 'study' && world !== 'career') return res.status(400).json({ error: 'Invalid world' });
  const quests = await getOrCreateDailyQuests(req.userId, world);
  res.json({ world, date: new Date().toISOString().split('T')[0], quests });
});

export default router;

