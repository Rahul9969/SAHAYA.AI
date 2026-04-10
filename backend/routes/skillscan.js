import express from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { callGroqChat, callGeminiStructuredJSON } from '../services/careerAi.js';
import { findAll, findOne, insertOne, updateOne, upsertOne, deleteOne } from '../middleware/db.js';

const router = express.Router();

function nowIso() {
  return new Date().toISOString();
}

// Collections (stored in app_data_rows when Supabase enabled)
const COL_RESUMES = 'career_skillscan_resumes';
const COL_SKILL_ANALYSIS = 'career_skillscan_skill_analysis';
const COL_ATS = 'career_skillscan_ats_scans';
const COL_JOB_MATCH = 'career_skillscan_job_match';
const COL_LINKEDIN = 'career_skillscan_linkedin';
const COL_SALARY = 'career_skillscan_salary';
const COL_NEGOTIATION = 'career_skillscan_negotiation_scripts';
const COL_APPS = 'career_skillscan_applications';
const COL_REJECTION = 'career_skillscan_rejection_analysis';
const COL_CERTS = 'career_skillscan_certifications';
const COL_CHAT = 'career_skillscan_chat_threads';

// XP storage reuses career_profile in backend/routes/career.js; we keep SkillScan XP separate to avoid coupling.
const COL_XP = 'career_skillscan_xp';

async function awardXp(userId, deltaXp, reason) {
  const existing = await findOne(COL_XP, (x) => x.userId === userId);
  const next = {
    id: existing?.id || `${userId}__skillscan`,
    userId,
    xp: (existing?.xp || 0) + (Number(deltaXp) || 0),
    updatedAt: nowIso(),
    lastReason: reason || null,
  };
  await upsertOne(COL_XP, (x) => x.userId === userId, next);
  return next;
}

