import { useState, useEffect, useRef } from 'react';

export const useSpeechTracker = () => {
  const [transcript, setTranscript] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const startTimeRef = useRef(null);
  const totalSpeakingTimeRef = useRef(0);
  const isIntentionalStopRef = useRef(false);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalStr = '';
      let interimStr = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalStr += text + ' ';
        } else {
          interimStr += text;
        }
      }
      
      if (finalStr.trim()) {
        setTranscript(prev => [...prev, {
          text: finalStr.trim(),
          timestamp: new Date().toISOString()
        }]);
      }
      setInterimTranscript(interimStr);
    };

    recognition.onstart = () => {
      setIsListening(true);
      startTimeRef.current = Date.now();
      isIntentionalStopRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);
      if (startTimeRef.current) {
        totalSpeakingTimeRef.current += (Date.now() - startTimeRef.current) / 1000;
        startTimeRef.current = null;
      }
      
      // Auto-restart if we want continuous listening
      if (recognitionRef.current && !isIntentionalStopRef.current) {
         // Add a small delay to prevent tight network error loops
         setTimeout(() => {
           try { recognitionRef.current?.start(); } catch(e){}
         }, 1000);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'network') {
        console.warn('Speech recognition network error (likely hit API quota or flaky connection). Will retry briefly.');
      } else {
        console.warn('Speech recognition error:', event.error);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        isIntentionalStopRef.current = true;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      isIntentionalStopRef.current = false;
      try {
         recognitionRef.current.start();
      } catch(e) {}
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      isIntentionalStopRef.current = true;
      recognitionRef.current.stop();
    }
  };

  return {
    transcript,
    interimTranscript,
    isListening,
    startListening,
    stopListening,
    getTotalSpeakingTime: () => totalSpeakingTimeRef.current
  };
};
