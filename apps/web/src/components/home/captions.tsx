'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '@/components/providers/app-provider';

/** Word-by-word reveal paced roughly to speech, so reading and listening stay together. */
export function RevealText({ text, className }: { text: string; className?: string }) {
  const { reducedMotion } = useApp();
  if (reducedMotion) return <p className={className}>{text}</p>;
  const words = text.split(/(\s+)/);
  let index = 0;
  return (
    <p className={className}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        const delay = Math.min(index++ * 0.045, 4);
        return (
          <motion.span
            key={`${i}-${w}`}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.35, delay }}
            className="inline-block"
          >
            {w}
          </motion.span>
        );
      })}
    </p>
  );
}

export function Captions({
  userText,
  assistantText,
  assistantKey,
  thinking,
}: {
  userText: string | null;
  assistantText: string | null;
  assistantKey: string;
  thinking: boolean;
}) {
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center" aria-live="polite" aria-atomic="false">
      <AnimatePresence mode="popLayout">
        {userText && (
          <motion.p
            key={`u-${userText}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-lg text-[calc(1.05rem*var(--text-scale))] leading-snug text-[var(--ink-soft)]"
          >
            <span className="sr-only">You said: </span>“{userText}”
          </motion.p>
        )}
      </AnimatePresence>
      {thinking && (
        <div className="flex h-8 items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full bg-[var(--sage)]"
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </div>
      )}
      {assistantText && !thinking && (
        <div key={assistantKey}>
          <span className="sr-only">Sanjeevani says: </span>
          <RevealText
            text={assistantText}
            className="text-[calc(1.3rem*var(--text-scale))] leading-[1.45] font-medium text-balance text-[var(--ink)] sm:text-[calc(1.45rem*var(--text-scale))]"
          />
        </div>
      )}
    </div>
  );
}
