'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Check, CornerDownRight, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/antiquarian';
import type { ManuscriptComment } from '@/lib/types/comment';

interface CommentCardProps {
  comment: ManuscriptComment;
  onResolveToggle: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onEdit: (id: string, text: string) => void;
}

const QUOTE_TRUNCATE = 80;

export function CommentCard({ comment, onResolveToggle, onDelete, onReply, onEdit }: CommentCardProps) {
  const t = useTranslations('comments');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { confirm } = useConfirm();
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  const handleEditSave = () => {
    const text = editText.trim();
    if (!text) return;
    onEdit(comment.id, text);
    setEditing(false);
  };

  const quoteExcerpt =
    comment.quote.length > QUOTE_TRUNCATE
      ? `${comment.quote.slice(0, QUOTE_TRUNCATE)}…`
      : comment.quote;

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t('deleteTitle'),
      message: t('deleteMessage'),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    onDelete(comment.id);
  };

  const handleReplySubmit = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply(comment.id, text);
    setReplyText('');
  };

  return (
    <div
      className={`rounded-lg border border-sepia-300/40 bg-parchment-50 p-3 space-y-2 ${
        comment.resolved ? 'opacity-70' : ''
      }`}
    >
      <blockquote className="border-l-2 border-brass-500 pl-2 text-xs italic text-sepia-600 font-serif">
        {quoteExcerpt}
      </blockquote>

      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            aria-label={t('editAria')}
            className="w-full bg-parchment-100 border border-sepia-300/40 rounded px-2 py-1 text-sm text-sepia-800 focus:outline-none focus:border-brass-500 resize-none"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setEditing(false); setEditText(comment.text); }}
              className="text-xs text-sepia-600 hover:text-sepia-800 transition-colors"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              disabled={!editText.trim()}
              className="text-xs text-brass-700 hover:text-brass-800 disabled:opacity-40 transition-colors"
            >
              {tCommon('save')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-sepia-800 whitespace-pre-wrap">{comment.text}</p>
      )}

      <div className="flex items-center justify-between text-xs text-sepia-600">
        <span className="font-mono">{new Date(comment.createdAt).toLocaleDateString(locale)}</span>
        <div className="flex items-center gap-1">
          {!comment.resolved && !editing && (
            <button
              type="button"
              onClick={() => { setEditText(comment.text); setEditing(true); }}
              className="p-1 rounded text-sepia-600 hover:text-brass-700 hover:bg-parchment-200/60 transition-colors"
              aria-label={t('editAria')}
              title={t('editAria')}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onResolveToggle(comment.id, !comment.resolved)}
            className="p-1 rounded text-sepia-600 hover:text-forest-600 hover:bg-parchment-200/60 transition-colors"
            aria-label={comment.resolved ? t('unresolve') : t('resolve')}
            title={comment.resolved ? t('unresolve') : t('resolve')}
          >
            {comment.resolved ? <RotateCcw size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 rounded text-sepia-600 hover:text-wax-500 hover:bg-parchment-200/60 transition-colors"
            aria-label={t('deleteAria')}
            title={t('deleteAria')}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {comment.replies.length > 0 && (
        <ul className="space-y-1.5 pl-3 border-l border-sepia-300/40">
          {comment.replies.map((reply) => (
            <li key={reply.id} className="text-xs text-sepia-800">
              <p className="whitespace-pre-wrap">{reply.text}</p>
              <span className="text-sepia-600 font-mono">
                {new Date(reply.createdAt).toLocaleDateString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!comment.resolved && (
        <div className="flex items-center gap-1.5">
          <CornerDownRight size={12} className="text-sepia-600 shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleReplySubmit();
              }
            }}
            placeholder={t('replyPlaceholder')}
            aria-label={t('replyAria')}
            className="flex-1 min-w-0 bg-parchment-100 border border-sepia-300/40 rounded px-2 py-1 text-xs text-sepia-800 placeholder:text-sepia-600 focus:outline-none focus:border-brass-500"
          />
          <button
            type="button"
            onClick={handleReplySubmit}
            disabled={!replyText.trim()}
            className="text-xs text-brass-700 hover:text-brass-800 disabled:opacity-40 transition-colors"
          >
            {t('reply')}
          </button>
        </div>
      )}
    </div>
  );
}
