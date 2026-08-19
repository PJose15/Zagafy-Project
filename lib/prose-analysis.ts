export type IssueSeverity = 'low' | 'medium' | 'high';
export type IssueCategory = 'awkward-phrase' | 'pacing' | 'dialogue' | 'repetition' | 'passive-voice';

export interface ProseIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  suggestion: string;
  startIndex: number;
  endIndex: number;
  text: string;
}

const WEAK_PHRASES = [
  'there was', 'there were', 'there is', 'there are',
  'started to', 'began to', 'proceeded to',
  'in order to', 'due to the fact',
];

const OVERUSED_WORDS = ['very', 'really', 'just', 'quite', 'rather', 'somewhat', 'basically', 'literally'];

const PASSIVE_PATTERN = /\b(was|were|been|being|is|are)\s+([\w]+ed|[\w]+en|[\w]+t)\b/gi;

export function analyzeText(text: string): ProseIssue[] {
  if (!text.trim()) return [];
  const issues: ProseIssue[] = [];

  // Lowercase the text once and reuse it, instead of re-lowercasing the entire
  // chapter on every phrase and every occurrence (was O(phrases·occurrences·len)).
  const lower = text.toLowerCase();

  // Awkward phrases
  for (const phrase of WEAK_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      issues.push({
        category: 'awkward-phrase',
        severity: 'low',
        message: `"${phrase}" weakens the prose.`,
        suggestion: `Rephrase to be more direct.`,
        startIndex: idx,
        endIndex: idx + phrase.length,
        text: text.slice(idx, idx + phrase.length),
      });
      idx = lower.indexOf(phrase, idx + 1);
    }
  }

  // Overused words (3+ times within 500 chars)
  for (const word of OVERUSED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = [...text.matchAll(regex)];
    if (matches.length >= 3) {
      // Report on 3rd+ occurrence
      for (let i = 2; i < matches.length; i++) {
        const m = matches[i];
        issues.push({
          category: 'repetition',
          severity: 'medium',
          message: `"${word}" used ${matches.length} times — consider varying.`,
          suggestion: `Remove or replace this "${word}".`,
          startIndex: m.index!,
          endIndex: m.index! + word.length,
          text: word,
        });
      }
    }
  }

  // Pacing: paragraphs >200 words = dense
  const paragraphs = text.split(/\n\s*\n/);
  let offset = 0;
  let consecutiveShort = 0;
  for (const para of paragraphs) {
    const wc = para.trim().split(/\s+/).filter(Boolean).length;
    if (wc > 200) {
      issues.push({
        category: 'pacing',
        severity: 'medium',
        message: `Paragraph is ${wc} words — may feel dense.`,
        suggestion: 'Consider breaking into shorter paragraphs.',
        startIndex: offset,
        endIndex: offset + para.length,
        text: para.slice(0, 60) + '...',
      });
    }
    if (wc > 0 && wc < 15) {
      consecutiveShort++;
      if (consecutiveShort >= 3) {
        issues.push({
          category: 'pacing',
          severity: 'low',
          message: '3+ consecutive short paragraphs — may feel choppy.',
          suggestion: 'Consider combining some for better rhythm.',
          startIndex: offset,
          endIndex: offset + para.length,
          text: para.slice(0, 60),
        });
        consecutiveShort = 0;
      }
    } else {
      consecutiveShort = 0;
    }
    offset += para.length + 2; // +2 for \n\n
  }

  // Passive voice
  let match;
  const passiveRegex = new RegExp(PASSIVE_PATTERN.source, 'gi');
  while ((match = passiveRegex.exec(text)) !== null) {
    issues.push({
      category: 'passive-voice',
      severity: 'low',
      message: `Passive voice: "${match[0]}"`,
      suggestion: 'Consider using active voice.',
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      text: match[0],
    });
  }

  // Dialogue: "said" repetition (4+ in text)
  const saidMatches = [...text.matchAll(/\bsaid\b/gi)];
  if (saidMatches.length >= 4) {
    for (let i = 3; i < saidMatches.length; i++) {
      const m = saidMatches[i];
      issues.push({
        category: 'dialogue',
        severity: 'low',
        message: `"said" used ${saidMatches.length} times — consider dialogue variety.`,
        suggestion: 'Use action beats or vary dialogue tags.',
        startIndex: m.index!,
        endIndex: m.index! + 4,
        text: 'said',
      });
    }
  }

  // Sort by position
  issues.sort((a, b) => a.startIndex - b.startIndex);
  return issues;
}
