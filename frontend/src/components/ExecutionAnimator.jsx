import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ExecutionAnimator({ trace, code }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playSpeed, setPlaySpeed] = useState(1000); // ms per step
    const [muted, setMuted] = useState(true); // AI voice starts muted by default
    const codeRef = useRef(null);
    const intervalRef = useRef(null);

    const codeLines = code.split('\n');
    const step = trace?.steps?.[currentStep];

    // Auto-play logic
    useEffect(() => {
        if (isPlaying) {
            intervalRef.current = setInterval(() => {
                setCurrentStep(prev => {
                    if (prev >= trace.steps.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, playSpeed);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isPlaying, playSpeed, trace?.steps?.length]);

    // Scroll to current line
    useEffect(() => {
        if (codeRef.current && step) {
            const container = codeRef.current.parentElement;
            const lineElement = codeRef.current.querySelector('[data-line="' + step.line + '"]');
            if (container && lineElement) {
                container.scrollTo({
                    top: lineElement.offsetTop - container.clientHeight / 2 + 10,
                    behavior: 'smooth'
                });
            }
        }
    }, [step]);

    // AI Voice Synthesis
    useEffect(() => {
        if (!step || muted) return;
        if (typeof window === 'undefined' || !window.speechSynthesis) return;

        const synth = window.speechSynthesis;
        synth.cancel(); // Cancel any ongoing speech immediately

        let speechText = step.description || '';
        const actualCode = codeLines[step.line - 1]?.trim();
        
        // Read the actual code line for much better context instead of generic "Call statement"
        if (actualCode && actualCode.length > 1 && !speechText.toLowerCase().includes('error')) {
             speechText = actualCode
                .replace(/==/g, ' equals ')
                .replace(/<=/g, ' less than or equal to ')
                .replace(/>=/g, ' greater than or equal to ')
                .replace(/!=/g, ' not equal to ')
                .replace(/\/\//g, ' integer division ')
                .replace(/=/g, ' equals ');
        }

        const utterance = new SpeechSynthesisUtterance(String(speechText).slice(0, 500));
        utterance.rate = 1.1; // Slightly faster for tracing
        synth.speak(utterance);

        return () => {
            synth.cancel();
        };
    }, [currentStep, muted, step, codeLines]);

    const handlePlayPause = () => {
        if (!isPlaying && currentStep >= trace.steps.length - 1) {
            // Replay from beginning
            setCurrentStep(0);
            setIsPlaying(true);
        } else {
            setIsPlaying(!isPlaying);
        }
    };

    const handleStepForward = () => {
        if (trace?.steps?.length && currentStep < trace.steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleStepBackward = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleReset = () => {
        setCurrentStep(0);
        setIsPlaying(false);
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'call': return 'text-cyan-400';
            case 'return': return 'text-green-400';
            case 'assign': return 'text-yellow-400';
            case 'condition': return 'text-purple-400';
            case 'loop': return 'text-orange-400';
            default: return 'text-neutral-400';
        }
    };

    const getActionIcon = (action) => {
        switch (action) {
            case 'call': return '→';
            case 'return': return '←';
            case 'assign': return '=';
            case 'condition': return '?';
            case 'loop': return '↻';
            default: return '•';
        }
    };

    if (!trace?.steps?.length) {
        return (
            <div className="h-full min-h-[300px] flex items-center justify-center text-white/50">
                <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>No execution trace yet or invalid trace.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[650px] flex flex-col rounded-xl overflow-hidden border border-gray-700 bg-gray-900 shadow-2xl">
            {/* Controls */}
            <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        title="Reset"
                    >
                        <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>

                    <button
                        onClick={handleStepBackward}
                        disabled={currentStep === 0}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30"
                        title="Previous Step"
                    >
                        <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <button
                        onClick={handlePlayPause}
                        className="p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 transition-colors"
                        title={isPlaying ? 'Pause' : (!isPlaying && currentStep >= trace.steps.length - 1 ? 'Replay' : 'Play')}
                    >
                        {isPlaying ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : (!isPlaying && currentStep >= trace.steps.length - 1) ? (
                            <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>

                    <button
                        onClick={handleStepForward}
                        disabled={currentStep === trace.steps.length - 1}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30"
                        title="Next Step"
                    >
                        <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {/* Voice control */}
                    <button
                        onClick={() => setMuted(!muted)}
                        className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1.5 text-xs text-gray-300"
                        title={muted ? 'Enable Voice' : 'Disable Voice'}
                    >
                        {muted ? (
                           <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                           </svg>
                        ) : (
                           <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                           </svg>
                        )}
                        <span>{muted ? 'Muted' : 'Voice'}</span>
                    </button>

                    {/* Speed control */}
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">Speed:</span>
                        <select
                            value={playSpeed}
                            onChange={(e) => setPlaySpeed(Number(e.target.value))}
                            className="px-2 py-1 rounded bg-gray-900 border border-gray-700 text-gray-100 outline-none"
                        >
                            <option value={2000}>0.5x</option>
                            <option value={1000}>1x</option>
                            <option value={500}>2x</option>
                            <option value={250}>4x</option>
                        </select>
                    </div>

                    {/* Step counter */}
                    <div className="text-xs font-mono">
                        <span className="text-cyan-400">{currentStep + 1}</span>
                        <span className="text-white/40"> / {trace.steps.length}</span>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0 bg-gray-900">
                {/* Code with highlighting */}
                <div className="w-1/2 overflow-auto border-r border-white/10 relative">
                    <pre ref={codeRef} className="p-4 text-[13px] font-mono leading-relaxed absolute top-0 left-0 right-0 min-h-full">
                        {codeLines.map((line, i) => {
                            const lineNum = i + 1;
                            const isActive = step?.line === lineNum;

                            return (
                                <div
                                    key={i}
                                    data-line={lineNum}
                                    className={'flex transition-all duration-200 ' + (isActive
                                        ? 'bg-cyan-500/20 border-l-[3px] border-cyan-400 font-bold'
                                        : 'border-l-[3px] border-transparent font-medium')}
                                >
                                    <span className="w-8 text-right pr-3 text-gray-500 select-none text-[11px] pt-[2px]">
                                        {lineNum}
                                    </span>
                                    <span className={isActive ? 'text-white' : 'text-gray-300'}>
                                        {line || ' '}
                                    </span>
                                </div>
                            );
                        })}
                    </pre>
                </div>

                {/* Right panel - Step info */}
                <div className="w-1/2 flex flex-col overflow-auto bg-gray-800 text-gray-100">
                    {/* Current step info (Fixed height to prevent jumping) */}
                    <div className="h-[88px] relative border-b border-gray-700 shrink-0 bg-gray-800/80">
                        <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                                className="absolute inset-0 p-4"
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className={'text-base ' + getActionColor(step?.action || '')}>
                                        {getActionIcon(step?.action || '')}
                                    </span>
                                    <span className="font-semibold capitalize text-sm text-gray-100">{step?.action}</span>
                                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded ml-auto">
                                        Line {step?.line}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-300 line-clamp-2">{step?.description}</p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Variables */}
                    <div className="p-4 border-b border-gray-700 shrink-0">
                        <h4 className="font-semibold text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            Variables
                        </h4>
                        <div className="space-y-1.5 min-h-[40px]">
                            {step?.variables && Object.entries(step.variables).length > 0 ? (
                                Object.entries(step.variables).map(([name, value]) => (
                                    <div key={name} className="flex items-center gap-2 font-mono text-[13px]">
                                        <span className="text-cyan-300 font-semibold">{name}</span>
                                        <span className="text-gray-500">=</span>
                                        <span className="text-amber-300">{JSON.stringify(value)}</span>
                                    </div>
                                ))
                            ) : (
                                <span className="text-gray-500 text-xs italic">No initialized variables</span>
                            )}
                        </div>
                    </div>

                    {/* Call Stack */}
                    <div className="p-4 border-b border-gray-700 shrink-0">
                        <h4 className="font-semibold text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            Call Stack
                        </h4>
                        <div className="space-y-1.5 min-h-[40px]">
                            {step?.callStack?.length ? (
                                step.callStack.map((fn, i) => (
                                    <div
                                        key={i}
                                        className={'px-2.5 py-1 rounded text-[13px] font-mono ' + (i === step.callStack.length - 1 ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-gray-700 text-gray-300')}
                                    >
                                        {fn}()
                                    </div>
                                ))
                            ) : (
                                <span className="text-gray-500 text-xs italic">Empty stack</span>
                            )}
                        </div>
                    </div>

                    {/* Output */}
                    <div className="p-4 flex-1">
                        <h4 className="font-semibold text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Output
                        </h4>
                        <pre className="p-3 bg-gray-900 rounded-lg text-[13px] font-mono text-emerald-400/90 h-[100px] overflow-auto border border-gray-700">
                            {step?.output || trace.finalOutput || 'No output'}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