// -----------------------------
// Resume parsing (text -> structured)
// -----------------------------
router.post('/resume/parse', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const resumeText = String(req.body?.resumeText || '').slice(0, 120000);
  if (!resumeText.trim()) return res.status(400).json({ error: 'resumeText is required' });

  const system = `Return STRICT JSON only:
{
  "name": "string",
  "summary": "string",
  "skills": [{ "name": "string", "proficiency": "beginner"|"intermediate"|"advanced", "category": "string" }],
  "experience": [{ "title": "string", "company": "string", "duration": "string", "skills_used": ["string"] }],
  "education": { "degree": "string", "field": "string", "year": "string" }
}
Rules:
- If unknown, use empty strings/arrays (not null).
- Keep summary <= 2 sentences.
- Keep arrays reasonably sized (<= 40 skills).`;

  try {
    const parsed = await callGeminiStructuredJSON(system, `RESUME:\n${resumeText}`, 2200);
    const row = { id: randomUUID(), userId, parsed, createdAt: nowIso() };
    await insertOne(COL_RESUMES, row);
    await awardXp(userId, 10, 'resume_parse');
    res.json({ parsed, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to parse resume' });
  }
});

// -----------------------------
// ATS scoring
// -----------------------------
router.post('/resume/ats-score', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const resumeText = String(req.body?.resumeText || '').slice(0, 120000);
  const jobTitle = String(req.body?.jobTitle || '').slice(0, 160);
  if (!resumeText.trim()) return res.status(400).json({ error: 'resumeText is required' });

  const system = `You are an ATS resume analyzer. Return STRICT JSON only:
{
  "ats_score": 0-100,
  "summary": "string",
  "issues": [{ "type": "error"|"warning"|"success", "message": "string", "category": "keywords"|"formatting"|"action_verbs"|"metrics"|"structure"|"length" }],
  "missing_keywords": ["string"],
  "strong_points": ["string"],
  "weak_bullets": [{ "original": "string", "improved": "string", "reason": "string" }]
}
Rules:
- Be practical: propose fixes that match the given resume.
- If jobTitle provided, bias keywords to that role.`;

  const prompt = `TARGET ROLE: ${jobTitle || '(not provided)'}\n\nRESUME:\n${resumeText}`;
  try {
    const ats = await callGeminiStructuredJSON(system, prompt, 2400);
    const row = { id: randomUUID(), userId, jobTitle: jobTitle || null, ats, createdAt: nowIso() };
    await insertOne(COL_ATS, row);
    await awardXp(userId, 12, 'ats_score');
    res.json({ ats, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to run ATS scoring' });
  }
});

// -----------------------------
// Skill gap analysis (skills + target role)
// -----------------------------
router.post('/skills/analyze', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const jobTitle = String(req.body?.jobTitle || '').slice(0, 160);
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  const experienceLevel = String(req.body?.experienceLevel || '').slice(0, 80);
  const targetCompanies = Array.isArray(req.body?.targetCompanies) ? req.body.targetCompanies.slice(0, 10) : [];

  if (!jobTitle.trim()) return res.status(400).json({ error: 'jobTitle is required' });
  if (!Array.isArray(skills) || skills.length === 0) return res.status(400).json({ error: 'skills[] is required' });

  const system = `You are a senior technical recruiter. Return STRICT JSON only:
{
  "readiness_score": 0-100,
  "matched_skills": [{ "name":"string","proficiency":"string","importance":"high"|"medium"|"low","percent":0-100 }],
  "missing_skills": [{ "name":"string","priority":"critical"|"important"|"nice-to-have","learning_time_days":number,"score_impact":number,"reason":"string","category":"string" }],
  "competitive_percentile": 0-100,
  "top_3_quick_wins": [{ "skill":"string","days_to_learn":number,"score_boost":number }],
  "overall_feedback":"string",
  "skill_categories": [{ "name":"string","icon":"string","skills":[{ "name":"string","status":"strong"|"learning"|"missing","percent":0-100,"reason":"string" }] }],
  "radar_data": [{ "axis":"string","required":0-100,"current":0-100 }]
}
Rules:
- Keep missing_skills focused (<= 18 items).
- Use realistic learning_time_days for a student.`;

  const prompt = `TARGET ROLE: ${jobTitle}
EXPERIENCE LEVEL: ${experienceLevel || 'Entry'}
TARGET COMPANIES: ${(targetCompanies || []).join(', ') || '(any)'}
SKILLS: ${JSON.stringify(skills).slice(0, 12000)}`;

  try {
    const analysis = await callGeminiStructuredJSON(system, prompt, 2600);
    const row = { id: randomUUID(), userId, jobTitle, experienceLevel: experienceLevel || null, targetCompanies, analysis, createdAt: nowIso() };
    await insertOne(COL_SKILL_ANALYSIS, row);
    await awardXp(userId, 20, 'skill_gap_analysis');
    res.json({ analysis, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to analyze skills' });
  }
});

// -----------------------------
// Job match score (JD vs resume)
// -----------------------------
router.post('/job-match', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const jdText = String(req.body?.jdText || '').slice(0, 60000);
  const resumeText = String(req.body?.resumeText || '').slice(0, 120000);
  const targetRole = String(req.body?.targetRole || '').slice(0, 160);
  if (!jdText.trim()) return res.status(400).json({ error: 'jdText is required' });

  const system = `Return STRICT JSON only:
{
  "match_score": 0-100,
  "matched_skills": ["string"],
  "missing_skills": ["string"],
  "notes": ["string"],
  "projected_match_after_roadmap": 0-100
}`;
  const prompt = `TARGET ROLE: ${targetRole || '(not provided)'}
JOB DESCRIPTION:
${jdText}

RESUME (optional; may be empty):
${resumeText || '(not provided)'}
`;
  try {
    const match = await callGeminiStructuredJSON(system, prompt, 1800);
    const row = { id: randomUUID(), userId, targetRole: targetRole || null, match, createdAt: nowIso() };
    await insertOne(COL_JOB_MATCH, row);
    await awardXp(userId, 10, 'job_match');
    res.json({ match, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to compute job match' });
  }
});

// -----------------------------
// LinkedIn analyzer
// -----------------------------
router.post('/linkedin/analyze', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const profileText = String(req.body?.profileText || '').slice(0, 60000);
  const targetRole = String(req.body?.targetRole || '').slice(0, 160);
  if (profileText.trim().length < 20) return res.status(400).json({ error: 'profileText too short' });

  const system = `Return STRICT JSON only:
{
  "overall_score": 0-100,
  "recruiter_click_probability": 0-100,
  "sections": {
    "headline": { "score": 0-10, "current":"string", "problems":["string"], "fix":"string" },
    "about": { "score": 0-10, "current":"string", "problems":["string"], "fix":"string" },
    "experience": { "score": 0-10, "problems":["string"], "fix":"string" },
    "skills": { "score": 0-10, "current":["string"], "missing":["string"] },
    "education": { "score": 0-10 },
    "achievements": { "score": 0-10, "suggestions":["string"] }
  },
  "missing_keywords": ["string"],
  "present_keywords": [{ "keyword":"string","count":number }],
  "priority_actions": [{ "action":"string","priority":"high"|"medium"|"low","time_minutes":number }]
}`;
  const prompt = `TARGET ROLE: ${targetRole || 'Software Engineer'}
LINKEDIN TEXT:
${profileText}`;

  try {
    const analysis = await callGeminiStructuredJSON(system, prompt, 2600);
    const row = { id: randomUUID(), userId, targetRole: targetRole || null, analysis, createdAt: nowIso() };
    await insertOne(COL_LINKEDIN, row);
    await awardXp(userId, 12, 'linkedin_analyze');
    res.json({ analysis, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to analyze LinkedIn profile' });
  }
});

// -----------------------------
// Salary intelligence + negotiation script
// -----------------------------
router.post('/salary/intel', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const role = String(req.body?.role || '').slice(0, 160);
  const experience = String(req.body?.experience || 'fresher').slice(0, 40);
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.slice(0, 40) : [];
  const missingSkills = Array.isArray(req.body?.missingSkills) ? req.body.missingSkills.slice(0, 40) : [];
  if (!role.trim()) return res.status(400).json({ error: 'role is required' });

  const system = `Return STRICT JSON only:
{
  "current_range": {"min": number, "max": number},
  "projected_range": {"min": number, "max": number},
  "salary_increase": number,
  "roi_percentage": number,
  "percentile": number,
  "skill_salary_impact": [{"skill":"string","lpa_added":number,"status":"missing"|"partial"|"have"}],
  "best_cities": [{"city":"string","avg_lpa":number,"openings":number,"tag":"string","emoji":"string"}],
  "growth_timeline": {"without":[number,number,number,number,number,number], "with":[number,number,number,number,number,number]},
  "negotiation_talking_points": ["string"]
}
Market: India.`;

  const prompt = `ROLE: ${role}
EXPERIENCE: ${experience}
CURRENT SKILLS: ${JSON.stringify(skills)}
MISSING SKILLS: ${JSON.stringify(missingSkills)}`;
  try {
    const intel = await callGeminiStructuredJSON(system, prompt, 2400);
    const row = { id: randomUUID(), userId, role, experience, intel, createdAt: nowIso() };
    await insertOne(COL_SALARY, row);
    await awardXp(userId, 15, 'salary_intel');
    res.json({ intel, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed salary intelligence' });
  }
});

router.post('/salary/negotiation-script', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const role = String(req.body?.role || 'Software Engineer').slice(0, 160);
  const city = String(req.body?.city || 'Bangalore').slice(0, 80);
  const currentOffer = String(req.body?.currentOffer || '').slice(0, 24);
  const targetSalary = String(req.body?.targetSalary || '').slice(0, 24);
  const strongestSkill = String(req.body?.strongestSkill || '').slice(0, 80);
  const yearsExperience = String(req.body?.yearsExperience || '').slice(0, 24);
  if (!currentOffer || !targetSalary) return res.status(400).json({ error: 'currentOffer and targetSalary required' });

  const system = 'Write a concise professional negotiation script (3-4 paragraphs). Plain text only.';
  const prompt = `ROLE: ${role}
CITY: ${city}
CURRENT OFFER: ₹${currentOffer} LPA
TARGET: ₹${targetSalary} LPA
STRONGEST SKILL: ${strongestSkill || '(not provided)'}
YEARS RELEVANT PROJECTS: ${yearsExperience || '(not provided)'}
Write the script.`;

  try {
    const script = await callGroqChat(system, prompt, { maxTokens: 700 });
    const row = { id: randomUUID(), userId, role, city, script, createdAt: nowIso() };
    await insertOne(COL_NEGOTIATION, row);
    await awardXp(userId, 5, 'negotiation_script');
    res.json({ script, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to generate script' });
  }
});

// -----------------------------
// Application tracker CRUD (stored as docs)
// -----------------------------
router.get('/applications', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const apps = await findAll(COL_APPS, (a) => a.userId === userId);
  res.json({ applications: apps.sort((a, b) => new Date(b.date_applied) - new Date(a.date_applied)) });
});

router.post('/applications', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { company, role, date_applied, status, match_score = 0, salary_offered = null, notes = '' } = req.body || {};
  if (!company || !role) return res.status(400).json({ error: 'company and role required' });
  const app = {
    id: randomUUID(),
    userId,
    company: String(company).slice(0, 120),
    role: String(role).slice(0, 160),
    date_applied: String(date_applied || new Date().toISOString().slice(0, 10)).slice(0, 10),
    status: String(status || 'applied'),
    match_score: Math.max(0, Math.min(100, Number(match_score) || 0)),
    salary_offered: salary_offered == null ? null : Number(salary_offered),
    notes: String(notes || '').slice(0, 2000),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await insertOne(COL_APPS, app);
  await awardXp(userId, 3, 'application_added');
  res.status(201).json({ application: app });
});

router.patch('/applications/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = req.params.id;
  const updated = await updateOne(COL_APPS, (a) => a.userId === userId && a.id === id, { ...req.body, updatedAt: nowIso() });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ application: updated });
});

router.delete('/applications/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = req.params.id;
  const ok = await deleteOne(COL_APPS, (a) => a.userId === userId && a.id === id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/applications/rejection-analysis', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const applications = await findAll(COL_APPS, (a) => a.userId === userId);
  const rejected = applications.filter((a) => a.status === 'rejected');
  if (rejected.length < 2) return res.status(400).json({ error: 'Need at least 2 rejected applications' });

  const system = `Return STRICT JSON only:
{
  "patterns": [{ "pattern":"string","frequency":number,"affected_applications":number,"recommendation":"string","action":"string" }],
  "optimal_match_threshold": number,
  "success_rate_prediction": number,
  "top_recommendation": "string"
}`;
  try {
    const analysis = await callGeminiStructuredJSON(system, `APPLICATIONS:\n${JSON.stringify(applications).slice(0, 18000)}`, 1800);
    const row = { id: randomUUID(), userId, analysis, createdAt: nowIso() };
    await insertOne(COL_REJECTION, row);
    await awardXp(userId, 8, 'rejection_analysis');
    res.json({ analysis, savedId: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Analysis failed' });
  }
});

// -----------------------------
// Certifications: recommend + tracker
// -----------------------------
router.post('/certifications/recommend', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const role = String(req.body?.role || '').slice(0, 160);
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.slice(0, 40) : [];
  const missingSkills = Array.isArray(req.body?.missingSkills) ? req.body.missingSkills.slice(0, 40) : [];
  const budget = String(req.body?.budget || 'any').slice(0, 40);
  if (!role.trim()) return res.status(400).json({ error: 'role required' });

  const system = `Return STRICT JSON only:
{
  "certifications": [{
    "name":"string","platform":"string","duration":"string","cost":"string",
    "salary_impact_lpa": number,
    "recruiter_recognition":"low"|"medium"|"high"|"very_high",
    "gaps_closed":["string"],
    "priority": number,
    "free_option": boolean,
    "url":"string"
  }],
  "total_salary_impact": number,
  "fastest_to_complete":"string",
  "highest_roi":"string"
}`;
  const prompt = `ROLE: ${role}
BUDGET: ${budget}
CURRENT SKILLS: ${JSON.stringify(skills)}
MISSING SKILLS: ${JSON.stringify(missingSkills)}
Recommend top 5 certifications relevant to India job market (include free options when possible).`;

  try {
    const rec = await callGeminiStructuredJSON(system, prompt, 2200);
    await awardXp(userId, 10, 'cert_recommendations');
    res.json({ recommendations: rec });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to recommend certifications' });
  }
});

router.get('/certifications/tracker', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const rows = await findAll(COL_CERTS, (c) => c.userId === userId);
  res.json({ tracked: rows });
});

router.post('/certifications/tracker', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { name, platform, status = 'not_started', completion_percent = 0, cost = '', duration = '', salary_impact = 0, gaps_closed = [], url = '' } = req.body || {};
  if (!name || !platform) return res.status(400).json({ error: 'name and platform required' });
  const row = {
    id: randomUUID(),
    userId,
    name: String(name).slice(0, 200),
    platform: String(platform).slice(0, 120),
    status: String(status),
    completion_percent: Math.max(0, Math.min(100, Number(completion_percent) || 0)),
    cost: String(cost || '').slice(0, 80),
    duration: String(duration || '').slice(0, 80),
    salary_impact: Number(salary_impact) || 0,
    gaps_closed: Array.isArray(gaps_closed) ? gaps_closed.slice(0, 20) : [],
    url: String(url || '').slice(0, 400),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await insertOne(COL_CERTS, row);
  await awardXp(userId, 4, 'cert_tracked');
  res.status(201).json({ tracked: row });
});

router.patch('/certifications/tracker/:id', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const id = req.params.id;
  const updates = { ...req.body, updatedAt: nowIso() };
  const row = await updateOne(COL_CERTS, (c) => c.userId === userId && c.id === id, updates);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ tracked: row });
});

// -----------------------------
// Lightweight chat thread (non-streaming response)
// -----------------------------
router.post('/chat', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  if (!messages.length) return res.status(400).json({ error: 'messages[] required' });

  const system = `You are a career advisor for students. Be direct and actionable. Use bullets when listing.`;
  const prompt = `Conversation:\n${messages.map((m) => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '').slice(0, 2000)}`).join('\n')}\n\nRespond as ASSISTANT.`;

  try {
    const reply = await callGroqChat(system, prompt, { maxTokens: 700 });
    const thread = {
      id: randomUUID(),
      userId,
      messages,
      reply,
      createdAt: nowIso(),
    };
    await insertOne(COL_CHAT, thread);
    await awardXp(userId, 2, 'chat_turn');
    res.json({ reply, threadId: thread.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Chat failed' });
  }
});

export default router;

