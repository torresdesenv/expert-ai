
import React, { useState, useEffect } from 'react';
import { GenerationStep, ResearchResult, GeneratedMedia, ReferencePerson } from './types';
import * as gemini from './services/geminiService';

const StepIndicator: React.FC<{ step: GenerationStep, currentStep: GenerationStep }> = ({ step, currentStep }) => {
  const labels = {
    [GenerationStep.IDLE]: "Início",
    [GenerationStep.RESEARCHING]: "Pesquisando",
    [GenerationStep.WRITING_SCRIPTS]: "Roteirizando",
    [GenerationStep.GENERATING_MEDIA]: "Gerando Áudios",
    [GenerationStep.COMPLETED]: "Pronto",
    [GenerationStep.ERROR]: "Erro"
  };
  const isActive = step === currentStep;
  const isPast = currentStep > step;
  return (
    <div className={`flex flex-col items-center gap-2 ${isActive ? 'scale-110' : 'opacity-40'}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
        isActive ? 'border-purple-500 bg-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 
        isPast ? 'border-green-500 bg-green-500/20' : 'border-gray-700'
      }`}>
        {isPast ? <i className="fas fa-check text-green-500 text-sm"></i> : <span className="text-xs font-bold">{step}</span>}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tight">{labels[step]}</span>
    </div>
  );
};

