'use client';

import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { User } from 'lucide-react';
import type { CharacterChatMessage } from '@/lib/types/character-chat';

interface ChatMessageBubbleProps {
  message: CharacterChatMessage;
  characterName: string;
}

export function ChatMessageBubble({ message, characterName }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      {...fadeUp}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`flex gap-2 max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-serif font-bold ${
            isUser
              ? 'bg-brass-500/20 text-brass-800'
              : 'bg-forest-700/15 text-forest-700'
          }`}
        >
          {isUser ? <User size={14} /> : characterName.charAt(0).toUpperCase()}
        </div>

        {/* Bubble */}
        <div
          className={`px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
            isUser
              ? 'bg-brass-500/15 text-sepia-900 border border-brass-500/30'
              : 'bg-parchment-200 text-sepia-800 border border-sepia-300/30'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
          <span className="block mt-1 text-[10px] text-sepia-500 font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
