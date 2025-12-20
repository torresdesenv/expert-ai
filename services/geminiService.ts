
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

    REGRAS CRÍTICAS PARA VÍDEOS (YOUTUBE):
    1. Use a ferramenta 'googleSearch' para encontrar os vídeos.
    2. NUNCA invente links. Copie EXATAMENTE a URL encontrada.
    3. Formato: https://www.youtube.com/watch?v=...

    ESTRUTURA DO JSON:
    - summary: Resumo estratégico de alto impacto.
    - history: Contexto histórico detalhado.
    - futureVision: Visão de futuro para os próximos 5 a 10 anos.
    - businessOpportunities: Mínimo de 3 oportunidades de negócio. Use emojis no início de cada uma.
    - globalReferences: 3 vídeos internacionais reais.
    - brazilianReferences: 3 vídeos brasileiros reais.
    - facts: 5 fatos curiosos.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Mudado para Flash para velocidade máxima
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
                  videoUrl: { type: Type.STRING }
                },
                required: ["name", "relevance", "videoTitle", "videoUrl"]
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
                  videoUrl: { type: Type.STRING }
                },
                required: ["name", "relevance", "videoTitle", "videoUrl"]
              }
            }
          },
          required: ["summary", "history", "futureVision", "businessOpportunities", "facts", "globalReferences", "brazilianReferences"]
        }
      }
    });

    const result = JSON.parse(response.text);
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || 'Fonte Consultada',
      url: chunk.web?.uri
    })).filter((s: any) => s.url) || [];

    return { ...result, sources };
  });
};

export const generateDetailedScript = async (subject: string, mode: 'resumido' | 'completo'): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    
    let prompt = "";
    if (mode === 'completo') {
      prompt = `Você é um apresentador de podcast de elite. Escreva um roteiro ENVOLVENTE sobre: "${subject}". 
      Discorra sobre a evolução histórica, cenário atual, oportunidades e futuro.
      Escreva apenas o texto que deve ser falado. Sem marcações técnicas.`;
    } else {
      prompt = `Escreva um roteiro de podcast resumido sobre: "${subject}" em PORTUGUÊS. Apenas a fala.`;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Mudado para Flash para velocidade máxima
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } // Desativa thinking para ser instantâneo
      }
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
    if (!base64Audio) throw new Error("Erro na síntese de voz.");
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