const ReferenceCard: React.FC<{ person: ReferencePerson }> = ({ person }) => (
  <div className="glass-panel p-4 rounded-xl flex flex-col gap-2 hover:bg-white/10 transition-all border-l-2 border-red-500/50">
    <div className="flex items-center justify-between gap-2">
      <h4 className="font-bold text-sm text-purple-300 truncate">{person.name}</h4>
      <i className="fab fa-youtube text-red-500 text-xs flex-shrink-0"></i>
    </div>
    <p className="text-[11px] text-gray-400 line-clamp-2 leading-tight">{person.relevance}</p>
    <a href={person.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-[10px] font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase">
      <i className="fas fa-play"></i> Assistir Vídeo
    </a>
  </div>
);

const MediaCard: React.FC<{ media: GeneratedMedia }> = ({ media }) => {
  return (
    <div className="glass-panel p-6 rounded-3xl flex flex-col gap-5 border-t-4 border-purple-600 group transition-all">
      <div className="flex justify-between items-start">
        <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${media.duration === 'completo' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
          {media.duration}
        </span>
        <i className="fas fa-microphone-lines text-purple-500 text-lg"></i>
      </div>
      <div>
        <h3 className="font-black text-xl group-hover:text-purple-400 transition-colors leading-tight mb-2">{media.title}</h3>
        <p className="text-xs text-gray-400 leading-relaxed">{media.description}</p>
      </div>
      
      <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
        <audio controls className="w-full h-10 custom-audio">
          <source src={media.audioUrl} type="audio/wav" />
        </audio>
      </div>

      <button 
        onClick={() => {
          const a = document.createElement('a');
          a.href = media.audioUrl;
          a.download = `ExpertAI_Podcast_${media.duration}.wav`;
          a.click();
        }} 
        className="w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black transition-all flex items-center justify-center gap-2"
      >
        <i className="fas fa-download"></i> Baixar Áudio
      </button>
    </div>
  );
};

export default function App() {
  const [subject, setSubject] = useState('');
  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [medias, setMedias] = useState<GeneratedMedia[]>([]);
  const [error, setError] = useState<{title: string, message: string} | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      const win = window as any;
      if (win.aistudio && win.aistudio.hasSelectedApiKey) {
        const selected = await win.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        setHasKey(!!process.env.API_KEY && process.env.API_KEY !== "undefined");
      }
    };
    checkKey();
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    
    const win = window as any;
    if (!hasKey && win.aistudio && win.aistudio.openSelectKey) { 
      await win.aistudio.openSelectKey();
      setHasKey(true);
    }

    try {
      setError(null);
      setStep(GenerationStep.RESEARCHING);
      
      const researchData = await gemini.researchSubject(subject);
      setResearch(researchData);
      
      setStep(GenerationStep.WRITING_SCRIPTS);
      const [scriptRes, scriptComp] = await Promise.all([
        gemini.generateDetailedScript(subject, 'resumido'),
        gemini.generateDetailedScript(subject, 'completo')
      ]);

      setStep(GenerationStep.GENERATING_MEDIA);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const [audioResBase64, audioCompBase64] = await Promise.all([
        gemini.generateSpeech(scriptRes),
        gemini.generateSpeech(scriptComp)
      ]);

      const [bufRes, bufComp] = await Promise.all([
        gemini.decodeAudioToBuffer(gemini.decodeBase64(audioResBase64), audioCtx),
        gemini.decodeAudioToBuffer(gemini.decodeBase64(audioCompBase64), audioCtx)
      ]);

      const audioResUrl = URL.createObjectURL(gemini.createWavBlob(bufRes));
      const audioCompUrl = URL.createObjectURL(gemini.createWavBlob(bufComp));

      setMedias([
        { id: 'p1', type: 'podcast', duration: 'resumido', title: 'Pocket Podcast (Essencial)', description: 'O resumo estratégico para quem tem pouco tempo.', audioUrl: audioResUrl },
        { id: 'p2', type: 'podcast', duration: 'completo', title: 'Imersão (Masterclass)', description: 'Explicação profunda e detalhada sobre o tema.', audioUrl: audioCompUrl }
      ]);

      setStep(GenerationStep.COMPLETED);
    } catch (err: any) {
      console.error("Erro capturado:", err);
      
      let errorTitle = "Erro no Processamento";
      let errorMessage = err.message || "Ocorreu um erro inesperado.";

      // Detecção de erros comuns de rede/CORS/Adblock
      if (err instanceof TypeError && err.message.includes('failed')) {
        errorTitle = "Requisição Bloqueada";
        errorMessage = "O navegador não conseguiu conectar com a inteligência do Google. Isso geralmente acontece por causa de BLOQUEADORES DE ANÚNCIOS (AdBlock) ou redes corporativas restritas. Por favor, desative o AdBlock e tente novamente.";
      } else if (err.message?.includes('API_KEY_MISSING')) {
        errorTitle = "Chave de API Ausente";
        errorMessage = "A chave de API não foi configurada corretamente na Vercel. Verifique as variáveis de ambiente.";
      }

      setError({ title: errorTitle, message: errorMessage });
      setStep(GenerationStep.ERROR);
    }
  };

  return (
    <div className="min-h-screen pb-20 selection:bg-purple-600 overflow-x-hidden text-slate-50">
      <nav className="p-6 border-b border-white/5 glass-panel sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-800 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-brain text-white text-lg"></i>
            </div>
            <h1 className="text-xl font-black tracking-tighter uppercase">Expert <span className="text-purple-500 italic">AI</span></h1>
          </div>
          <div className="text-[10px] uppercase font-black tracking-widest text-gray-500">Audio Experience v5.2</div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-12">
        {step === GenerationStep.IDLE && (
          <div className="max-w-4xl mx-auto text-center py-24 animate-in fade-in zoom-in duration-700">
            <h2 className="text-6xl md:text-8xl font-black mb-8 leading-[0.85] tracking-tighter">Domine qualquer <span className="gradient-text">Assunto.</span></h2>
            <p className="text-lg text-gray-400 mb-12 max-w-xl mx-auto leading-relaxed">
              Transformamos temas complexos em podcasts imersivos e inteligência de mercado em minutos.
            </p>
            
            <form onSubmit={handleStart} className="relative max-w-2xl mx-auto">
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                placeholder="Qual assunto você quer dominar hoje?" 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-8 text-xl focus:ring-2 focus:ring-purple-600 outline-none transition-all placeholder:text-gray-700 shadow-2xl" 
              />
              <button 
                type="submit" 
                className="w-full sm:w-auto mt-4 sm:mt-0 sm:absolute sm:right-3 sm:top-3 sm:bottom-3 px-10 bg-purple-600 rounded-xl font-black hover:bg-purple-500 transition-all flex items-center justify-center gap-2"
              >
                Gerar Inteligência <i className="fas fa-bolt text-sm"></i>
              </button>
            </form>
          </div>
        )}

        {(step > GenerationStep.IDLE && step < GenerationStep.COMPLETED) && (
          <div className="max-w-4xl mx-auto text-center py-24">
             <div className="flex justify-center mb-12">
               <div className="w-24 h-24 bg-purple-600/10 rounded-full flex items-center justify-center border border-purple-500/20 animate-pulse">
                 <i className="fas fa-atom text-4xl text-purple-500 fa-spin"></i>
               </div>
             </div>
             <h3 className="text-4xl font-black mb-16 tracking-tighter uppercase">Processando Pesquisa Profunda...</h3>
             <div className="flex justify-between relative px-20">
               <div className="absolute top-6 left-20 right-20 h-0.5 bg-white/5 -z-10"></div>
               <StepIndicator step={GenerationStep.RESEARCHING} currentStep={step} />
               <StepIndicator step={GenerationStep.WRITING_SCRIPTS} currentStep={step} />
               <StepIndicator step={GenerationStep.GENERATING_MEDIA} currentStep={step} />
             </div>
             <p className="mt-12 text-xs text-gray-500 uppercase font-black tracking-widest animate-pulse">Sincronizando conhecimento e vozes de elite...</p>
          </div>
        )}

        {step === GenerationStep.COMPLETED && research && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-10 gap-6">
              <div>
                <span className="text-purple-500 text-xs font-black uppercase tracking-[0.3em] mb-2 block">Dossiê Estratégico</span>
                <h2 className="text-6xl md:text-7xl font-black capitalize leading-none tracking-tighter">{subject}</h2>
              </div>
              <button onClick={() => setStep(GenerationStep.IDLE)} className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-black uppercase text-xs tracking-widest flex items-center gap-3">
                <i className="fas fa-search"></i> Nova Pesquisa
              </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-12">
                <section className="glass-panel p-10 md:p-14 rounded-[3rem] border-l-8 border-blue-600 bg-gradient-to-br from-blue-600/5 to-transparent">
                  <h3 className="text-2xl font-black mb-8 flex items-center gap-4"><i className="fas fa-book-open text-blue-500"></i> Inteligência e Contexto</h3>
                  <div className="text-gray-200 space-y-10 leading-relaxed">
                    <p className="text-xl md:text-2xl font-bold text-white leading-tight">{research.summary}</p>
                    <div className="bg-white/5 p-8 rounded-3xl border border-white/10">
                       <h4 className="text-white font-black mb-4 uppercase text-xs tracking-widest opacity-40">Histórico & Evolução</h4>
                       <p className="text-sm italic font-medium opacity-80 whitespace-pre-line leading-relaxed">{research.history}</p>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {medias.map(m => <MediaCard key={m.id} media={m} />)}
                </div>

                <section className="glass-panel p-10 md:p-14 rounded-[3rem] border-l-8 border-green-600 bg-gradient-to-br from-green-600/5 to-transparent">
                  <h3 className="text-2xl font-black mb-8 flex items-center gap-4"><i className="fas fa-telescope text-green-500"></i> Visão de Futuro (5-10 anos)</h3>
                  <div className="bg-green-500/5 p-8 rounded-3xl border border-green-500/20">
                    <p className="text-gray-300 text-lg leading-relaxed italic font-medium whitespace-pre-line">{research.futureVision}</p>
                  </div>
                </section>

                <section className="glass-panel p-10 md:p-14 rounded-[3rem] border-l-8 border-orange-500 bg-orange-500/5">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)]">
                      <i className="fas fa-chart-line text-white text-xl"></i>
                    </div>
                    <h3 className="text-2xl font-black">Sugestão Empreendedora</h3>
                  </div>
                  <div className="text-gray-200 text-lg leading-relaxed font-semibold whitespace-pre-line">
                    {research.businessOpportunities}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <div className="glass-panel p-8 rounded-[2.5rem] bg-gradient-to-b from-purple-900/10 to-transparent border-t border-purple-500/20">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3"><i className="fas fa-microphone-alt text-red-500"></i> Referências em Vídeo</h3>
                  <div className="space-y-6">
                    <span className="text-[10px] font-black uppercase text-gray-600 tracking-widest block border-b border-white/5 pb-2">Mercado Nacional</span>
                    {research.brazilianReferences.map((p, i) => <ReferenceCard key={`b-${i}`} person={p} />)}
                    <div className="h-8"></div>
                    <span className="text-[10px] font-black uppercase text-gray-600 tracking-widest block border-b border-white/5 pb-2">Mercado Global</span>
                    {research.globalReferences.map((p, i) => <ReferenceCard key={`g-${i}`} person={p} />)}
                  </div>
                </div>

                <div className="glass-panel p-8 rounded-3xl">
                   <h3 className="text-xs font-black mb-6 uppercase tracking-widest text-gray-500 border-b border-white/5 pb-4">Fontes Consultadas</h3>
                   <div className="flex flex-col gap-3">
                     {research.sources?.map((s, i) => (
                       <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold hover:bg-white/10 transition-all flex items-center gap-4 group">
                         <i className="fas fa-external-link-alt opacity-30 group-hover:opacity-100 transition-opacity"></i>
                         <span className="truncate">{s.title}</span>
                       </a>
                     ))}
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === GenerationStep.ERROR && error && (
          <div className="max-w-lg mx-auto text-center py-24 glass-panel rounded-[3rem] border-red-500/30 px-12 animate-in fade-in slide-in-from-top-4">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
              <i className="fas fa-network-wired text-4xl text-red-600"></i>
            </div>
            <h3 className="text-3xl font-black mb-4">{error.title}</h3>
            <p className="text-gray-400 mb-10 text-sm leading-relaxed">{error.message}</p>
            <div className="flex flex-col gap-4">
              <button onClick={() => window.location.reload()} className="w-full px-8 py-5 bg-white text-black rounded-2xl font-black uppercase text-xs hover:bg-gray-200 transition-all shadow-2xl">
                Atualizar Página
              </button>
              <button onClick={() => setStep(GenerationStep.IDLE)} className="w-full px-8 py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase text-xs hover:bg-white/10 transition-all">
                Tentar Outro Assunto
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-32 border-t border-white/5 py-12 text-center opacity-20 text-[9px] uppercase font-black tracking-[0.6em]">
        Expert AI Platform &copy; 2025 // Ultra Fidelity Experience // By Renato Torres
      </footer>
    </div>
  );
}
