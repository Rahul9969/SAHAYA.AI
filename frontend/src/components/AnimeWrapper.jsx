import React, { useEffect, useRef } from 'react';
import anime from '../lib/anime.js';

/**
 * Fun, interactive wrapper using anime.js
 * Automatically staggers its children with a springy bounce on mount
 */
export default function AnimeWrapper({ children, className = '', staggerDelay = 100 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const elements = containerRef.current.children;
    
    // Set initial state
    anime.set(elements, {
      translateY: 40,
      opacity: 0,
      scale: 0.95
    });

    // Fun spring animation
    anime({
      targets: elements,
      translateY: 0,
      opacity: 1,
      scale: 1,
      delay: anime.stagger(staggerDelay),
      easing: 'easeOutElastic(1, .8)',
      duration: 800
    });
  }, [staggerDelay]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
