import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, StepBack, StepForward, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { ErrorState } from '../../components/PageStates';
import api from '../../utils/api';

const SPEEDS = [
  { label: '0.25x', ms: 1400 },
  { label: '0.5x', ms: 900 },
  { label: '1x', ms: 500 },
  { label: '2x', ms: 260 },
  { label: '4x', ms: 150 },
];

function safeSpeak(text, { enabled, voiceName } = {}) {
  if (!enabled) return;
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text || '').slice(0, 2000));
  const voices = synth.getVoices?.() || [];
  const picked = voiceName ? voices.find((v) => v.name === voiceName) : null;
  if (picked) u.voice = picked;
  u.rate = 1.0;
  u.pitch = 1.0;
  synth.speak(u);
}

function ArrayViz({ array = [], pointers = [], window }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-flex gap-2 items-end">
        {array.map((cell, idx) => {
          const hl = cell.highlight || 'none';
          const bg =
            hl === 'active'
              ? 'rgba(6,182,212,0.18)'
              : hl === 'compare'
                ? 'rgba(139,92,246,0.18)'
                : hl === 'swap'
                  ? 'rgba(239,68,68,0.18)'
                  : hl === 'window'
                    ? 'rgba(34,197,94,0.14)'
                    : 'rgba(255,255,255,0.04)';
          const border =
            hl === 'active'
              ? 'rgba(6,182,212,0.45)'
              : hl === 'compare'
                ? 'rgba(139,92,246,0.45)'
                : hl === 'swap'
                  ? 'rgba(239,68,68,0.45)'
                  : hl === 'window'
                    ? 'rgba(34,197,94,0.45)'
                    : 'rgba(255,255,255,0.10)';

          const pointerMarks = pointers.filter((p) => Number(p.index) === idx);
          const inWindow = window && idx >= Number(window.l) && idx <= Number(window.r);
          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <div className="h-4">
                {pointerMarks.length ? (
                  <div className="flex gap-1">
                    {pointerMarks.slice(0, 2).map((p) => (
                      <div
                        key={`${p.name}-${idx}`}
                        className="text-[10px] font-extrabold"
                        style={{ color: p.color || '#06b6d4' }}
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center font-mono text-sm text-white/90"
                style={{
                  background: inWindow ? 'rgba(34,197,94,0.10)' : bg,
                  borderColor: inWindow ? 'rgba(34,197,94,0.35)' : border,
                }}
                title={`idx ${idx}`}
              >
                {String(cell.value ?? '')}
              </div>
              <div className="text-[10px] text-white/45 font-mono">{idx}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StackViz({ stack = [], title = 'Stack' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="font-semibold">{title}</div>
      <div className="mt-3 flex flex-col-reverse gap-2">
        {(stack || []).slice(0, 12).map((v, idx) => (
          <div key={`${v}-${idx}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm">
            {String(v)}
          </div>
        ))}
        {!stack?.length ? <div className="text-sm text-white/60">Empty</div> : null}
      </div>
    </div>
  );
}

function QueueViz({ queue = [], title = 'Queue' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="font-semibold">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(queue || []).slice(0, 16).map((v, idx) => (
          <div key={`${v}-${idx}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm">
            {String(v)}
          </div>
        ))}
        {!queue?.length ? <div className="text-sm text-white/60">Empty</div> : null}
      </div>
    </div>
  );
}

export default function AlgorithmVisualizer() {
  const [query, setQuery] = useState('https://leetcode.com/problems/two-sum/');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  const steps = data?.visualization?.steps || [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(500);
  const [muted, setMuted] = useState(false);

  const step = steps[Math.min(idx, Math.max(0, steps.length - 1))] || null;

  const timerRef = useRef(null);
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => {
        const max = Math.max(steps.length - 1, 0);
        return i >= max ? max : i + 1;
      });
    }, Math.max(120, speedMs));
    return () => clearInterval(timerRef.current);
  }, [playing, speedMs, steps.length]);

  useEffect(() => {
    if (!step?.voiceText) return;
    safeSpeak(step.voiceText, { enabled: !muted });
  }, [idx, muted]);

  const analyze = async () => {
    setLoading(true);
    setErr(null);
    setData(null);
    setIdx(0);
    setPlaying(false);
    try {
      const res = await api.post('/career/visualizer/analyze', { input: query });
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to analyze problem.');
    } finally {
      setLoading(false);
    }
  };

  const maxIdx = Math.max(steps.length - 1, 0);

  if (err) return <ErrorState message={err} />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="career-kicker">Algorithm Visualizer</div>
          <h1 className="font-display font-extrabold text-3xl mt-1">AI-powered interactive teaching</h1>
          <p className="text-sm text-white/65 mt-2 max-w-2xl">
            Paste a LeetCode URL or type a problem name. You’ll get pattern detection + an accurate step walkthrough + final solution.
          </p>
        </div>
        <div className="career-card p-4 flex items-center gap-3 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="career-input !w-[420px] max-sm:!w-[260px]"
            placeholder="LeetCode URL or problem name"
          />
          <button type="button" onClick={analyze} className="career-btn" disabled={loading || !query.trim()}>
            <Sparkles size={16} /> {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIdx(0);
              setPlaying(false);
              if (window?.speechSynthesis) window.speechSynthesis.cancel();
            }}
            className="career-btn opacity-80 hover:opacity-100"
            disabled={!steps.length}
          >
            <RefreshCw size={16} /> Reset
          </button>
        </div>
      </div>

      {data?.pattern ? (
        <div className="career-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="career-kicker">Pattern identified</div>
              <div className="font-display font-extrabold text-2xl mt-1">{data.pattern.name}</div>
              <div className="text-sm text-white/70 mt-2">{data.pattern.ruleOfThumb}</div>
            </div>
            <div className="career-chip">Steps: {steps.length || 0}</div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-semibold">Approach summary</div>
              <ul className="mt-2 text-sm text-white/70 space-y-1">
                {(data.pattern.approach || []).slice(0, 6).map((x, i) => <li key={i}>- {x}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-semibold">How to recognize it next time</div>
              <ul className="mt-2 text-sm text-white/70 space-y-1">
                {(data.pattern.recognitionHints || []).slice(0, 6).map((x, i) => <li key={i}>- {x}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {data?.problem ? (
        <div className="career-card">
          <div className="font-semibold">{data.problem.title}</div>
          <div className="text-sm text-white/70 mt-2 whitespace-pre-wrap">{data.problem.description}</div>
          {data.problem.examples?.length ? (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.problem.examples.slice(0, 2).map((ex, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-semibold">Example {i + 1}</div>
                  <div className="mt-2 text-sm text-white/70 whitespace-pre-wrap">
                    <div><span className="text-white/85 font-semibold">Input:</span> {ex.input}</div>
                    <div><span className="text-white/85 font-semibold">Output:</span> {ex.output}</div>
                    {ex.explanation ? <div className="mt-2"><span className="text-white/85 font-semibold">Why:</span> {ex.explanation}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {steps.length ? (
        <div className="career-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-white/70">Step {idx + 1}/{steps.length}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} className="career-btn" disabled={idx <= 0}>
                <StepBack size={16} /> Back
              </button>
              <button type="button" onClick={() => setPlaying((p) => !p)} className="career-btn">
                {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" onClick={() => setIdx((i) => Math.min(maxIdx, i + 1))} className="career-btn" disabled={idx >= maxIdx}>
                <StepForward size={16} /> Next
              </button>
              <button type="button" onClick={() => setMuted((m) => !m)} className="career-btn opacity-90 hover:opacity-100">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />} {muted ? 'Muted' : 'Voice'}
              </button>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-white/60 font-extrabold uppercase tracking-widest">Speed</span>
                <select className="career-input !w-[110px]" value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
                  {SPEEDS.map((s) => (
                    <option key={s.label} value={s.ms}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-semibold">{step?.label || 'Step'}</div>
              <div className="text-sm text-white/70 mt-1">{step?.stepText || ''}</div>
              <div className="mt-4 space-y-4">
                {step?.state?.array?.length ? (
                  <ArrayViz array={step.state.array} pointers={step.state.pointers || []} window={step.state.window} />
                ) : (
                  <div className="text-sm text-white/60">No array visualization for this step.</div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <StackViz stack={step?.state?.stack || []} />
              <QueueViz queue={step?.state?.queue || []} />
              {step?.voiceText ? (
                <div className="rounded-xl border border-[rgba(6,182,212,0.25)] bg-[rgba(6,182,212,0.06)] p-4">
                  <div className="career-kicker">Teacher voice (text)</div>
                  <div className="text-sm text-white/80 mt-2 whitespace-pre-wrap">{step.voiceText}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {data?.final ? (
        <div className="career-card">
          <div className="font-semibold">Optimal solution</div>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 overflow-x-auto">
            <pre className="text-sm text-white/80 whitespace-pre">{data.final.code}</pre>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-semibold">Complexity</div>
              <div className="text-sm text-white/70 mt-2">
                <div><span className="font-semibold text-white/85">Time:</span> {data.final.complexity?.time}</div>
                <div><span className="font-semibold text-white/85">Space:</span> {data.final.complexity?.space}</div>
                {data.final.complexity?.explain ? <div className="mt-2">{data.final.complexity.explain}</div> : null}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="font-semibold">Similar problems to practice now</div>
              <ul className="mt-2 text-sm text-white/70 space-y-1">
                {(data.final.similar || []).slice(0, 6).map((p, i) => <li key={i}>- {p.title} ({p.pattern})</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

