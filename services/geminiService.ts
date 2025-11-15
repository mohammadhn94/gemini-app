import { GoogleGenAI, Modality } from "@google/genai";
import { ImageData, Source } from '../types';

async function getApiKey() {
    if (!process.env.API_KEY) {
        // Check if the user has selected a key, this can be slow
        const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
        if (!hasKey) {
            await (window as any).aistudio?.openSelectKey();
        }
    }
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable is not set");
    }
    return process.env.API_KEY;
}

// Main AI instance for most services
async function getAiClient() {
    const apiKey = await getApiKey();
    return new GoogleGenAI({ apiKey });
}

export async function editImageWithPrompt(image: ImageData, prompt: string): Promise<ImageData> {
  const ai = await getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data: image.base64, mimeType: image.mimeType } },
        { text: prompt },
      ],
    },
    config: { responseModalities: [Modality.IMAGE] },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
    }
  }
  throw new Error("هیچ تصویری در پاسخ تولید نشد.");
}

export async function generateImageWithPrompt(prompt: string): Promise<ImageData> {
    const ai = await getAiClient();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: '1:1' },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    if (base64ImageBytes) {
        return { base64: base64ImageBytes, mimeType: 'image/png' };
    }
    throw new Error("هیچ تصویری در پاسخ تولید نشد.");
}

export async function analyzeImage(image: ImageData, prompt: string): Promise<string> {
    const ai = await getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { data: image.base64, mimeType: image.mimeType } },
                { text: prompt },
            ],
        },
    });
    return response.text;
}

export async function searchWithGoogle(prompt: string): Promise<{ text: string; sources: Source[] }> {
    const ai = await getAiClient();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const sources: Source[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map((chunk: any) => ({
            uri: chunk.web?.uri,
            title: chunk.web?.title,
        }))
        .filter((s: Source) => s.uri && s.title) || [];
    
    return { text: response.text, sources };
}


export async function animateImageWithVeo(image: ImageData, prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string> {
    // VEO requires creating a new client right before the call
    const apiKey = await getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: {
            imageBytes: image.base64,
            mimeType: image.mimeType,
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio,
        }
    });

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        try {
            operation = await ai.operations.getVideosOperation({ operation: operation });
        } catch (error: any) {
             if (error.message?.includes('Requested entity was not found')) {
                // This can happen if the API key becomes invalid. Force re-selection.
                await (window as any).aistudio?.openSelectKey();
                throw new Error("کلید API نامعتبر است. لطفاً دوباره انتخاب کنید و مجدداً تلاش نمایید.");
            }
            throw error;
        }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("ساخت ویدیو با شکست مواجه شد.");
    }

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
}