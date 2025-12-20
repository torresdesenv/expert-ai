import React, { useState, useEffect, useRef } from 'react';
import { GenerationStep, ResearchResult, GeneratedMedia, ReferencePerson } from './types';
import * as gemini from './services/geminiService';
import { jsPDF } from 'jspdf';

const StepIndicator: React.FC<{ step: GenerationStep, currentStep: GenerationStep }> = ({ step, currentStep }) => {
  const labels = {
    [GenerationStep.IDLE]: "Início",
    [GenerationStep.RESEARCHING]: "Pesquisando",
    [GenerationStep.WRITING_SCRIPTS]: "Roteirizando",
    [GenerationStep.GENERATING_MEDIA]: "Processando Voz",
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
    {person.publications && person.publications.length > 0 && (
      <div className="mt-1">
        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Obras:</span>
        <ul className="text-[10px] text-gray-300 list-disc list-inside">
          {person.publications.map((pub, i) => <li key={i} className="truncate">{pub}</li>)}
        </ul>
      </div>
    )}
    <a href={person.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-[10px] font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase">
      <i className="fas fa-play"></i> Assistir Vídeo
    </a>
  </div>
);

const MediaCard: React.FC<{ media: GeneratedMedia, subject: string }> = ({ media, subject }) => {
  return (
    <div className="glass-panel p-6 rounded-3xl flex flex-col gap-5 border-t-4 border-purple-600 group transition-all">
      <div className="flex justify-between items-start">
        <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${media.duration === 'completo' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
          {media.duration === 'completo' ? '10-20 min' : '3-5 min'}
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
          const safeName = subject.replace(/\s+/g, '_');
          a.download = `ExpertAI_${safeName}_${media.duration === 'completo' ? 'IMERSAO' : 'POCKET'}.wav`;
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
  const [progress, setProgress] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  
  const scriptsRef = useRef<{pocket: string, master: string} | null>(null);

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

  useEffect(() => {
    let timer: number;
    if (estimatedSeconds > 0 && step !== GenerationStep.COMPLETED) {
      timer = window.setInterval(() => {
        setEstimatedSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [estimatedSeconds, step]);

  const cleanTextForPDF = (text: string) => {
    if (!text) return "";
    return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDDFF])/g, '')
               .replace(/[^\x00-\x7FáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s\.,!\?;:()"-]/g, '')
               .trim();
  };

  const downloadPDF = () => {
    if (!research || !subject) return;
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    let cursor = 20;

    const checkNewPage = (needed: number) => {
      if (cursor + needed > 280) {
        doc.addPage();
        cursor = 20;
        return true;
      }
      return false;
    };

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(`Expert AI Dossie: ${cleanTextForPDF(subject.toUpperCase())}`, margin, cursor);
    cursor += 15;

    const sections = [
      { title: 'RESUMO ESTRATEGICO', content: research.summary },
      { title: 'HISTORICO E EVOLUCAO', content: research.history },
      { title: 'VISAO DE FUTURO', content: research.futureVision },
      { title: 'OPORTUNIDADES DE NEGOCIO', content: research.businessOpportunities }
    ];

    sections.forEach(sec => {
      checkNewPage(25);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sec.title, margin, cursor);
      cursor += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(cleanTextForPDF(sec.content), pageWidth - (margin * 2));
      lines.forEach((line: string) => {
        if (cursor > 280) { doc.addPage(); cursor = 20; }
        doc.text(line, margin, cursor);
        cursor += 5;
      });
      cursor += 12;
    });

    // Seção de Referências Mundiais e Suas Publicações
    checkNewPage(20);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REFERENCIAS MUNDIAIS E OBRAS', margin, cursor);
    cursor += 10;
    research.globalReferences.forEach(ref => {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanTextForPDF(ref.name), margin, cursor);
      cursor += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const relLines = doc.splitTextToSize(cleanTextForPDF(ref.relevance), pageWidth - (margin * 2));
      doc.text(relLines, margin, cursor);
      cursor += relLines.length * 5 + 2;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Principais Publicações:', margin, cursor);
      cursor += 5;
      doc.setFont('helvetica', 'normal');
      ref.publications.forEach(pub => {
        doc.text(`- ${cleanTextForPDF(pub)}`, margin + 5, cursor);
        cursor += 4.5;
      });
      cursor += 5;
    });

    // Seção de Referências Nacionais e Suas Publicações
    checkNewPage(20);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REFERENCIAS NACIONAIS E OBRAS', margin, cursor);
    cursor += 10;
    research.brazilianReferences.forEach(ref => {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanTextForPDF(ref.name), margin, cursor);
      cursor += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const relLines = doc.splitTextToSize(cleanTextForPDF(ref.relevance), pageWidth - (margin * 2));
      doc.text(relLines, margin, cursor);
      cursor += relLines.length * 5 + 2;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Principais Publicações:', margin, cursor);
      cursor += 5;
      doc.setFont('helvetica', 'normal');
      ref.publications.forEach(pub => {
        doc.text(`- ${cleanTextForPDF(pub)}`, margin + 5, cursor);
        cursor += 4.5;
      });
      cursor += 5;
    });

    if (scriptsRef.current?.master) {
      doc.addPage();
      cursor = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('ROTEIRO DA MASTERCLASS (INTEGRA)', margin, cursor);
      cursor += 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const scriptLines = doc.splitTextToSize(cleanTextForPDF(scriptsRef.current.master), pageWidth - (margin * 2));
      scriptLines.forEach((line: string) => {
        if (cursor > 280) { doc.addPage(); cursor = 20; }
        doc.text(line, margin, cursor);
        cursor += 4.5;
      });
    }

    doc.save(`ExpertAI_${subject.replace(/\s+/g, '_')}.pdf`);
  };

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
      setProgress(5);
      setEstimatedSeconds(150); 
      setStep(GenerationStep.RESEARCHING);
      
      const researchData = await gemini.researchSubject(subject);
      setResearch(researchData);
      setProgress(30);
      setEstimatedSeconds(100);
      
      setStep(GenerationStep.WRITING_SCRIPTS);
      const [scriptRes, scriptComp] = await Promise.all([
        gemini.generateDetailedScript(subject, 'resumido'),
        gemini.generateDetailedScript(subject, 'completo')
      ]);
      scriptsRef.current = { pocket: scriptRes, master: scriptComp };
      
      setProgress(50);
      setEstimatedSeconds(50);

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
        { id: 'p1', type: 'podcast', duration: 'resumido', title: 'Pocket Podcast', description: 'Conteúdo de 3 a 5 minutos focado no essencial.', audioUrl: audioResUrl },
        { id: 'p2', type: 'podcast', duration: 'completo', title: 'Imersão Masterclass', description: 'Conteúdo profundo de 10 a 20 minutos.', audioUrl: audioCompUrl }
      ]);

      setProgress(100);
      setStep(GenerationStep.COMPLETED);
    } catch (err: any) {
      console.error("Erro no processamento:", err);
      setError({ title: "Falha na Geração", message: err.message || "Tente novamente em alguns instantes." });
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
          <div className="text-[10px] uppercase font-black tracking-widest text-gray-500">ULTRA FIDELITY v13.0</div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-12">
        {step === GenerationStep.IDLE && (
          <div className="max-w-4xl mx-auto text-center py-24 animate-in fade-in zoom-in duration-700">
            <h2 className="text-6xl md:text-8xl font-black mb-8 leading-[0.85] tracking-tighter">Domine qualquer <span className="gradient-text">Assunto.</span></h2>
            <p className="text-lg text-gray-400 mb-12 max-w-xl mx-auto leading-relaxed">
              Pesquisas ultra imersivas com análise de benchmarks globais e áudios de longa duração.
            </p>
            
            <form onSubmit={handleStart} className="relative max-w-2xl mx-auto">
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                placeholder="Qual conhecimento você quer extrair hoje?" 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-8 text-xl focus:ring-2 focus:ring-purple-600 outline-none transition-all placeholder:text-gray-700 shadow-2xl" 
              />
              <button 
                type="submit" 
                className="w-full sm:w-auto mt-4 sm:mt-0 sm:absolute sm:right-3 sm:top-3 sm:bottom-3 px-10 bg-purple-600 rounded-xl font-black hover:bg-purple-500 transition-all flex items-center justify-center gap-2 shadow-xl shadow-purple-900/40"
              >
                Gerar Especialista <i className="fas fa-bolt text-sm"></i>
              </button>
            </form>
          </div>
        )}

        {(step > GenerationStep.IDLE && step < GenerationStep.COMPLETED) && (
          <div className="max-w-4xl mx-auto text-center py-24">
             <div className="flex justify-center mb-12">
               <div className="w-24 h-24 bg-purple-600/10 rounded-full flex items-center justify-center border border-purple-500/20 animate-pulse relative">
                 <i className="fas fa-atom text-4xl text-purple-500 fa-spin"></i>
                 <span className="absolute -bottom-4 text-[10px] font-black text-purple-400">{progress}%</span>
               </div>
             </div>
             <h3 className="text-4xl font-black mb-4 tracking-tighter uppercase">Mineração de Dados Ativa...</h3>
             <p className="mb-12 text-gray-500 font-bold uppercase text-xs">Tempo aproximado: {estimatedSeconds}s</p>
             
             <div className="max-w-md mx-auto mb-16">
               <div className="progress-bar mb-10">
                 <div className="progress-fill" style={{ width: `${progress}%` }}></div>
               </div>
               
               <div className="flex justify-between relative px-10">
                 <div className="absolute top-6 left-0 right-0 h-0.5 bg-white/5 -z-10"></div>
                 <StepIndicator step={GenerationStep.RESEARCHING} currentStep={step} />
                 <StepIndicator step={GenerationStep.WRITING_SCRIPTS} currentStep={step} />
                 <StepIndicator step={GenerationStep.GENERATING_MEDIA} currentStep={step} />
               </div>
             </div>
          </div>
        )}

        {step === GenerationStep.COMPLETED && research && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-10 gap-6">
              <div>
                <span className="text-purple-500 text-xs font-black uppercase tracking-[0.3em] mb-2 block">Dossiê de Especialista</span>
                <h2 className="text-6xl md:text-7xl font-black capitalize leading-none tracking-tighter">{subject}</h2>
              </div>
              <div className="flex gap-4">
                <button onClick={downloadPDF} className="px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-all font-black uppercase text-xs tracking-widest flex items-center gap-3 text-white shadow-xl shadow-blue-900/20">
                  <i className="fas fa-file-pdf text-lg"></i> PDF COMPLETO
                </button>
                <button onClick={() => setStep(GenerationStep.IDLE)} className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-black uppercase text-xs tracking-widest flex items-center gap-3">
                  <i className="fas fa-search"></i> NOVA BUSCA
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-12">
                <section className="glass-panel p-10 md:p-14 rounded-[3rem] border-l-8 border-blue-600 bg-gradient-to-br from-blue-600/5 to-transparent">
                  <h3 className="text-2xl font-black mb-8 flex items-center gap-4 uppercase tracking-tighter"><i className="fas fa-book-open text-blue-500"></i> Inteligência Estratégica</h3>
                  <div className="text-gray-200 space-y-10 leading-relaxed">
                    <p className="text-xl md:text-2xl font-bold text-white leading-tight">{research.summary}</p>
                    <div className="bg-white/5 p-8 rounded-3xl border border-white/10">
                       <h4 className="text-white font-black mb-4 uppercase text-xs tracking-widest opacity-40">Evolução do Tema</h4>
                       <p className="text-sm italic font-medium opacity-80 whitespace-pre-line leading-relaxed">{research.history}</p>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {medias.map(m => <MediaCard key={m.id} media={m} subject={subject} />)}
                </div>

                <section className="glass-panel p-10 md:p-14 rounded-[3rem] border-l-8 border-orange-500 bg-orange-500/5">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)]">
                      <i className="fas fa-chart-line text-white text-xl"></i>
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">Oportunidades de Negócio</h3>
                  </div>
                  <div className="space-y-6">
                    {research.businessOpportunities.split('\n\n').filter(l => l.trim()).map((opt, i) => (
                      <div key={i} className="p-10 bg-white/5 rounded-[2.5rem] border border-white/10 hover:border-orange-500/30 transition-all shadow-xl leading-relaxed text-lg font-medium">
                        {opt}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <div className="glass-panel p-8 rounded-[2.5rem] border-t border-purple-500/20">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3 uppercase tracking-tighter"><i className="fas fa-video text-red-500"></i> Benchmarks & Referências</h3>
                  <div className="space-y-6">
                    <span className="text-[10px] font-black uppercase text-gray-600 tracking-widest block border-b border-white/5 pb-2">Conteúdo Nacional</span>
                    {research.brazilianReferences.map((p, i) => <ReferenceCard key={`b-${i}`} person={p} />)}
                    <div className="h-8"></div>
                    <span className="text-[10px] font-black uppercase text-gray-600 tracking-widest block border-b border-white/5 pb-2">Benchmark Global</span>
                    {research.globalReferences.map((p, i) => <ReferenceCard key={`g-${i}`} person={p} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === GenerationStep.ERROR && (
          <div className="max-w-2xl mx-auto text-center py-24 glass-panel rounded-[3rem] border-red-500/30">
            <i className="fas fa-exclamation-triangle text-6xl text-red-500 mb-8"></i>
            <h3 className="text-3xl font-black mb-4 uppercase">{error?.title || "Ops! Algo deu errado"}</h3>
            <p className="text-gray-400 mb-8 text-lg">{error?.message || "Houve um problema. Tente novamente."}</p>
            <button onClick={() => setStep(GenerationStep.IDLE)} className="px-12 py-5 bg-white/10 rounded-2xl font-black uppercase text-xs hover:bg-white/20 transition-all border border-white/10">
              Reiniciar Processo
            </button>
          </div>
        )}
      </main>

      <footer className="mt-32 border-t border-white/5 py-16 flex flex-col items-center gap-10">
        <div className="text-[12px] uppercase font-black tracking-[0.5em] text-center text-white opacity-100">
          Expert AI Ultra Fidelity Experience // By Renato Torres
        </div>
        <div className="px-10 py-5 rounded-[2rem] bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-white/10 text-xs font-bold text-gray-100 shadow-2xl backdrop-blur-md">
          Gostou? Contribua para nossa evolução pelo PIX: <span className="text-purple-400 select-all font-black text-sm ml-2">110.396.868-85</span>
        </div>
      </footer>
    </div>
  );
}