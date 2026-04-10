import { useState } from 'react';
import { startCareerSocraticSession, sendCareerSocraticTurn } from '../../utils/careerApi';

export default function SocraticChat() {
  const [topic, setTopic] = useState('Two pointers');
  const [sessionId, setSessionId] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    setMessages([]);
    try {
      const data = await startCareerSocraticSession({ topic });
      setSessionId(data.sessionId);
    } catch (e) {
      setError(e?.message || 'Could not start session');
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !sessionId) return;
    setLoading(true);
    setError('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    try {
      const data = await sendCareerSocraticTurn({ sessionId, message: text });
      const reply = data?.reply;
      const line = `${reply?.assistantMessage || ''}\n\nQ: ${reply?.followUpQuestion || ''}`;
      setMessages([...next, { role: 'assistant', content: line, citations: reply?.citations || [] }]);
    } catch (e) {
      setError(e?.message || 'Socratic turn failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="career-card">
        <div className="career-kicker">Socratic Chat</div>
        <h1 className="font-display font-extrabold text-3xl mt-1">Guided reasoning coach</h1>
        <p className="text-sm text-white/65 mt-2">Grounded guidance with follow-up questions and "I don't know" fallback when context is weak.</p>
      </div>

      <div className="career-card">
        <div className="flex gap-2 flex-wrap">
          <input className="career-input !w-[360px]" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic e.g. Graph BFS" />
          <button className="career-btn" onClick={start} disabled={!topic.trim() || loading}>Start session</button>
        </div>
        {sessionId ? <div className="text-xs text-white/60 mt-2">Session ready</div> : null}
      </div>

      <div className="career-card">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 min-h-[260px] space-y-3">
          {messages.length ? messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-white/10' : 'bg-[#111118] border border-white/10'}`}>
                {m.content}
                {m.role === 'assistant' && m.citations?.length ? (
                  <div className="mt-2 text-xs text-white/55">
                    Sources: {m.citations.map((c) => c.id).join(', ')}
                  </div>
                ) : null}
              </div>
            </div>
          )) : <div className="text-sm text-white/60">Start a session, then ask your first question.</div>}
          {loading ? <div className="text-sm text-white/60">Thinking…</div> : null}
        </div>
        <div className="flex gap-2 mt-3">
          <input className="career-input flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your next question..." />
          <button className="career-btn" onClick={send} disabled={loading || !input.trim() || !sessionId}>Send</button>
        </div>
        {error ? <div className="text-sm text-red-300 mt-2">{error}</div> : null}
      </div>
    </div>
  );
}
