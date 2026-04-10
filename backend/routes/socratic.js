import express from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { callGeminiJSON } from '../services/gemini.js';
import { ragRetrieve } from '../services/ragLocal.js';
import { awardXp, incrementQuest, WORLDS } from '../services/gamificationCore.js';
import { findOne, insertOne, updateOne } from '../middleware/db.js';

const router = express.Router();
const COL = 'career_socratic_sessions';

function nowIso() {
  return new Date().toISOString();
}

function sanitizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1400),
    }));
}

router.post('/start', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const topic = String(req.body?.topic || '').trim().slice(0, 120);
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  const id = randomUUID();
  const row = {
    id,
    userId,
    topic,
    history: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await insertOne(COL, row);
  res.json({ sessionId: id, topic });
});

router.post('/turn', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const sessionId = String(req.body?.sessionId || '').trim();
  const userMessage = String(req.body?.message || '').trim().slice(0, 1600);
  if (!sessionId || !userMessage) return res.status(400).json({ error: 'sessionId and message are required' });

  const session = await findOne(COL, (x) => x.id === sessionId && x.userId === userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  let rag = [];
  try {
    rag = await ragRetrieve(`${session.topic}\n${userMessage}`, { mode: 'career', k: 4 });
  } catch {
    rag = [];
  }
  const context = rag
    .map((r, i) => ({
      id: `ctx_${i + 1}`,
      text: String(r.text || '').slice(0, 700),
    }))
    .slice(0, 4);

  const system = `You are a Socratic coding mentor. Respond with valid JSON only.
Rules:
- Ask guiding questions first; avoid dumping full solution unless user explicitly asks.
- If uncertain or not grounded in provided context, say "I don't know based on the available context."
- If user asks for facts, include citations by context id list.
- Keep response concise and actionable.
Required JSON shape:
{
  "assistantMessage": "string",
  "followUpQuestion": "string",
  "confidence": "high"|"medium"|"low",
  "citations": [{"id":"ctx_1","snippet":"string"}],
  "grounded": true|false
}`;
  const prompt = `TOPIC: ${session.topic}
CONTEXT: ${JSON.stringify(context)}
HISTORY: ${JSON.stringify(sanitizeHistory(session.history))}
USER: ${userMessage}`;

  try {
    const ai = await callGeminiJSON(system, prompt, 900);
    const safe = {
      assistantMessage: String(ai?.assistantMessage || "I don't know based on the available context."),
      followUpQuestion: String(ai?.followUpQuestion || 'What part would you like to explore next?'),
      confidence: ['high', 'medium', 'low'].includes(ai?.confidence) ? ai.confidence : 'low',
      citations: Array.isArray(ai?.citations) ? ai.citations.slice(0, 3).map((c) => ({
        id: String(c?.id || ''),
        snippet: String(c?.snippet || '').slice(0, 220),
      })).filter((c) => c.id) : [],
      grounded: Boolean(ai?.grounded),
    };

    const history = [
      ...sanitizeHistory(session.history),
      { role: 'user', content: userMessage },
      { role: 'assistant', content: safe.assistantMessage },
    ].slice(-16);
    await updateOne(COL, (x) => x.id === sessionId && x.userId === userId, { history, updatedAt: nowIso() });
    await awardXp(userId, 4, 'career_socratic_turn', { world: WORLDS.career });
    await incrementQuest(userId, WORLDS.career, 'career_socratic_turns', 1);
    res.json({ sessionId, reply: safe });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Socratic turn failed' });
  }
});

export default router;
