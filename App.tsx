import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { editImageWithPrompt, generateImageWithPrompt, analyzeImage, searchWithGoogle, animateImageWithVeo } from './services/geminiService';
import type { ImageData, ChatMessage, Source } from './types';
import { UploadIcon, SparklesIcon, Spinner, ExclamationIcon, ChatIcon, GenerateIcon, EditIcon, AnalyzeIcon, VideoIcon, SearchIcon, SendIcon } from './components/IconComponents';

type Feature = 'chat' | 'generate' | 'edit' | 'analyze' | 'animate' | 'search';

const featureConfig: Record<Feature, { name: string; icon: React.FC<{className?: string}>; description: string }> = {
  chat: { name: 'چت‌بات', icon: ChatIcon, description: 'با هوش مصنوعی گفتگو کنید.' },
  generate: { name: 'خالق تصویر', icon: GenerateIcon, description: 'با یک فرمان متنی، تصویر بسازید.' },
  edit: { name: 'ویرایشگر تصویر', icon: EditIcon, description: 'تصاویر خود را با هوش مصنوعی ویرایش کنید.' },
  analyze: { name: 'تحلیلگر تصویر', icon: AnalyzeIcon, description: 'یک تصویر را برای تحلیل آپلود کنید.' },
  animate: { name: 'انیماتور ویدیو', icon: VideoIcon, description: 'تصویر خود را به یک ویدیو تبدیل کنید.' },
  search: { name: 'جستجوی وب', icon: SearchIcon, description: 'پاسخ‌های به‌روز از وب دریافت کنید.' },
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

const Chatbot = memo(() => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [useProModel, setUseProModel] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const initializeChat = useCallback(async () => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const model = useProModel ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
            const config = useProModel ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
            const newChat = ai.chats.create({ model, config });
            setChat(newChat);
            setMessages([]);
            setError(null);
        } catch (err) {
            setError('خطا در راه‌اندازی چت.');
        }
    }, [useProModel]);

    useEffect(() => {
        initializeChat();
    }, [initializeChat]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading || !chat) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage, { role: 'model', content: '' }]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            const stream = await chat.sendMessageStream({ message: input });
            for await (const chunk of stream) {
                const chunkText = chunk.text;
                setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage.role === 'model') {
                        return [...prev.slice(0, -1), { ...lastMessage, content: lastMessage.content + chunkText }];
                    }
                    return prev;
                });
            }
        } catch (err: any) {
            setError(err.message || 'خطای غیرمنتظره‌ای رخ داد.');
            setMessages(prev => prev.slice(0, -1)); // Remove empty model message on error
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <FeatureHeader feature="chat" />
            <div className="flex-grow overflow-y-auto pr-2 space-y-4 pb-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl p-3 rounded-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                            {msg.content}
                            {msg.role === 'model' && isLoading && index === messages.length - 1 && <span className="inline-block w-2 h-4 bg-white animate-pulse ms-1"></span>}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            {error && <ErrorDisplay message={error} />}
            <div className="pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between mb-2">
                     <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={useProModel}
                            onChange={e => setUseProModel(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2"
                        />
                        <span className="me-2">استفاده از حالت تفکر پیشرفته (Pro)</span>
                    </label>
                </div>
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="پیام خود را تایپ کنید..."
                        className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading || !input.trim()} className="p-3 bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                        {isLoading ? <Spinner className="w-6 h-6 animate-spin" /> : <SendIcon className="w-6 h-6" />}
                    </button>
                </form>
            </div>
        </div>
    );
});

const ImageGenerator = memo(() => {
    const [prompt, setPrompt] = useState('');
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
                <div className="mt-6 flex items-center justify-center bg-gray-800/50 p-4 rounded-xl min-h-[30rem] relative">
                    {generatedImage ? (
                        <img src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`} alt="Generated" className="rounded-lg object-contain max-h-[30rem] w-full" />
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
    const [prompt, setPrompt] = useState('');
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
                <div className="bg-gray-800/50 p-4 rounded-xl flex items-center justify-center min-h-[30rem] relative">
                    {(generatedImage || originalImage) ? (
                        <img src={`data:${(generatedImage || originalImage)?.mimeType};base64,${(generatedImage || originalImage)?.base64}`} alt="Displayed" className="rounded-lg object-contain max-h-[30rem] w-full" />
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
    const [prompt, setPrompt] = useState('این تصویر را توصیف کن.');
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
                <div className="bg-gray-800/50 p-4 rounded-xl flex items-center justify-center min-h-[30rem] relative">
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
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
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
                <div className="flex items-center gap-4">
                    <span className="text-gray-300">نسبت تصویر:</span>
                    <button onClick={() => setAspectRatio('16:9')} className={`px-4 py-2 rounded-md ${aspectRatio === '16:9' ? 'bg-blue-600' : 'bg-gray-700'}`}>افقی (16:9)</button>
                    <button onClick={() => setAspectRatio('9:16')} className={`px-4 py-2 rounded-md ${aspectRatio === '9:16' ? 'bg-blue-600' : 'bg-gray-700'}`}>عمودی (9:16)</button>
                </div>

                <button onClick={handleAnimate} disabled={!image || isLoading} className="w-full inline-flex items-center justify-center px-6 py-3 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                    {isLoading ? <Spinner className="animate-spin me-3 h-5 w-5" /> : <VideoIcon className="me-2 h-5 w-5" />}
                    {isLoading ? 'در حال ساخت ویدیو...' : 'متحرک‌سازی کن'}
                </button>
                {error && <ErrorDisplay message={error} />}
                <div className="mt-6 flex items-center justify-center bg-gray-800/50 p-4 rounded-xl min-h-[30rem] relative">
                    {videoUrl ? (
                        <video src={videoUrl} controls autoPlay loop className="rounded-lg object-contain max-h-[30rem] w-full" />
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
    const [prompt, setPrompt] = useState('');
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
                <div className="mt-6 bg-gray-800/50 p-4 rounded-xl min-h-[30rem] relative">
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


// --- Main App Component ---

const App: React.FC = () => {
    const [activeFeature, setActiveFeature] = useState<Feature>('chat');

    const renderFeature = () => {
        switch (activeFeature) {
            case 'chat': return <Chatbot />;
            case 'generate': return <ImageGenerator />;
            case 'edit': return <ImageEditor />;
            case 'analyze': return <ImageAnalyzer />;
            case 'animate': return <VideoAnimator />;
            case 'search': return <Search />;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex">
            <aside className="w-64 bg-gray-800/50 p-4 flex flex-col">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                        ابزار جمینای
                    </h1>
                </div>
                <nav className="flex flex-col space-y-2">
                    {/* FIX: In JSX, component names must start with a capital letter.
                        Assigning the icon component to a capitalized variable `IconComponent` fixes the issue where JSX was interpreting the lowercase `featureConfig` as an HTML tag. */}
                    {(Object.keys(featureConfig) as Feature[]).map(key => {
                        const IconComponent = featureConfig[key].icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveFeature(key)}
                                className={`flex items-center p-3 rounded-md text-right transition-colors ${
                                    activeFeature === key ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                <IconComponent className="w-5 h-5 ms-3" />
                                <span>{featureConfig[key].name}</span>
                            </button>
                        );
                    })}
                </nav>
            </aside>
            <main className="flex-1 p-8 overflow-y-auto" style={{maxHeight: '100vh'}}>
                {renderFeature()}
            </main>
        </div>
    );
};

export default App;
