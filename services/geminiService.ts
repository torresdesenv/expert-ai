
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ResearchResult } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('500') || err.message?.includes('INTERNAL')) {
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * (i + 1)));
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
    2. NUNCA invente ou alucine links. Copie EXATAMENTE a URL encontrada nos resultados de pesquisa confiáveis.
    3. Procure por vídeos postados nos últimos 24 meses para garantir que o link esteja ativo.
    4. Priorize canais VERIFICADOS, OFICIAIS, de Notícias ou Educacionais (ex: CNN, BBC, TED, Nerdologia, Me Poupe).
    5. Formato: https://www.youtube.com/watch?v=...
    6. Verifique se o título do vídeo corresponde ao link.

    ESTRUTURA DO JSON:
    - summary: Resumo estratégico de alto impacto.
    - history: Contexto histórico detalhado.
    - futureVision: Visão de futuro (próximos 5 a 10 anos).
    - businessOpportunities: 3 planos de negócio concretos.
    - globalReferences: 3 vídeos internacionais reais e ativos.
    - brazilianReferences: 3 vídeos brasileiros reais e ativos.
    - facts: 5 fatos curiosos e validados.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
      prompt = `Você é um apresentador de podcast de elite especializado em Masterclasses imersivas. 
      Escreva um roteiro EXTENSO e PROFUNDO em PORTUGUÊS (BRASIL) sobre: "${subject}". 
      
      ESTRUTURA OBRIGATÓRIA PARA O ROTEIRO COMPLETO (Mínimo de 1500 palavras):
      1. INTRODUÇÃO: Comece com um gancho poderoso, definindo o que é o assunto e por que ele é vital hoje.
      2. EVOLUÇÃO HISTÓRICA: Explore as raízes do tema, como ele surgiu, os marcos principais ao longo das décadas e como chegamos ao estado atual. Seja detalhista.
      3. CENÁRIO ATUAL: Discorra sobre as tecnologias, tendências e desafios que definem o assunto hoje.
      4. OPORTUNIDADES E NEGÓCIOS: Analise como pessoas e empresas podem lucrar ou se beneficiar desse conhecimento agora.
      5. VISÃO DE FUTURO (PRÓXIMOS 5 ANOS): Faça projeções baseadas em dados sobre para onde estamos indo.
      6. CONCLUSÃO: Resuma os principais insights e deixe uma mensagem inspiradora.

      REGRAS:
      - Escreva APENAS o texto que será falado.
      - NÃO inclua [Música], [Narrador:], títulos de capítulos ou instruções de roteiro.
      - O texto deve ser fluido, natural e manter o ouvinte engajado do início ao fim.
      - Use toda a sua base de conhecimento para expandir cada tópico ao máximo.`;
    } else {
      prompt = `Escreva um roteiro de podcast resumido e direto (Pocket Podcast) sobre: "${subject}" em PORTUGUÊS (BRASIL). Foque apenas no essencial para uma compreensão rápida de 2 a 3 minutos. Escreva apenas a fala do locutor.`;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }
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
