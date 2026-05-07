import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Upload, FileText, ScanLine, Loader2, ImagePlus, RefreshCw, AlertCircle, Menu, X, Key, Cpu, History, BookOpen, Trash2, Languages, Network, Download } from 'lucide-react';
import { MermaidChart } from './components/MermaidChart';
import { analyzeArchitectureMoE, ScanStatus, translateMarkdown, VISION_PROMPT, TEXT_PROMPT, CODER_PROMPT, SYNTHESIS_TEMPLATE, LLMProvider, LLMConfig, MASTER_ARCHITECT_PROMPT } from './lib/gemini';

interface UploadedImage {
  base64: string;
  mimeType: string;
  preview: string;
}

export default function App() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [readme, setReadme] = useState('');
  const [userQuery, setUserQuery] = useState('');
  
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ stage: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [translatedMarkdown, setTranslatedMarkdown] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<'English' | 'Bangla' | 'Spanish' | 'Hindi'>('English');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Menu States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'system_prompt' | 'api_keys' | 'local_ai' | 'system_pipeline' | 'history'>('system_prompt');
  
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(() => (localStorage.getItem('xray_provider') as LLMProvider) || 'Google');
  const [customEndpoint, setCustomEndpoint] = useState(() => localStorage.getItem('xray_endpoint') || '');
  const [customModel, setCustomModel] = useState(() => localStorage.getItem('xray_model') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('xray_api_key') || '');
  
  const llmConfig: LLMConfig = {
    provider: llmProvider,
    apiKey,
    endpoint: customEndpoint,
    model: customModel
  };

  useEffect(() => {
    localStorage.setItem('xray_api_key', apiKey);
    localStorage.setItem('xray_provider', llmProvider);
    localStorage.setItem('xray_endpoint', customEndpoint);
    localStorage.setItem('xray_model', customModel);
  }, [apiKey, llmProvider, customEndpoint, customModel]);

  const handleFile = (files: FileList | File[] | null) => {
    if (!files) return;
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setError('Please upload valid image files (PNG, JPEG, etc).');
      return;
    }
    setError(null);
    
    if (images.length + validFiles.length > 9) {
      setError(`Maximum 9 images allowed. You can only add ${9 - images.length} more.`);
      return;
    }

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, {
          base64,
          mimeType: file.type,
          preview: result
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files);
    }
  };

  const handleScan = async () => {
    if (images.length === 0 || !readme.trim()) {
      setError('Both folder structure screenshots and README text are required.');
      return;
    }
    
    setError(null);
    setScanStatus({ stage: 'routing' });
    try {
      const generator = analyzeArchitectureMoE(images, readme, userQuery, llmConfig);
      for await (const status of generator) {
        setScanStatus(status);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during analysis. Check API Key or Quote limit.');
      setScanStatus({ stage: 'idle' });
    }
  };

  const reset = () => {
    setImages([]);
    setReadme('');
    setUserQuery('');
    setScanStatus({ stage: 'idle' });
    setError(null);
    setTranslatedMarkdown(null);
    setTargetLanguage('English');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleCopy = () => {
    const textToCopy = translatedMarkdown || scanStatus.resultMarkdown || scanStatus.textStream || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
  };

  const speakText = () => {
    if (isTranslating) return;

    const textToSpeak = translatedMarkdown || scanStatus.resultMarkdown || scanStatus.textStream || '';
    const cleanText = textToSpeak.replace(/[*_#`]/g, '').replace(/```mermaid[\s\S]*?```/g, '');

    if (window.speechSynthesis.speaking) {
      if (isPaused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = targetLanguage === 'Bangla' ? 'bn-BD' : targetLanguage === 'Spanish' ? 'es-ES' : targetLanguage === 'Hindi' ? 'hi-IN' : 'en-US';
    
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setIsPaused(false);
  };

  const cycleLanguage = async () => {
    const langs = ['English', 'Bangla', 'Spanish', 'Hindi'] as const;
    const currentIndex = langs.indexOf(targetLanguage);
    const nextLang = langs[(currentIndex + 1) % langs.length];
    
    setTargetLanguage(nextLang);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);

    const baseText = scanStatus.resultMarkdown || scanStatus.textStream;
    if (!baseText) return;

    if (nextLang === 'English') {
      setTranslatedMarkdown(null);
    } else {
      setIsTranslating(true);
      try {
        const result = await translateMarkdown(baseText, nextLang, llmConfig);
        setTranslatedMarkdown(result);
      } catch (err) {
        console.error("Translation Error:", err);
      } finally {
        setIsTranslating(false);
      }
    }
  };

  const isScanning = scanStatus.stage === 'routing' || scanStatus.stage === 'analyzing';
  const hasResult = scanStatus.stage === 'synthesis' || scanStatus.stage === 'complete';
  const displayResult = translatedMarkdown || scanStatus.resultMarkdown || scanStatus.textStream;

  return (
    <div className="min-h-screen flex flex-col font-sans bg-stone-950 text-stone-300">
      {/* Header */}
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
            <ScanLine className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">X-Ray Scanner</h1>
            <p className="text-xs text-stone-500 font-mono mt-1 pt-0.5 uppercase tracking-widest">Architecture Extraction AI</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {hasResult && (
            <button 
              onClick={reset}
              className="flex items-center gap-2 text-sm font-medium text-stone-400 hover:text-white transition-colors border border-stone-800 px-3 py-1.5 rounded-lg hover:bg-stone-800"
            >
              <RefreshCw className="w-4 h-4" />
              New Scan
            </button>
          )}
          <button onClick={() => setIsMenuOpen(true)} className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Left Column: Input */}
        <div className={`space-y-6 flex flex-col ${hasResult ? 'hidden lg:flex lg:opacity-50 lg:pointer-events-none' : ''}`}>
          
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono uppercase tracking-widest text-stone-400 flex items-center gap-2">
                <span className="text-emerald-500">01.</span> Folder Structure ({images.length}/9)
              </h2>
              {images.length > 0 && images.length < 9 && (
                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                  <ImagePlus className="w-3 h-3" /> ADD MORE
                </button>
              )}
            </div>

            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => images.length === 0 && fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-4 flex flex-col
                transition-all min-h-[200px] overflow-hidden group
                ${images.length > 0 ? 'border-stone-700 bg-stone-900/30' : 'border-stone-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 items-center justify-center cursor-pointer'}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                multiple
                onChange={(e) => handleFile(e.target.files)}
              />
              
              {images.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 w-full h-full">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg border border-stone-700 bg-stone-900 overflow-hidden group/img">
                      <img src={img.preview} alt={`upload-${idx}`} className="w-full h-full object-cover" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="bg-stone-900 rounded-full w-16 h-16 flex items-center justify-center mx-auto border border-stone-800 group-hover:border-emerald-500/50 group-hover:text-emerald-400 transition-colors">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-stone-300 font-medium">Click to upload or drag and drop</p>
                    <p className="text-stone-500 text-sm mt-1">Provide up to 9 screenshots</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 flex-1 flex flex-col">
             <h2 className="text-sm font-mono uppercase tracking-widest text-stone-400 flex items-center gap-2">
              <span className="text-emerald-500">02.</span> README Content
            </h2>
            <div className="relative flex-1 min-h-[160px]">
              <textarea
                value={readme}
                onChange={(e) => setReadme(e.target.value)}
                placeholder="Paste the raw README.md content here..."
                className="w-full h-full min-h-[160px] bg-stone-900/50 border border-stone-800 rounded-xl p-4 text-stone-300 font-mono text-sm resize-y focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-stone-600 custom-scrollbar"
              />
              <FileText className="absolute top-4 right-4 w-5 h-5 text-stone-600 pointer-events-none" />
            </div>
          </section>

          <section className="space-y-3">
             <h2 className="text-sm font-mono uppercase tracking-widest text-stone-400 flex items-center gap-2">
              <span className="text-emerald-500">03.</span> Specific User Query (Optional)
            </h2>
            <div className="relative h-24">
              <textarea
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="E.g. Search for specific APIs, hidden flows, or architectural patterns..."
                className="w-full h-full bg-stone-900/50 border border-stone-800 rounded-xl p-4 text-stone-300 font-mono text-sm resize-none focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-stone-600 custom-scrollbar"
              />
            </div>
          </section>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          )}

          <button
            onClick={handleScan}
            disabled={scanStatus.stage !== 'idle' || images.length === 0 || !readme.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-4 rounded-xl shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 active:scale-[0.98]"
          >
            {scanStatus.stage === 'routing' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Vector Selection Layer: Routing...</span>
              </>
            ) : scanStatus.stage === 'analyzing' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Expert Agents Processing...</span>
              </>
            ) : scanStatus.stage === 'synthesis' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Synthesizing Output...</span>
              </>
            ) : (
              <>
                <ScanLine className="w-5 h-5" />
                <span>Extract Blueprint</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output */}
        <div className={`flex flex-col border border-stone-800 bg-stone-900/30 rounded-2xl overflow-hidden ${!hasResult && !isScanning ? 'lg:flex hidden items-center justify-center' : 'h-[calc(100vh-8rem)]'}`}>
           {isScanning ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6">
                 <div className="relative">
                   <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
                   <ScanLine className="w-12 h-12 text-emerald-400 animate-pulse relative" />
                 </div>
                 <div className="space-y-4">
                   <h3 className="text-lg font-medium text-stone-200">
                     {scanStatus.stage === 'routing' ? 'Master Architect Analyzing Vector...' : 'Executing Multi-Agent Processing'}
                   </h3>
                   {scanStatus.routingReasoning && (
                     <div className="bg-stone-900 border border-emerald-900/50 p-4 rounded-xl max-w-md mx-auto text-left shadow-lg">
                       <p className="text-emerald-400 font-mono text-xs mb-2 flex items-center gap-2"><Cpu className="w-3 h-3" /> Master Architect Reasoning:</p>
                       <p className="text-stone-400 text-sm">{scanStatus.routingReasoning}</p>
                     </div>
                   )}
                   {scanStatus.activeAgents && scanStatus.activeAgents.length > 0 && (
                     <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                       {scanStatus.activeAgents.map(agent => (
                         <span key={agent} className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono rounded-full">
                           {agent}
                         </span>
                       ))}
                     </div>
                   )}
                   {!scanStatus.routingReasoning && (
                     <p className="text-stone-500 text-sm max-w-xs mx-auto">Feeding data directly into vector layers...</p>
                   )}
                 </div>
              </div>
           ) : hasResult ? (
             <div className="flex-1 flex flex-col overflow-hidden">
               {/* Result Toolbar */}
               {scanStatus.stage === 'complete' && (
                 <div className="flex flex-wrap items-center justify-end px-4 py-3 bg-stone-900 border-b border-stone-800 gap-2 shrink-0">
                   <button 
                     onClick={handleCopy} 
                     className="px-3 py-2 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors cursor-pointer text-lg" 
                     title="Copy Text"
                   >
                     📋
                   </button>
                   <button 
                     onClick={speakText} 
                     className="px-3 py-2 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors cursor-pointer text-lg flex items-center justify-center min-w-[3rem]" 
                     title={isSpeaking ? (isPaused ? "Resume Speaking" : "Pause Speaking") : "Speak Text"}
                   >
                     {isSpeaking && !isPaused ? '🔕' : '🔊'}
                   </button>
                   <button 
                     onClick={cycleLanguage} 
                     disabled={isTranslating} 
                     className="flex items-center gap-2 px-4 py-2 text-sm text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer font-medium" 
                     title="Cycle Language"
                   >
                     🌐 {isTranslating ? 'Translating...' : targetLanguage}
                   </button>
                 </div>
               )}

               <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                  {scanStatus.stage !== 'complete' && (
                    <div className="mb-4 inline-flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-mono">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Streaming from Expert Layer
                    </div>
                  )}
                  <div className="markdown-body text-base/relaxed">
                    {displayResult ? (
                      <div className={isTranslating ? 'opacity-50 animate-pulse pointer-events-none' : ''}>
                        <Markdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code(props) {
                              const { children, className, node, ...rest } = props;
                              const match = /language-(\w+)/.exec(className || '');
                              
                              if (match && match[1] === 'mermaid') {
                                return <MermaidChart chart={String(children).replace(/\n$/, '')} />;
                              }
                              
                              return (
                                <code {...rest} className={className}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {displayResult}
                        </Markdown>
                      </div>
                    ) : (
                      <div className="text-stone-500 italic">Waiting for text...</div>
                    )}
                  </div>
               </div>
             </div>
           ) : (
             <div className="text-center space-y-4 p-12 opacity-50">
                <BookOpen className="w-12 h-12 text-stone-700 mx-auto" />
                <div>
                  <p className="text-stone-400 font-medium">No Data Yet</p>
                  <p className="text-stone-600 text-sm mt-1">Upload files and paste README to reveal the architecture.</p>
                </div>
             </div>
           )}
        </div>
      </main>

      {/* Slide-over Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
          <div className="relative ml-auto w-full max-w-md bg-stone-950 h-full border-l border-stone-800 shadow-2xl flex flex-col flex-1">
            <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">X-Ray Options</h2>
              <button onClick={() => setIsMenuOpen(false)} className="p-2 text-stone-500 hover:text-white rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex border-b border-stone-800 overflow-x-auto custom-scrollbar">
              <button 
                className={`px-4 shrink-0 py-3 text-xs font-mono uppercase tracking-wider whitespace-nowrap ${activeTab === 'system_prompt' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-stone-500 hover:text-stone-300'}`}
                onClick={() => setActiveTab('system_prompt')}
              >Prompt</button>
              <button 
                className={`px-4 shrink-0 py-3 text-xs font-mono uppercase tracking-wider whitespace-nowrap ${activeTab === 'api_keys' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-stone-500 hover:text-stone-300'}`}
                onClick={() => setActiveTab('api_keys')}
              >API Keys</button>
              <button 
                className={`px-4 shrink-0 py-3 text-xs font-mono uppercase tracking-wider whitespace-nowrap ${activeTab === 'system_pipeline' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-stone-500 hover:text-stone-300'}`}
                onClick={() => setActiveTab('system_pipeline')}
              >Pipeline</button>
               <button 
                className={`px-4 shrink-0 py-3 text-xs font-mono uppercase tracking-wider whitespace-nowrap ${activeTab === 'local_ai' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-stone-500 hover:text-stone-300'}`}
                onClick={() => setActiveTab('local_ai')}
              >Local AI</button>
              <button 
                className={`px-4 shrink-0 py-3 text-xs font-mono uppercase tracking-wider whitespace-nowrap ${activeTab === 'history' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-stone-500 hover:text-stone-300'}`}
                onClick={() => setActiveTab('history')}
              >History</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'system_prompt' && (
                <div className="space-y-4 text-sm text-stone-300">
                  <h3 className="text-white font-medium text-base mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-500"/> Native Prompts</h3>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-emerald-400 font-mono text-xs uppercase mb-2">1. Vision Scanner Agent</h4>
                      <pre className="bg-stone-900/80 p-3 rounded-lg border border-stone-800 text-xs whitespace-pre-wrap font-mono custom-scrollbar overflow-x-auto text-emerald-50/70">{VISION_PROMPT}</pre>
                    </div>
                    <div>
                      <h4 className="text-emerald-400 font-mono text-xs uppercase mb-2">2. Text Analyzer Agent</h4>
                      <pre className="bg-stone-900/80 p-3 rounded-lg border border-stone-800 text-xs whitespace-pre-wrap font-mono custom-scrollbar overflow-x-auto text-emerald-50/70">{TEXT_PROMPT}</pre>
                    </div>
                    <div>
                      <h4 className="text-emerald-400 font-mono text-xs uppercase mb-2">3. Mermaid Coder Agent</h4>
                      <pre className="bg-stone-900/80 p-3 rounded-lg border border-stone-800 text-xs whitespace-pre-wrap font-mono custom-scrollbar overflow-x-auto text-emerald-50/70">{CODER_PROMPT}</pre>
                    </div>
                    <div>
                      <h4 className="text-emerald-400 font-mono text-xs uppercase mb-2">4. Supreme Synthesis Expert</h4>
                      <pre className="bg-stone-900/80 p-3 rounded-lg border border-stone-800 text-xs whitespace-pre-wrap font-mono max-h-64 overflow-y-auto custom-scrollbar text-emerald-50/70">{SYNTHESIS_TEMPLATE}</pre>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'api_keys' && (
                <div className="space-y-4 text-sm text-stone-300">
                  <h3 className="text-white font-medium text-base flex items-center gap-2"><Key className="w-4 h-4 text-emerald-500"/> Environment Provider settings</h3>
                  <p className="text-stone-400">Select your prefered industrial provider or completely bypass relying on standard cloud by using your own local model endpoint configuration here.</p>
                  
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-mono text-emerald-500/70 mb-1">Provider</label>
                      <select 
                        value={llmProvider}
                        onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
                        className="w-full bg-stone-900 border border-stone-800 rounded-lg px-4 py-2 text-stone-300 focus:outline-none focus:border-emerald-500 transition-colors"
                      >
                        <option value="Google">Google (Gemini 2.5 Flash / Pro)</option>
                        <option value="OpenAI">OpenAI (GPT-4o / GPT-4)</option>
                        <option value="Anthropic">Anthropic Claude (via OpenAI compat)</option>
                        <option value="Local">Local AI Engine (Ollama / LMStudio / HuggingFace)</option>
                      </select>
                    </div>

                    {(llmProvider === 'OpenAI' || llmProvider === 'Local' || llmProvider === 'Anthropic') && (
                      <div>
                        <label className="block text-xs font-mono text-emerald-500/70 mb-1">Custom Model Name</label>
                        <input 
                          type="text" 
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder={llmProvider === 'Local' ? "e.g. gemma-2b" : "e.g. gpt-4o"}
                          className="w-full bg-stone-900 border border-stone-800 rounded-lg p-3 text-stone-300 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    )}

                    {llmProvider === 'Local' && (
                      <div>
                        <label className="block text-xs font-mono text-emerald-500/70 mb-1">Local API Endpoint</label>
                        <input 
                          type="text" 
                          value={customEndpoint}
                          onChange={(e) => setCustomEndpoint(e.target.value)}
                          placeholder="e.g. http://localhost:11434/v1"
                          className="w-full bg-stone-900 border border-stone-800 rounded-lg p-3 text-stone-300 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-mono text-emerald-500/70 mb-1">API Key</label>
                      <input 
                        type="password" 
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={llmProvider === 'Local' ? "Optional for Local AI" : "Enter your API Key"}
                        className="w-full bg-stone-900 border border-stone-800 rounded-lg p-3 text-stone-300 focus:outline-none focus:border-emerald-500/50"
                      />
                      <p className="text-xs text-stone-500 mt-2">Saved locally in your browser.</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'system_pipeline' && (
                <div className="space-y-4 text-sm text-stone-300">
                  <h3 className="text-white font-medium text-base flex items-center gap-2"><Network className="w-4 h-4 text-emerald-500"/> Pipeline Engineers Data Flow</h3>
                  <p>Our futuristic executing method breaks the task in layer-to-layer execution, managed by our Supreme Expert Agent. This isolates tasks so simple local models can execute them independently or calling minimal APIs handles enormous data.</p>
                  <ol className="list-decimal pl-5 space-y-2 text-stone-400">
                    <li><strong>Vectorization (Input Layer)</strong>: The user submits up to 9 screenshots, README code/text, and optional specific query.</li>
                    <li><strong>Multi-Agent Routing (Expert Layer)</strong>: 
                       <ul className="list-disc pl-5 mt-1 border-l border-emerald-500/20 ml-2 space-y-1">
                          <li><em>Vision Scanner</em> triggers and extracts pure JSON architecture trees.</li>
                          <li><em>Text Analyzer</em> triggers and absorbs READMEs/setup.mds.</li>
                          <li><em>Mermaid Coder</em> is invoked to map visual structures.</li>
                       </ul>
                    </li>
                    <li><strong>Supreme Expert Reconciliation</strong>: The 'Synthesis Expert' orchestrates findings into the 8-stage blueprint.</li>
                    <li><strong>Final Output</strong>: The processed intelligence is rendered, combined with natural TTS and bilingual output.</li>
                  </ol>
                </div>
              )}
              {activeTab === 'local_ai' && (
                <div className="space-y-4 text-sm text-stone-300">
                  <h3 className="text-white font-medium text-base flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-500"/> Use Local AI</h3>
                  <p className="text-stone-400">Execute our tool entirely offline using local AI if you don't have an API key. This handles massive data processing securely on your machine.</p>
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-emerald-400 mb-1">Gemma 4/e2b Model</h4>
                    <p className="text-stone-500 text-xs mb-3">Download and run directly via HuggingFace bridging.</p>
                    <button className="w-full py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg font-medium transition-all flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" /> Download e2b Model (HuggingFace)
                    </button>
                  </div>
                </div>
              )}
              {activeTab === 'history' && (
                <div className="space-y-4 text-sm text-stone-300">
                  <h3 className="text-white font-medium text-base flex items-center gap-2"><History className="w-4 h-4 text-emerald-500"/> User History</h3>
                  <p className="text-stone-400">Whatever execution you do is saved here, but <strong>only available when using Local AI mode</strong>. We don't process with centralized databases or store your queries on our servers.</p>
                  <div className="p-8 text-center border-2 border-dashed border-stone-800 rounded-xl">
                    <History className="w-8 h-8 text-stone-700 mx-auto mb-2" />
                    <p className="text-stone-500">History only enabled in Local Engine execution.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-800 bg-stone-950 flex items-center justify-between text-xs text-stone-600 font-mono">
              <span>v2.1.0 • Pipeline Active</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Connected</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
