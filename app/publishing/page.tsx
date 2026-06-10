'use client';

import { useState, useEffect, useCallback } from 'react';
import { ParchmentCard, BrassButton, CarvedHeader, ParchmentInput, ParchmentTextarea, ParchmentSelect } from '@/components/antiquarian';
import { useStory } from '@/lib/store';
import { BookOpen, FileText, Send, Search, Table2, Plus, Trash2, Edit3, Check, X } from 'lucide-react';

type Tab = 'kdp' | 'query' | 'synopsis' | 'comp' | 'tracker';

interface Submission {
  id: string;
  agentName: string;
  agency: string;
  dateSent: string;
  status: 'queried' | 'requested' | 'rejected' | 'accepted';
  notes: string;
}

const STORAGE_KEY = 'zagafy_submissions';

function loadSubmissions(): Submission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSubmissions(subs: Submission[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
}

export default function PublishingPage() {
  const [tab, setTab] = useState<Tab>('kdp');
  const { state } = useStory();

  // --- KDP ---
  const totalWords = state.chapters.reduce((s, c) => s + (c.content ? c.content.split(/\s+/).filter(Boolean).length : 0), 0);
  const kdpPreview = `KDP Formatting Preview
━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${state.title || 'Untitled'}
Word Count: ${totalWords.toLocaleString()}
Chapters: ${state.chapters.length}

Recommended KDP Settings:
• Font: 12pt Times New Roman
• Margins: 1" all sides
• Line Spacing: Double-spaced
• Page Size: 6" x 9" (standard trade)
• Headers: Chapter title, right-aligned
• Page Numbers: Bottom center, starting after front matter

Front Matter Order:
  1. Title Page
  2. Copyright Page
  3. Dedication (optional)
  4. Table of Contents

Chapter Formatting:
  • Start each chapter on a new page
  • Chapter title: 14pt, bold, centered
  • First paragraph: No indent
  • Body paragraphs: 0.5" first-line indent
  • Scene breaks: Centered "* * *"

Note: Full .docx export is coming in a future update.`;

  // --- Query Letter ---
  const [queryForm, setQueryForm] = useState({ agentName: '', agencyName: '', genrePrefs: '' });
  const [queryLetter, setQueryLetter] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  const generateQueryLetter = useCallback(async () => {
    setQueryLoading(true);
    try {
      const res = await fetch('/api/publishing/query-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || queryForm.genrePrefs,
          synopsis: state.synopsis || 'A compelling story.',
          protagonistName: state.characters?.[0]?.name || '',
          agentName: queryForm.agentName,
          agencyName: queryForm.agencyName,
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setQueryLetter(data.letter || data.data?.letter || '');
      else setQueryLetter(`Error: ${data.message || data.error || 'Failed to generate'}`);
    } catch (e) {
      setQueryLetter('Error: Network request failed');
    } finally {
      setQueryLoading(false);
    }
  }, [state, queryForm]);

  // --- Synopsis ---
  const [synopsisResult, setSynopsisResult] = useState('');
  const [synopsisLoading, setSynopsisLoading] = useState(false);

  const generateSynopsis = useCallback(async (length: '1-page' | '5-page') => {
    setSynopsisLoading(true);
    try {
      const chapterSummaries = state.chapters.map((c, i) => `Ch ${i + 1}: ${c.title || 'Untitled'}`).join('\n');
      const charList = state.characters?.map(c => `${c.name} (${c.role})`).join(', ') || '';
      const res = await fetch('/api/publishing/synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          length,
          title: state.title,
          genre: state.genre || '',
          synopsis: state.synopsis || '',
          chapters: chapterSummaries,
          characters: charList,
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setSynopsisResult(data.synopsis || data.data?.synopsis || '');
      else setSynopsisResult(`Error: ${data.message || data.error || 'Failed to generate'}`);
    } catch {
      setSynopsisResult('Error: Network request failed');
    } finally {
      setSynopsisLoading(false);
    }
  }, [state]);

  // --- Comp Titles ---
  const [compTitles, setCompTitles] = useState<Array<{ title: string; author: string; year: number; rationale: string }>>([]);
  const [compLoading, setCompLoading] = useState(false);

  const findCompTitles = useCallback(async () => {
    setCompLoading(true);
    try {
      const res = await fetch('/api/publishing/comp-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || '',
          tones: '',
          themes: '',
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setCompTitles(data.compTitles || data.data?.compTitles || []);
      else setCompTitles([]);
    } catch {
      setCompTitles([]);
    } finally {
      setCompLoading(false);
    }
  }, [state]);

  // --- Submission Tracker ---
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Submission | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState<Omit<Submission, 'id'>>({ agentName: '', agency: '', dateSent: new Date().toISOString().slice(0, 10), status: 'queried', notes: '' });

  useEffect(() => { setSubmissions(loadSubmissions()); }, []);
  useEffect(() => { if (submissions.length > 0 || loadSubmissions().length > 0) saveSubmissions(submissions); }, [submissions]);

  const addSubmission = () => {
    if (!newRow.agentName) return;
    setSubmissions(prev => [...prev, { ...newRow, id: crypto.randomUUID() }]);
    setNewRow({ agentName: '', agency: '', dateSent: new Date().toISOString().slice(0, 10), status: 'queried', notes: '' });
    setShowAddRow(false);
  };

  const deleteSubmission = (id: string) => setSubmissions(prev => prev.filter(s => s.id !== id));

  const startEdit = (sub: Submission) => { setEditingId(sub.id); setEditDraft({ ...sub }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const saveEdit = () => {
    if (!editDraft) return;
    setSubmissions(prev => prev.map(s => s.id === editDraft.id ? editDraft : s));
    setEditingId(null);
    setEditDraft(null);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'kdp', label: 'KDP Export', icon: <BookOpen size={16} /> },
    { key: 'query', label: 'Query Letter', icon: <FileText size={16} /> },
    { key: 'synopsis', label: 'Synopsis', icon: <Send size={16} /> },
    { key: 'comp', label: 'Comp Titles', icon: <Search size={16} /> },
    { key: 'tracker', label: 'Submissions', icon: <Table2 size={16} /> },
  ];

  const statusColors: Record<string, string> = {
    queried: 'text-brass-400',
    requested: 'text-blue-400',
    rejected: 'text-red-400',
    accepted: 'text-green-400',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <CarvedHeader title="Publishing Pipeline" subtitle="Prepare your manuscript for submission" />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-brass-500/20 text-brass-300 border border-brass-500/40'
                : 'text-cream-300/60 hover:bg-mahogany-800/50 hover:text-cream-100 border border-transparent'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* KDP Export Tab */}
      {tab === 'kdp' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">KDP Formatting Preview</h3>
          <pre className="whitespace-pre-wrap text-sm text-cream-300/80 font-mono bg-mahogany-900/50 p-4 rounded-lg border border-mahogany-700/30 leading-relaxed">
            {kdpPreview}
          </pre>
          <div className="mt-4">
            <BrassButton disabled>
              <BookOpen size={16} className="mr-2" />
              Export as .docx (Coming Soon)
            </BrassButton>
          </div>
        </ParchmentCard>
      )}

      {/* Query Letter Tab */}
      {tab === 'query' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">AI Query Letter Generator</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <ParchmentInput
              label="Target Agent"
              placeholder="Agent name"
              value={queryForm.agentName}
              onChange={e => setQueryForm(f => ({ ...f, agentName: e.target.value }))}
            />
            <ParchmentInput
              label="Agency"
              placeholder="Agency name"
              value={queryForm.agencyName}
              onChange={e => setQueryForm(f => ({ ...f, agencyName: e.target.value }))}
            />
            <ParchmentInput
              label="Genre Preferences"
              placeholder="e.g. Literary Fiction"
              value={queryForm.genrePrefs}
              onChange={e => setQueryForm(f => ({ ...f, genrePrefs: e.target.value }))}
            />
          </div>
          <BrassButton onClick={generateQueryLetter} disabled={queryLoading}>
            <FileText size={16} className="mr-2" />
            {queryLoading ? 'Generating...' : 'Generate Query Letter'}
          </BrassButton>
          {queryLetter && (
            <div className="mt-4">
              <ParchmentTextarea
                label="Generated Query Letter (editable)"
                value={queryLetter}
                onChange={e => setQueryLetter(e.target.value)}
                rows={16}
              />
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Synopsis Tab */}
      {tab === 'synopsis' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">Synopsis Generator</h3>
          <div className="flex gap-3 mb-4">
            <BrassButton onClick={() => generateSynopsis('1-page')} disabled={synopsisLoading}>
              <FileText size={16} className="mr-2" />
              {synopsisLoading ? 'Generating...' : 'Generate 1-Page Synopsis'}
            </BrassButton>
            <BrassButton onClick={() => generateSynopsis('5-page')} disabled={synopsisLoading}>
              <FileText size={16} className="mr-2" />
              {synopsisLoading ? 'Generating...' : 'Generate 5-Page Synopsis'}
            </BrassButton>
          </div>
          {synopsisResult && (
            <div className="mt-2">
              <ParchmentTextarea
                label="Generated Synopsis (editable)"
                value={synopsisResult}
                onChange={e => setSynopsisResult(e.target.value)}
                rows={20}
              />
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Comp Titles Tab */}
      {tab === 'comp' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">Comparable Titles</h3>
          <BrassButton onClick={findCompTitles} disabled={compLoading}>
            <Search size={16} className="mr-2" />
            {compLoading ? 'Searching...' : 'Find Comparable Titles'}
          </BrassButton>
          {compTitles.length > 0 && (
            <div className="mt-4 space-y-4">
              {compTitles.map((ct, i) => (
                <div key={i} className="p-4 bg-mahogany-900/50 rounded-lg border border-mahogany-700/30">
                  <h4 className="font-serif text-cream-100 font-semibold">
                    {ct.title} <span className="text-brass-400 font-normal">by {ct.author}</span>
                    {ct.year > 0 && <span className="text-cream-300/50 text-sm ml-2">({ct.year})</span>}
                  </h4>
                  <p className="text-cream-300/70 text-sm mt-2">{ct.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Submission Tracker Tab */}
      {tab === 'tracker' && (
        <ParchmentCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg text-cream-100">Submission Tracker</h3>
            <BrassButton onClick={() => setShowAddRow(true)}>
              <Plus size={16} className="mr-2" />
              Add Submission
            </BrassButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mahogany-700/40 text-cream-300/60 text-left">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Agency</th>
                  <th className="py-2 pr-3">Date Sent</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {showAddRow && (
                  <tr className="border-b border-mahogany-700/20">
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.agentName} onChange={e => setNewRow(r => ({ ...r, agentName: e.target.value }))} placeholder="Agent name" /></td>
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.agency} onChange={e => setNewRow(r => ({ ...r, agency: e.target.value }))} placeholder="Agency" /></td>
                    <td className="py-2 pr-2"><input type="date" className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.dateSent} onChange={e => setNewRow(r => ({ ...r, dateSent: e.target.value }))} /></td>
                    <td className="py-2 pr-2">
                      <select className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.status} onChange={e => setNewRow(r => ({ ...r, status: e.target.value as Submission['status'] }))}>
                        <option value="queried">Queried</option>
                        <option value="requested">Requested</option>
                        <option value="rejected">Rejected</option>
                        <option value="accepted">Accepted</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.notes} onChange={e => setNewRow(r => ({ ...r, notes: e.target.value }))} placeholder="Notes" /></td>
                    <td className="py-2 flex gap-1">
                      <button onClick={addSubmission} className="text-green-400 hover:text-green-300 p-1"><Check size={16} /></button>
                      <button onClick={() => setShowAddRow(false)} className="text-red-400 hover:text-red-300 p-1"><X size={16} /></button>
                    </td>
                  </tr>
                )}
                {submissions.map(sub => (
                  <tr key={sub.id} className="border-b border-mahogany-700/20">
                    {editingId === sub.id && editDraft ? (
                      <>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.agentName} onChange={e => setEditDraft(d => d ? { ...d, agentName: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.agency} onChange={e => setEditDraft(d => d ? { ...d, agency: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2"><input type="date" className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.dateSent} onChange={e => setEditDraft(d => d ? { ...d, dateSent: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2">
                          <select className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.status} onChange={e => setEditDraft(d => d ? { ...d, status: e.target.value as Submission['status'] } : d)}>
                            <option value="queried">Queried</option>
                            <option value="requested">Requested</option>
                            <option value="rejected">Rejected</option>
                            <option value="accepted">Accepted</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.notes} onChange={e => setEditDraft(d => d ? { ...d, notes: e.target.value } : d)} /></td>
                        <td className="py-2 flex gap-1">
                          <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1"><Check size={16} /></button>
                          <button onClick={cancelEdit} className="text-red-400 hover:text-red-300 p-1"><X size={16} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 text-cream-100">{sub.agentName}</td>
                        <td className="py-2 pr-3 text-cream-300/70">{sub.agency}</td>
                        <td className="py-2 pr-3 text-cream-300/70">{sub.dateSent}</td>
                        <td className={`py-2 pr-3 capitalize font-medium ${statusColors[sub.status] || 'text-cream-300'}`}>{sub.status}</td>
                        <td className="py-2 pr-3 text-cream-300/60 max-w-[200px] truncate">{sub.notes}</td>
                        <td className="py-2 flex gap-1">
                          <button onClick={() => startEdit(sub)} className="text-brass-400 hover:text-brass-300 p-1"><Edit3 size={16} /></button>
                          <button onClick={() => deleteSubmission(sub.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {submissions.length === 0 && !showAddRow && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-cream-300/40">
                      No submissions tracked yet. Click &quot;Add Submission&quot; to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ParchmentCard>
      )}
    </div>
  );
}
