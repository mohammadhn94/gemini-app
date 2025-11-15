export interface ImageData {
  base64: string;
  mimeType: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Source {
  uri: string;
  title: string;
}