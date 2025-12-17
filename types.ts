
export interface ReferencePerson {
  name: string;
  relevance: string;
  videoTitle: string;
  videoUrl: string;
}

export interface ResearchResult {
  summary: string;
  history: string;
  futureVision: string;
  businessOpportunities: string;
  facts: string[];
  globalReferences: ReferencePerson[];
  brazilianReferences: ReferencePerson[];
  sources?: { title: string; url: string }[];
}

export interface GeneratedMedia {
  id: string;
  title: string;
  type: 'podcast';
  duration: 'resumido' | 'completo';
  audioUrl: string;
  description: string;
}

export enum GenerationStep {
  IDLE,
  RESEARCHING,
  WRITING_SCRIPTS,
  GENERATING_MEDIA,
  COMPLETED,
  ERROR
}
