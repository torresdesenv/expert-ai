import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ResearchResult } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API_KEY_MISSING: A chave de API não foi encontrada.");
  }
  return new GoogleGenAI({ apiKey });
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('500') || err.message?.includes('INTERNAL') || err.message?.includes('Load failed')) {
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

export const researchSubject = async (subject: string): Promise<ResearchResult> => {
  return withRetry(async () => {
    const ai = getAI();
    
    const prompt = `Realize uma pesquisa profunda e estratégica sobre: "${subject}" em PORTUGUÊS (BRASIL).

    REGRAS CRÍTICAS:
    1. Use 'googleSearch' para encontrar vídeos REAIS.
    2. No campo 'businessOpportunities', escreva pelo menos 3 parágrafos detalhados, cada um separado por DUAS QUEBRAS DE LINHA (\\n\\n). 
    3. Para cada referência (global e brasileira), liste as 3 principais publicações (livros, artigos científicos, cursos famosos ou projetos de destaque).
    4. NÃO USE EMOJIS em nenhum campo para garantir compatibilidade com PDF.

    ESTRUTURA DO JSON:
    - summary: Resumo estratégico de alto impacto.
    - history: Contexto histórico e evolução.
    - futureVision: Visão de futuro para os próximos anos.
    - businessOpportunities: Mínimo de 3 parágrafos detalhados.
    - globalReferences: 3 referências mundiais com nome, relevância, título de vídeo, URL e suas 3 principais publicações.
    - brazilianReferences: 3 referências brasileiras com nome, relevância, título de vídeo, URL e suas 3 principais publicações.
    - facts: 5 fatos curiosos.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            history: { type: Type.STRING },
            futureVision: { type: Type.STRING },
            businessOpportunities: { type: Type.STRING },
            facts: { type: Type.ARRAY, items: { type: Type.STRING } },
            globalReferences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  relevance: { type: Type.STRING },
                  videoTitle: { type: Type.STRING },
                  videoUrl: { type: Type.STRING },
                  publications: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["name", "relevance", "videoTitle", "videoUrl", "publications"]
              }
            },
            brazilianReferences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  relevance: { type: Type.STRING },
                  videoTitle: { type: Type.STRING },
                  videoUrl: { type: Type.STRING },
                  publications: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["name", "relevance", "videoTitle", "videoUrl", "publications"]
              }
            }
          },
          required: ["summary", "history", "futureVision", "businessOpportunities", "facts", "globalReferences", "brazilianReferences"]
        }
      }
    });

    return JSON.parse(response.text);
  });
};

export const generateDetailedScript = async (subject: string, mode: 'resumido' | 'completo'): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const wordTarget = mode === 'completo' ? "pelo menos 2500 palavras para uma duração de 15 a 20 minutos" : "pelo menos 750 palavras para uma duração de 4 a 5 minutos";
    
    const prompt = `Você é um apresentador de podcast profissional e carismático. Escreva um roteiro narrativo COMPLETO e EXTENSO sobre: "${subject}".
    
    META DE TAMANHO: O texto deve ter ${wordTarget}.
    
    INSTRUÇÕES:
    1. Não use emojis ou marcações de produção.
    2. Escreva apenas o que deve ser lido.
    3. Ao FINAL do roteiro, inclua exatamente: "Obrigado por nos acompanhar nesta jornada. Esperamos você para uma nova dose de conhecimento com o EXPERT AI."
    
    Língua: Português Brasileiro.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return response.text;
  });
};

export const generateSpeech = async (text: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Falha na síntese de voz.");
    return base64Audio;
  });
};

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioToBuffer(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

export const createWavBlob = (audioBuffer: AudioBuffer): Blob => {
  const pcmData = audioBuffer.getChannelData(0);
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 32 + pcmData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
};