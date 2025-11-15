export interface ImageData {
  base64: string;
  mimeType: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: 'gemini-2.5-pro' | 'gemini-2.5-flash';
}

export interface Source {
  uri: string;
  title: string;
}

// For Gold Price Feature
export interface GoldPriceData {
  sekehEmami: number;
  mesghal: number;
  lastUpdate: string;
}

export interface GoldApiResponse {
  price_info: {
    'sekeh-emami': { p: string };
    'mesghal': { p: string };
  };
  time: string;
}
