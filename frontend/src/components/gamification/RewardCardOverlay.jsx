import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Star, Zap } from 'lucide-react';

export default function RewardCardOverlay({ quest, onClose, onCollect }) {
  const [flipped, setFlipped] = useState(false);
  const [collected, setCollected] = useState(false);

  const xp = quest?.xp_reward || 0;

  let rarity = 'bronze';
  let gradient = 'linear-gradient(135deg, #cd7f32 0%, #8b5a2b 100%)';
  let emoji = '🥉';
  let ringColor = 'rgba(205, 127, 50, 0.5)';

  if (xp >= 30) {
    rarity = 'gold';
    gradient = 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)';
    emoji = '🏆✨';
    ringColor = 'rgba(255, 215, 0, 0.6)';
  } else if (xp >= 20) {
    rarity = 'silver';
    gradient = 'linear-gradient(135deg, #E0E0E0 0%, #9E9E9E 100%)';
    emoji = '🥈';
    ringColor = 'rgba(224, 224, 224, 0.5)';
  }

  const handleFlip = () => {
    if (!flipped) {
      setFlipped(true);
    }
  };

  const handleCollect = () => {
    setCollected(true);
    setTimeout(() => {
      onCollect();
    }, 400); // Wait for shrink animation before unmounting
  };

  return (
    <AnimatePresence>
      {!collected && (
        <motion.div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop Blur */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={flipped ? handleCollect : handleFlip} />

          {/* Interactive Card */}
          <motion.div
            className="relative cursor-pointer perspective-1000 z-10"
            initial={{ scale: 0.1, y: 300, rotateY: 0 }}
            animate={{ scale: 1, y: 0, rotateY: flipped ? 180 : 0 }}
            exit={{ scale: 0, y: -200, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20, mass: 1 }}
            onClick={flipped ? null : handleFlip}
            style={{ width: '280px', height: '400px', transformStyle: 'preserve-3d' }}
          >
            {/* Front of Card (Mystery) */}
            <motion.div
              className="absolute inset-0 w-full h-full rounded-[24px] shadow-2xl flex flex-col items-center justify-center border-[4px] border-white/20 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
                backfaceVisibility: 'hidden',
              }}
            >
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.05, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 opacity-20"
                style={{
                  background: 'repeating-conic-gradient(from 0deg, transparent 0deg 30deg, rgba(255,255,255,0.2) 30deg 60deg)'
                }}
              />
              <Star size={64} className="text-[#FFFF66] drop-shadow-[0_0_15px_rgba(255,255,102,0.8)] mb-4" />
              <h2 className="font-display font-extrabold text-white text-2xl tracking-widest uppercase">Tap To<br/>Reveal</h2>
            </motion.div>

            {/* Back of Card (Reward) */}
            <motion.div
              className="absolute inset-0 w-full h-full rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center border-[4px] overflow-hidden"
              style={{
                background: gradient,
                borderColor: 'rgba(255,255,255,0.4)',
                transform: 'rotateY(180deg)',
                backfaceVisibility: 'hidden',
                boxShadow: `0 0 60px ${ringColor}`
              }}
            >
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 w-[200%] h-[200%] bg-gradient-to-tr from-transparent via-white/40 to-transparent skew-x-12"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              />

              <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10 px-2 py-1 bg-black/20 rounded-full border border-white/20 backdrop-blur-md">
                   <span className="text-white text-xs font-bold uppercase tracking-wider">{rarity} Reward</span>
                   <Sparkles size={14} className="text-white" />
              </div>

              <div className="flex flex-col items-center justify-center z-10 mt-6">
                <span className="text-[72px] drop-shadow-xl">{emoji}</span>
                <h3 className="font-display font-black text-white text-[56px] leading-tight drop-shadow-md mt-2 flex items-center gap-2">
                  +{xp} <span className="text-[24px] text-white/90">XP</span>
                </h3>
                <p className="text-white/90 font-bold text-center px-6 mt-2 tracking-wide drop-shadow-sm">
                  {quest?.title || 'Quest Completed!'}
                </p>
              </div>

              <div className="absolute bottom-6 w-full px-8 z-10">
                <button
                  onClick={handleCollect}
                  className="w-full py-4 rounded-[12px] bg-white text-black font-extrabold text-lg uppercase tracking-widest shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-transform"
                >
                  Collect
                </button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
