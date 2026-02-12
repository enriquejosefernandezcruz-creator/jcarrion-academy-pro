/// <reference types="@cloudflare/workers-types" />

interface Env {
  VECTOR_INDEX: VectorizeIndex;
  AI: any;
  OPENAI_API_KEY: string;
}