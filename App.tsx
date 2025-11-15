

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { editImageWithPrompt, generateImageWithPrompt, analyzeImage, searchWithGoogle, animateImageWithVeo, fetchGoldPrices, generateSpeech } from './services/geminiService';
import type { ImageData, ChatMessage, Source, ChatSession, GoldPriceData } from './types';
import { UploadIcon, SparklesIcon, Spinner, ExclamationIcon, ChatIcon, GenerateIcon, EditIcon, AnalyzeIcon, VideoIcon, SearchIcon, SendIcon, MenuIcon, CloseIcon, PlusIcon, TrashIcon, GoldIcon, AudioSparkIcon, PlayIcon, StopIcon } from './components/IconComponents';

type Feature = 'chat' | 'generate' | 'edit' | 'analyze' | 'animate' | 'search' | 'gold' | 'speech';

// --- Custom Hook for Persistent State ---
function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState(() => {
        try {
            const storedValue = localStorage.getItem(key);
            return storedValue ? JSON.parse(storedValue) : defaultValue;
        } catch (error) {
            console.error(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
}


const featureConfig: Record<Feature, { name: string; icon: React.FC<{className?: string}>; description: string }> = {
  chat: { name: 'چت‌بات', icon: ChatIcon, description: 'با هوش مصنوعی گفتگو کنید.' },
  generate: { name: 'خالق تصویر', icon: GenerateIcon, description: 'با یک فرمان متنی، تصویر بسازید.' },
  edit: { name: 'ویرایشگر تصویر', icon: EditIcon, description: 'تصاویر خود را با هوش مصنوعی ویرایش کنید.' },
  analyze: { name: 'تحلیلگر تصویر', icon: AnalyzeIcon, description: 'یک تصویر را برای تحلیل آپلود کنید.' },
  animate: { name: 'انیماتور ویدیو', icon: VideoIcon, description: 'تصویر خود را به یک ویدیو تبدیل کنید.' },
  search: { name: 'جستجوی وب', icon: SearchIcon, description: 'پاسخ‌های به‌روز از وب دریافت کنید.' },
  gold: { name: 'قیمت طلا', icon: GoldIcon, description: 'قیمت لحظه‌ای سکه و مثقال طلا را ببینید.' },
  speech: { name: 'تولید گفتار', icon: AudioSparkIcon, description: 'متن را به گفتار صوتی تبدیل کنید.' },
};

// --- Shared Components ---

const ImageUploader: React.FC<{ onImageSelect: (image: ImageData) => void; disabled: boolean; }> = ({ onImageSelect, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const [, mimeType, base64Data] = base64String.match(/^data:(image\/\w+);base64,(.*)$/) || [];
        if (base64Data && mimeType) {
          onImageSelect({ base64: base64Data, mimeType });
        } else {
            alert("فرمت فایل نامعتبر است.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const onAreaClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }

  return (
    <div
      onClick={onAreaClick}
      className={`relative flex flex-col items-center justify-center w-full h-64 sm:h-80 border-2 border-dashed rounded-lg transition-colors duration-300 ${disabled ? 'border-gray-600 bg-gray-800 cursor-not-allowed' : 'border-gray-500 hover:border-blue-400 hover:bg-gray-800/50 cursor-pointer'}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png, image/jpeg, image/webp"
        disabled={disabled}
      />
      <div className="text-center">
        <UploadIcon className={`mx-auto h-12 w-12 ${disabled ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={`mt-2 ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>برای آپلود تصویر کلیک کنید</p>
        <p className={`text-xs ${disabled ? 'text-gray-600' : 'text-gray-500'}`}>PNG, JPG, WEBP</p>
      </div>
    </div>
  );
};

const ErrorDisplay: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex items-center bg-red-900/50 text-red-300 border border-red-700 rounded-lg p-3 mt-4">
        <ExclamationIcon className="h-5 w-5 ms-3 flex-shrink-0" />
        <span className="text-sm">{message}</span>
    </div>
);

const LoadingOverlay: React.FC<{ text: string }> = ({ text }) => (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center rounded-lg z-10">
        <Spinner className="animate-spin h-10 w-10 text-blue-400" />
        <p className="mt-4 text-lg">{text}</p>
    </div>
);

const FeatureHeader: React.FC<{ feature: Feature }> = ({ feature }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold text-gray-200">{featureConfig[feature].name}</h2>
    <p className="text-gray-400 mt-1">{featureConfig[feature].description}</p>
  </div>
);

// --- Feature Components ---

const Chatbot = memo(({ session, onUpdate, onNewSession }: { session: ChatSession | null, onUpdate: (session: ChatSession) => void, onNewSession: (session: ChatSession) => void }) => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [useProModel, setUseProModel] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages(session?.messages || []);
        setUseProModel(session?.model === 'gemini-2.5-pro');
        initializeChat(session?.model || 'gemini-2.5-flash', session?.messages || []);
    }, [session]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const initializeChat = useCallback(async (model: 'gemini-2.5-pro' | 'gemini-2.5-flash', history: ChatMessage[]) => {
        try {
            setIsLoading(true);
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const config = model === 'gemini-2.5-pro' ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
            
            // The `history` parameter for `ai.chats.create` expects an array of `Content` objects.
            // We map our `ChatMessage[]` to the required format.
            const sdkHistory = history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));
            const newChat = ai.chats.create({ model, config, history: sdkHistory });
            setChat(newChat);
            setError(null);
        } catch (err) {
            setError('خطا در راه‌اندازی چت.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleModelChange = (isPro: boolean) => {
        setUseProModel(isPro);
        const newModel = isPro ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        initializeChat(newModel, messages);
        if (session) {
            onUpdate({ ...session, model: newModel });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading || !chat) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        const newMessages = [...messages, userMessage];
        const currentInput = input;
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);
        setError(null);

        // Optimistically add empty model message
        setTimeout(() => setMessages(prev => [...prev, { role: 'model', content: '' }]), 10);

        try {
            const stream = await chat.sendMessageStream({ message: currentInput });
            let fullResponse = '';
            for await (const chunk of stream) {
                const chunkText = chunk.text;
                fullResponse += chunkText;
                setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage.role === 'model') {
                        return [...prev.slice(0, -1), { ...lastMessage, content: fullResponse }];
                    }
                    return prev; // Should not happen
                });
            }
            
            const updatedMessages = [...newMessages, { role: 'model', content: fullResponse }];
            
            if (session) {
                onUpdate({ ...session, messages: updatedMessages });
            } else {
                const newSession: ChatSession = {
                    id: Date.now().toString(),
                    title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : ''),
                    messages: updatedMessages,
                    model: useProModel ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
                };
                onNewSession(newSession);
            }

        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
            setMessages(prev => prev.slice(0, -2)); // Remove user message and empty model message
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto pr-2 space-y-4 pb-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl p-3 rounded-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                            {msg.content}
                            {msg.role === 'model' && isLoading && index === messages.length - 1 && <span className="inline-block w-2 h-4 bg-white animate-pulse ms-1"></span>}
                        </div>
                    </div>
                ))}
                 {messages.length === 0 && (
                    <div className="text-center text-gray-500 pt-16">
                        <ChatIcon className="w-16 h-16 mx-auto mb-4" />
                        <p>چگونه می‌توانم کمکتان کنم؟</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {error && <ErrorDisplay message={error} />}
            <div className="pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between mb-2">
                     <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={useProModel}
                            onChange={e => handleModelChange(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2"
                        />
                        <span className="me-2">تحقیق عمیق</span>
                    </label>
                </div>
                 <p className="text-xs text-gray-500 mb-2 -mt-1">برای سوالات پیچیده که نیاز به استدلال بیشتری دارند، از مدل قدرتمندتر استفاده کنید.</p>
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="پیام خود را تایپ کنید..."
                        className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading || !input.trim()} className="p-3 bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                        {isLoading ? <Spinner className="w-6 h-6 animate-spin" /> : <SendIcon className="w-6 h-6" />}
                    </button>
                </form>
            </div>
        </div>
    );
});

const ImageGenerator = memo(() => {
    const [prompt, setPrompt] = usePersistentState('imageGenerator-prompt', '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedImage, setGeneratedImage] = useState<ImageData | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError("لطفاً یک فرمان متنی وارد کنید.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const newImage = await generateImageWithPrompt(prompt);
            setGeneratedImage(newImage);
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <FeatureHeader feature="generate" />
            <div className="space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="مثال: یک ربات که اسکیت‌بورد قرمز در دست دارد"
                    className="w-full h-24 p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    disabled={isLoading}
                />
                <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isLoading}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? <Spinner className="animate-spin -ms-1 me-3 h-5 w-5" /> : <SparklesIcon className="-ms-1 me-2 h-5 w-5" />}
                    {isLoading ? 'در حال ساخت...' : 'بساز'}
                </button>
                {error && <ErrorDisplay message={error} />}
                <div className="mt-6 flex items-center justify-center bg-gray-800/50 p-2 sm:p-4 rounded-xl min-h-[20rem] sm:min-h-[30rem] relative">
                    {generatedImage ? (
                        <img src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`} alt="Generated" className="rounded-lg object-contain max-h-[20rem] sm:max-h-[30rem] w-full" />
                    ) : (
                         <div className="text-gray-500">تصویر ساخته شده در اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="در حال ساخت تصویر شما..." />}
                </div>
            </div>
        </div>
    );
});

const ImageEditor = memo(() => {
    const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
    const [generatedImage, setGeneratedImage] = useState<ImageData | null>(null);
    const [prompt, setPrompt] = usePersistentState('imageEditor-prompt', '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImageSelect = useCallback((image: ImageData) => {
        setOriginalImage(image);
        setGeneratedImage(null);
        setError(null);
    }, []);

    const handleGenerate = async () => {
        const currentImage = generatedImage || originalImage;
        if (!currentImage || !prompt.trim()) {
            setError("لطفاً یک تصویر آپلود کرده و یک فرمان وارد کنید.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const newImage = await editImageWithPrompt(currentImage, prompt);
            setGeneratedImage(newImage);
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setOriginalImage(null);
        setGeneratedImage(null);
        setPrompt('');
        setIsLoading(false);
        setError(null);
    };

    return (
        <div>
            <FeatureHeader feature="edit" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    {!originalImage ? (
                        <ImageUploader onImageSelect={handleImageSelect} disabled={isLoading} />
                    ) : (
                        <div className="text-center text-sm text-green-400 p-4 bg-green-900/50 rounded-lg">
                            تصویر با موفقیت بارگذاری شد!
                        </div>
                    )}
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="مثال: یک افکت قدیمی به عکس اضافه کن"
                        className="w-full h-24 p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={!originalImage || isLoading}
                    />
                    <div className="flex gap-4">
                        <button onClick={handleGenerate} disabled={!prompt.trim() || !originalImage || isLoading} className="flex-grow inline-flex items-center justify-center px-6 py-3 border border-transparent font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                             {isLoading ? <Spinner className="animate-spin -ms-1 me-3 h-5 w-5" /> : <SparklesIcon className="-ms-1 me-2 h-5 w-5" />}
                             {isLoading ? 'در حال ویرایش...' : 'ویرایش کن'}
                        </button>
                        <button onClick={handleReset} className="px-6 py-3 border border-gray-600 font-medium rounded-md text-gray-300 hover:bg-gray-700">
                            شروع مجدد
                        </button>
                    </div>
                    {error && <ErrorDisplay message={error} />}
                </div>
                <div className="bg-gray-800/50 p-2 sm:p-4 rounded-xl flex items-center justify-center min-h-[20rem] sm:min-h-[30rem] relative">
                    {(generatedImage || originalImage) ? (
                        <img src={`data:${(generatedImage || originalImage)?.mimeType};base64,${(generatedImage || originalImage)?.base64}`} alt="Displayed" className="rounded-lg object-contain max-h-[20rem] sm:max-h-[30rem] w-full" />
                    ) : (
                        <div className="text-gray-500">تصویر شما اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="در حال ویرایش تصویر شما..." />}
                </div>
            </div>
        </div>
    );
});

const ImageAnalyzer = memo(() => {
    const [image, setImage] = useState<ImageData | null>(null);
    const [prompt, setPrompt] = usePersistentState('imageAnalyzer-prompt', 'این تصویر را توصیف کن.');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string>('');

    const handleAnalyze = async () => {
        if (!image || !prompt.trim()) {
            setError("لطفاً یک تصویر آپلود کرده و یک فرمان وارد کنید.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult('');
        try {
            const analysisResult = await analyzeImage(image, prompt);
            setResult(analysisResult);
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <FeatureHeader feature="analyze" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    {image ? (
                        <img src={`data:${image.mimeType};base64,${image.base64}`} alt="For analysis" className="rounded-lg object-contain max-h-[20rem] w-full" />
                    ) : (
                        <ImageUploader onImageSelect={setImage} disabled={isLoading} />
                    )}
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="فرمان خود را برای تحلیل وارد کنید"
                        className="w-full h-24 p-3 bg-gray-700 border border-gray-600 rounded-md"
                        disabled={!image || isLoading}
                    />
                    <button onClick={handleAnalyze} disabled={!image || !prompt.trim() || isLoading} className="w-full inline-flex items-center justify-center px-6 py-3 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isLoading ? <Spinner className="animate-spin me-3 h-5 w-5" /> : <AnalyzeIcon className="me-2 h-5 w-5" />}
                        {isLoading ? 'در حال تحلیل...' : 'تحلیل کن'}
                    </button>
                    {error && <ErrorDisplay message={error} />}
                </div>
                <div className="bg-gray-800/50 p-4 rounded-xl flex items-center justify-center min-h-[20rem] sm:min-h-[30rem] relative">
                    {result ? (
                        <div className="text-gray-200 p-4 whitespace-pre-wrap">{result}</div>
                    ) : (
                        <div className="text-gray-500">نتیجه تحلیل اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="در حال تحلیل تصویر..." />}
                </div>
            </div>
        </div>
    );
});

const VideoAnimator = memo(() => {
    const [image, setImage] = useState<ImageData | null>(null);
    const [prompt, setPrompt] = usePersistentState('videoAnimator-prompt', '');
    const [aspectRatio, setAspectRatio] = usePersistentState<'16:9' | '9:16'>('videoAnimator-aspectRatio', '16:9');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [apiKeySelected, setApiKeySelected] = useState(false);

    useEffect(() => {
        (window as any).aistudio?.hasSelectedApiKey().then((hasKey: boolean) => {
            setApiKeySelected(hasKey);
        });
    }, []);
    
    const handleSelectKey = async () => {
        await (window as any).aistudio?.openSelectKey();
        setApiKeySelected(true);
    };

    const handleAnimate = async () => {
        if (!image) {
            setError("لطفاً یک تصویر آپلود کنید.");
            return;
        }
        if (!apiKeySelected) {
            handleSelectKey();
            return;
        }

        setIsLoading(true);
        setError(null);
        setVideoUrl(null);
        try {
            const url = await animateImageWithVeo(image, prompt, aspectRatio);
            setVideoUrl(url);
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
             if (err.message?.includes('دوباره انتخاب کنید')) {
                setApiKeySelected(false);
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!apiKeySelected) {
        return (
            <div>
                <FeatureHeader feature="animate" />
                <div className="text-center p-8 bg-gray-800/50 rounded-lg">
                    <h3 className="text-xl font-semibold mb-4">نیاز به کلید API</h3>
                    <p className="text-gray-400 mb-6">برای استفاده از این قابلیت، باید یک کلید API از پروژه خود انتخاب کنید. استفاده از این سرویس ممکن است هزینه داشته باشد.</p>
                    <button onClick={handleSelectKey} className="px-6 py-3 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                        انتخاب کلید API
                    </button>
                    <p className="mt-4 text-xs text-gray-500">
                        برای اطلاعات بیشتر در مورد هزینه‌ها به <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">صفحه مستندات پرداخت</a> مراجعه کنید.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div>
            <FeatureHeader feature="animate" />
            <div className="space-y-4">
                {!image ? (
                    <ImageUploader onImageSelect={setImage} disabled={isLoading} />
                ) : (
                     <img src={`data:${image.mimeType};base64,${image.base64}`} alt="For animation" className="rounded-lg object-contain max-h-[20rem] w-full mx-auto" />
                )}
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="فرمان حرکت (اختیاری): مثال: گربه در حال رانندگی با سرعت بالا"
                    className="w-full h-24 p-3 bg-gray-700 border border-gray-600 rounded-md"
                    disabled={!image || isLoading}
                />
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-gray-300">نسبت تصویر:</span>
                    <button onClick={() => setAspectRatio('16:9')} className={`px-4 py-2 rounded-md ${aspectRatio === '16:9' ? 'bg-blue-600' : 'bg-gray-700'}`}>افقی (16:9)</button>
                    <button onClick={() => setAspectRatio('9:16')} className={`px-4 py-2 rounded-md ${aspectRatio === '9:16' ? 'bg-blue-600' : 'bg-gray-700'}`}>عمودی (9:16)</button>
                </div>

                <button onClick={handleAnimate} disabled={!image || isLoading} className="w-full inline-flex items-center justify-center px-6 py-3 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                    {isLoading ? <Spinner className="animate-spin me-3 h-5 w-5" /> : <VideoIcon className="me-2 h-5 w-5" />}
                    {isLoading ? 'در حال ساخت ویدیو...' : 'متحرک‌سازی کن'}
                </button>
                {error && <ErrorDisplay message={error} />}
                <div className="mt-6 flex items-center justify-center bg-gray-800/50 p-2 sm:p-4 rounded-xl min-h-[20rem] sm:min-h-[30rem] relative">
                    {videoUrl ? (
                        <video src={videoUrl} controls autoPlay loop className="rounded-lg object-contain max-h-[20rem] sm:max-h-[30rem] w-full" />
                    ) : (
                         <div className="text-gray-500">ویدیوی شما اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="ساخت ویدیو ممکن است چند دقیقه طول بکشد..." />}
                </div>
            </div>
        </div>
    );
});

const Search = memo(() => {
    const [prompt, setPrompt] = usePersistentState('search-prompt', '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ text: string; sources: Source[] } | null>(null);

    const handleSearch = async () => {
        if (!prompt.trim()) {
            setError("لطفاً یک سوال برای جستجو وارد کنید.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const searchResult = await searchWithGoogle(prompt);
            setResult(searchResult);
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <FeatureHeader feature="search" />
            <div className="space-y-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="مثال: چه کسی بیشترین مدال برنز را در المپیک پاریس ۲۰۲۴ برد؟"
                        className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md"
                        disabled={isLoading}
                    />
                    <button onClick={handleSearch} disabled={!prompt.trim() || isLoading} className="p-3 inline-flex items-center justify-center font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isLoading ? <Spinner className="w-6 h-6 animate-spin" /> : <SearchIcon className="w-6 h-6" />}
                    </button>
                </div>
                {error && <ErrorDisplay message={error} />}
                <div className="mt-6 bg-gray-800/50 p-4 rounded-xl min-h-[20rem] sm:min-h-[30rem] relative">
                    {result ? (
                        <div className="space-y-4">
                            <p className="text-gray-200 whitespace-pre-wrap">{result.text}</p>
                            {result.sources.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-gray-300 border-t border-gray-700 pt-4 mt-4">منابع:</h4>
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                        {result.sources.map((source, index) => (
                                            <li key={index}>
                                                <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                                    {source.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                         <div className="flex items-center justify-center h-full text-gray-500">نتیجه جستجو اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="در حال جستجو در وب..." />}
                </div>
            </div>
        </div>
    );
});

const GoldPriceViewer = memo(() => {
    const [prices, setPrices] = useState<GoldPriceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadPrices = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const priceData = await fetchGoldPrices();
            setPrices(priceData);
        } catch (err: any) {
            setError(err.message || 'خطا در دریافت اطلاعات.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPrices();
    }, [loadPrices]);

    return (
        <div>
            <FeatureHeader feature="gold" />
            {isLoading && !prices && (
                <div className="flex justify-center items-center h-64">
                    <Spinner className="w-12 h-12 animate-spin text-yellow-400" />
                </div>
            )}
            {error && <ErrorDisplay message={error} />}
            {prices && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800/70 p-6 rounded-xl border border-yellow-500/30">
                            <h3 className="text-lg font-semibold text-yellow-300">سکه امامی</h3>
                            <p className="text-3xl font-bold text-white mt-2">
                                {prices.sekehEmami.toLocaleString('fa-IR')}
                                <span className="text-base text-gray-400 ms-2">ریال</span>
                            </p>
                        </div>
                        <div className="bg-gray-800/70 p-6 rounded-xl border border-yellow-500/30">
                            <h3 className="text-lg font-semibold text-yellow-300">مثقال طلا</h3>
                            <p className="text-3xl font-bold text-white mt-2">
                                {prices.mesghal.toLocaleString('fa-IR')}
                                <span className="text-base text-gray-400 ms-2">ریال</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>آخرین بروزرسانی: {prices.lastUpdate}</span>
                        <button onClick={loadPrices} disabled={isLoading} className="inline-flex items-center px-4 py-2 border border-gray-600 font-medium rounded-md text-gray-300 hover:bg-gray-700 disabled:opacity-50">
                            {isLoading ? <Spinner className="animate-spin h-5 w-5" /> : 'بروزرسانی'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

const SpeechGenerator = memo(() => {
    const [prompt, setPrompt] = usePersistentState('speechGenerator-prompt', '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedAudio, setGeneratedAudio] = useState<string | null>(null); // base64 string
    const [isPlaying, setIsPlaying] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);

    // Audio decoding helpers
    const decodeBase64 = (base64: string): Uint8Array => {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    };

    const decodePcmData = async (data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> => {
        const dataInt16 = new Int16Array(data.buffer);
        const frameCount = dataInt16.length / 1; // Mono channel
        const buffer = ctx.createBuffer(1, frameCount, 24000); // 24000 sample rate for TTS
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i] / 32768.0;
        }
        return buffer;
    };
    
    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError("لطفاً متنی برای تبدیل به گفتار وارد کنید.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedAudio(null);
        if (isPlaying) stopAudio();

        try {
            const audioB64 = await generateSpeech(prompt);
            setGeneratedAudio(audioB64);
            audioBufferRef.current = null; // Clear previous buffer
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
        } finally {
            setIsLoading(false);
        }
    };

    const playAudio = async () => {
        if (!generatedAudio) return;

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;

        if (!audioBufferRef.current) {
            const decodedBytes = decodeBase64(generatedAudio);
            audioBufferRef.current = await decodePcmData(decodedBytes, ctx);
        }
        
        if (audioSourceRef.current) audioSourceRef.current.stop();

        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        source.onended = () => {
            setIsPlaying(false);
            audioSourceRef.current = null;
        };
        source.start(0);
        audioSourceRef.current = source;
        setIsPlaying(true);
    };

    const stopAudio = () => {
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
        }
    };

    const handlePlayToggle = () => {
        isPlaying ? stopAudio() : playAudio();
    };

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            audioSourceRef.current?.stop();
            audioContextRef.current?.close();
        };
    }, []);

    return (
        <div>
            <FeatureHeader feature="speech" />
            <div className="space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="مثال: سلام، به مجموعه ابزار جمینای خوش آمدید."
                    className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    disabled={isLoading}
                />
                <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isLoading}
                    className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? <Spinner className="animate-spin -ms-1 me-3 h-5 w-5" /> : <AudioSparkIcon className="-ms-1 me-2 h-5 w-5" />}
                    {isLoading ? 'در حال تولید...' : 'تبدیل به گفتار'}
                </button>
                {error && <ErrorDisplay message={error} />}
                <div className="mt-6 flex items-center justify-center bg-gray-800/50 p-4 rounded-xl min-h-[10rem] relative">
                    {generatedAudio ? (
                        <div className="flex flex-col items-center gap-4">
                            <p className="text-gray-300">صدا با موفقیت تولید شد.</p>
                            <button onClick={handlePlayToggle} className="p-4 bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
                                {isPlaying ? <StopIcon className="w-8 h-8 text-white" /> : <PlayIcon className="w-8 h-8 text-white" />}
                            </button>
                        </div>
                    ) : (
                         <div className="text-gray-500">فایل صوتی در اینجا نمایش داده می‌شود</div>
                    )}
                    {isLoading && <LoadingOverlay text="در حال تولید صدا..." />}
                </div>
            </div>
        </div>
    );
});


// --- Main App Component ---

const App: React.FC = () => {
    const [activeFeature, setActiveFeature] = useState<Feature>('chat');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    // Chat history state
    const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem('gemini-chat-history');
            if (savedHistory) {
                // Safely parse and validate history from localStorage to prevent type errors.
                const parsedHistory = JSON.parse(savedHistory);
                if (Array.isArray(parsedHistory)) {
                    const validHistory: ChatSession[] = parsedHistory.map(session => ({
                        ...session,
// FIX: Cast the object to ChatMessage to ensure correct type inference.
// The 'role' was being inferred as a generic 'string' from 'any',
// causing a type mismatch with the expected 'user' | 'model' literal type.
                        messages: Array.isArray(session.messages) ? session.messages.map((msg: any) => ({
                            content: msg.content || '',
                            role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
                        } as ChatMessage)).filter((msg: ChatMessage) => msg.content) : [],
                    }));
                    setChatHistory(validHistory);
                }
            }
        } catch (error) {
            console.error("Failed to load chat history from localStorage", error);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('gemini-chat-history', JSON.stringify(chatHistory));
        } catch (error) {
            console.error("Failed to save chat history to localStorage", error);
        }
    }, [chatHistory]);

    const handleNewChat = () => {
        setActiveFeature('chat');
        setActiveChatId(null);
        setIsSidebarOpen(false);
    };

    const handleSelectChat = (id: string) => {
        setActiveFeature('chat');
        setActiveChatId(id);
        setIsSidebarOpen(false);
    };

    const handleDeleteChat = (id: string) => {
        setChatHistory(prev => prev.filter(session => session.id !== id));
        if (activeChatId === id) {
            setActiveChatId(null);
        }
    };
    
    const handleAddNewSession = (newSession: ChatSession) => {
        setChatHistory(prev => [newSession, ...prev]);
        setActiveChatId(newSession.id);
    };

    const handleUpdateSession = (updatedSession: ChatSession) => {
        setChatHistory(prev => prev.map(session => session.id === updatedSession.id ? updatedSession : session));
    };

    const activeChatSession = chatHistory.find(session => session.id === activeChatId) || null;

    const renderFeature = () => {
        if (activeFeature === 'chat') {
            return <Chatbot session={activeChatSession} onUpdate={handleUpdateSession} onNewSession={handleAddNewSession} />;
        }
        switch (activeFeature) {
            case 'generate': return <ImageGenerator />;
            case 'edit': return <ImageEditor />;
            case 'analyze': return <ImageAnalyzer />;
            case 'animate': return <VideoAnimator />;
            case 'search': return <Search />;
            case 'gold': return <GoldPriceViewer />;
            case 'speech': return <SpeechGenerator />;
            default: return null;
        }
    };

    const SidebarContent = () => (
         <aside className="w-64 bg-gray-800/50 p-2 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 p-2">
                <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                    ابزار جمینای
                </h1>
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="mb-2 px-2">
                <button onClick={handleNewChat} className="w-full flex items-center p-2 rounded-md text-right transition-colors text-gray-200 border border-gray-600 hover:bg-gray-700">
                    <PlusIcon className="w-5 h-5 ms-2" />
                    <span>چت جدید</span>
                </button>
            </div>
            
            <nav className="flex-grow flex flex-col space-y-1 overflow-y-auto pr-1">
                <span className="px-3 pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase">ابزارها</span>
                {(Object.keys(featureConfig) as Feature[]).map(key => {
                    const IconComponent = featureConfig[key].icon;
                    return (
                        <button
                            key={key}
                            onClick={() => { setActiveFeature(key); setIsSidebarOpen(false); }}
                            className={`flex items-center p-2 rounded-md text-right transition-colors text-sm ${
                                activeFeature === key ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            <IconComponent className="w-5 h-5 ms-3" />
                            <span>{featureConfig[key].name}</span>
                        </button>
                    );
                })}
                 <span className="px-3 pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase">تاریخچه چت</span>
                 {chatHistory.map(session => (
                    <div key={session.id} className="group flex items-center">
                        <button
                            onClick={() => handleSelectChat(session.id)}
                            className={`flex-grow text-right p-2 rounded-md text-sm truncate ${activeFeature === 'chat' && activeChatId === session.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                        >
                            {session.title}
                        </button>
                        <button onClick={() => handleDeleteChat(session.id)} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}

            </nav>
        </aside>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex relative">
             {/* Mobile Sidebar */}
            <div className={`fixed inset-y-0 right-0 z-30 transform ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out md:hidden`}>
                <SidebarContent />
            </div>
            {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

            {/* Desktop Sidebar */}
            <div className="hidden md:flex md:flex-shrink-0">
                 <SidebarContent />
            </div>

            <main className="flex-1 p-4 sm:p-8 overflow-y-auto flex flex-col" style={{maxHeight: '100vh'}}>
                <header className="md:hidden flex items-center justify-between mb-4">
                     <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                        {featureConfig[activeFeature].name}
                    </h1>
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2">
                        <MenuIcon className="w-6 h-6" />
                    </button>
                </header>
                <div className="flex-grow" style={{ height: activeFeature === 'chat' ? 'calc(100% - 4rem)' : 'auto' }}>
                     {renderFeature()}
                </div>
                 <footer className="text-center text-xs text-gray-600 pt-8 pb-2">
                    ساخته شده توسط Muhammad Hardani
                </footer>
            </main>
        </div>
    );
};

export default App;