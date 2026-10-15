"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, LoaderCircle, Volume2 } from "lucide-react";
import { featuredVoices, type VoiceUseCase } from "@/lib/featured-voices";

type TtsModel = {
  id: string;
  display_name: string;
  languages: string[];
  speakers: Record<string, string[]>;
  default_speakers: Record<string, string>;
  max_characters: number;
  pace_min: number;
  pace_max: number;
  supports_codec: boolean;
  supports_temperature: boolean;
  codecs: string[];
};

type TtsOptions = {
  models: TtsModel[];
  languages: string[];
  comparison_languages: string[];
};

type GeneratedAudio = {
  objectUrl: string;
  fileName: string;
  mimeType: string;
  model: string;
  speaker: string;
  language: string;
  settings: string[];
  latency: string | null;
};

type ModelResult = {
  status: "idle" | "pending" | "success" | "error";
  audio?: GeneratedAudio;
  error?: string;
};

const initialResult = (): ModelResult => ({ status: "idle" });
const codecExtensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/L16": "pcm",
};
const voiceUseCases: ("All" | VoiceUseCase)[] = [
  "All",
  "Companion",
  "Customer Support",
  "Narration",
  "News & Sports",
  "Educational",
];

export function TtsPanel({ apiBase }: { apiBase: string }) {
  const [options, setOptions] = useState<TtsOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState("bulbul:v4-flash");
  const [language, setLanguage] = useState("hi-IN");
  const [speaker, setSpeaker] = useState("");
  const [pace, setPace] = useState(1);
  const [codec, setCodec] = useState("mp3");
  const [temperature, setTemperature] = useState(0.6);
  const [results, setResults] = useState<Record<string, ModelResult>>({});
  const [comparisonRunning, setComparisonRunning] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState<"All" | VoiceUseCase>("All");
  const [copyStatus, setCopyStatus] = useState("");
  const submissionLock = useRef(false);
  const objectUrls = useRef<Set<string>>(new Set());
  const models = options?.models ?? [];
  const selectedModel = models.find((item) => item.id === modelId);
  const comparisonLanguages = options?.comparison_languages ?? [];
  const availableLanguages = selectedModel?.languages ?? [];
  const availableSpeakers = selectedModel?.speakers[language] ?? [];

  useEffect(() => {
    let active = true;
    void fetch(`${apiBase}/tts/options`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load TTS options (${response.status}).`);
        return response.json() as Promise<TtsOptions>;
      })
      .then((data) => {
        if (active) {
          setOptions(data);
          setModelId(data.models[0]?.id ?? "");
          setLanguage(data.comparison_languages[0] ?? data.languages[0] ?? "");
        }
      })
      .catch((error: unknown) => {
        if (active) setOptionsError(error instanceof Error ? error.message : "Could not load TTS options.");
      });
    return () => { active = false; };
  }, [apiBase]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!selectedModel) return;
    if (!selectedModel.languages.includes(language)) {
      setLanguage(selectedModel.languages[0] ?? "");
      return;
    }
    const voices = selectedModel.speakers[language] ?? [];
    if (!voices.includes(speaker)) {
      setSpeaker(selectedModel.default_speakers[language] ?? voices[0] ?? "");
    }
    setPace((current) => Math.min(selectedModel.pace_max, Math.max(selectedModel.pace_min, current)));
  }, [selectedModel, language, speaker]);

  const selectedMaxCharacters = selectedModel?.max_characters ?? 0;
  const comparisonModelIds = useMemo(
    () => options?.models.map((model) => model.id) ?? [],
    [options],
  );
  const isSelectedModelBusy = results[modelId]?.status === "pending";
  const isAnyModelBusy = Object.values(results).some((result) => result.status === "pending");
  const visibleFeaturedVoices = voiceFilter === "All"
    ? featuredVoices
    : featuredVoices.filter((voice) => voice.useCase === voiceFilter);

  async function copyText(value: string, description: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${description} copied.`);
    } catch {
      setCopyStatus(`Could not copy ${description.toLowerCase()}. Check clipboard permissions and try again.`);
    }
  }

  function selectFeaturedVoice(voice: (typeof featuredVoices)[number]) {
    setModelId(voice.model);
    setLanguage(voice.language);
    setSpeaker(voice.speaker);
    setCopyStatus(`${voice.name} selected.`);
  }

  function makeVoiceSnippet(voice: (typeof featuredVoices)[number]) {
    const payload = JSON.stringify({
      text: "Hello, how can I help you today?",
      model: voice.model,
      language_code: voice.language,
      speaker: voice.speaker,
      pace: 1,
      output_audio_codec: "mp3",
    });
    return [
      'curl.exe -X POST "http://localhost:8000/api/v1/tts/generate" `',
      '  -H "Content-Type: application/json" `',
      `  -d '${payload}' \``,
      '  --output featured-voice.mp3',
    ].join("\n");
  }

  function discardOldAudio(result: ModelResult | undefined) {
    if (result?.audio) {
      URL.revokeObjectURL(result.audio.objectUrl);
      objectUrls.current.delete(result.audio.objectUrl);
    }
  }

  function changeModel(nextModelId: string) {
    setModelId(nextModelId);
    const nextModel = models.find((item) => item.id === nextModelId);
    if (nextModel && !nextModel.languages.includes(language)) {
      setLanguage(nextModel.languages[0] ?? "");
    } else if (nextModel) {
      setSpeaker(nextModel.default_speakers[language] ?? nextModel.speakers[language]?.[0] ?? "");
      setPace((current) => Math.min(nextModel.pace_max, Math.max(nextModel.pace_min, current)));
    }
  }

  function getSettings(model: TtsModel, chosenPace: number, chosenCodec: string, useSelected: boolean) {
    const settings = [`Pace ${chosenPace.toFixed(1)}×`];
    if (model.supports_codec) settings.push(`Format ${chosenCodec.toUpperCase()}`);
    if (model.supports_temperature) {
      settings.push(`Temperature ${useSelected ? temperature : 0.6}`);
    }
    return settings;
  }

  async function requestAudio(model: TtsModel, chosenSpeaker: string, useSelected: boolean) {
    const chosenPace = useSelected ? pace : Math.min(2, Math.max(0.5, pace));
    const chosenCodec = model.supports_codec ? (useSelected ? codec : "mp3") : "";
    const payload: Record<string, string | number> = {
      text,
      model: model.id,
      language_code: language,
      speaker: chosenSpeaker,
      pace: chosenPace,
    };
    payload.output_audio_codec = chosenCodec;
    payload.temperature = useSelected ? temperature : 0.6;
    const response = await fetch(`${apiBase}/tts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        const data = await response.json() as { detail?: string };
        if (typeof data.detail === "string") message = data.detail;
      } catch { /* Use the HTTP status when the error body is not JSON. */ }
      throw new Error(message);
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    const blob = await response.blob();
    if (!blob.size) throw new Error("Sarvam returned an empty audio response.");
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.current.add(objectUrl);
    const responseModel = response.headers.get("x-tts-model") || model.id;
    const responseSpeaker = response.headers.get("x-tts-speaker") || chosenSpeaker;
    const responseLanguage = response.headers.get("x-tts-language") || language;
    const format = response.headers.get("x-tts-audio-format") || codecExtensions[mimeType] || "audio";
    const extension = format === "linear16" ? "pcm" : format;
    return {
      objectUrl,
      fileName: `${responseModel.split(":")[1].replaceAll(":", "-")}.${extension}`,
      mimeType,
      model: responseModel,
      speaker: responseSpeaker,
      language: responseLanguage,
      settings: getSettings(model, chosenPace, chosenCodec, useSelected),
      latency: response.headers.get("x-tts-latency-seconds"),
    } satisfies GeneratedAudio;
  }

  function setModelPending(targetModelId: string) {
    discardOldAudio(results[targetModelId]);
    setResults((current) => ({ ...current, [targetModelId]: { status: "pending" } }));
  }

  async function generateOne() {
    if (!selectedModel || !text.trim() || submissionLock.current || isAnyModelBusy) return;
    submissionLock.current = true;
    setModelPending(selectedModel.id);
    try {
      const audio = await requestAudio(selectedModel, speaker, true);
      setResults((current) => ({ ...current, [selectedModel.id]: { status: "success", audio } }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [selectedModel.id]: {
          status: "error",
          error: error instanceof Error ? error.message : "Audio generation failed.",
        },
      }));
    } finally {
      submissionLock.current = false;
    }
  }

  async function compareModels() {
    if (!options || !text.trim() || submissionLock.current || isAnyModelBusy) return;
    const comparisonModels = models.filter((model) => model.languages.includes(language));
    submissionLock.current = true;
    setComparisonRunning(true);
    comparisonModels.forEach((model) => discardOldAudio(results[model.id]));
    setResults((current) => ({
      ...current,
      ...Object.fromEntries(comparisonModels.map((model) => [model.id, { status: "pending" }])),
    }));
    try {
      await Promise.all(comparisonModels.map(async (model) => {
        const comparisonSpeaker = model.default_speakers[language];
        try {
          const audio = await requestAudio(model, comparisonSpeaker, false);
          setResults((current) => ({ ...current, [model.id]: { status: "success", audio } }));
        } catch (error) {
          setResults((current) => ({
            ...current,
            [model.id]: {
              status: "error",
              error: error instanceof Error ? error.message : "Audio generation failed.",
            },
          }));
        }
      }));
    } finally {
      submissionLock.current = false;
      setComparisonRunning(false);
    }
  }

  return <section className="mt-6 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
    <details>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-[#101828]">
        <Volume2 size={19} className="text-[#315efb}" /> Text-to-speech model testing
      </summary>
      <p className="mt-2 text-sm text-[#667085]">
        Generate one voice or compare independent outputs from the two supported Sarvam Bulbul models.
        The voices differ by model and are not a controlled voice-quality equivalence test.
      </p>
      {optionsError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{optionsError}</p>}
      {!options && !optionsError && <p className="mt-4 text-sm text-[#667085]">Loading supported models and voices…</p>}
      {options && <div className="mt-5">
        <section aria-labelledby="featured-voices-heading" className="mb-6 rounded-xl border border-[#e4e7ec] bg-[#fcfcfd] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="featured-voices-heading" className="text-base font-semibold text-[#101828]">Featured voices</h3>
              <p className="mt-1 max-w-2xl text-sm text-[#667085]">
                Start here if you are unsure which persona to pick. These 11 voices are hand-picked for common production use cases.
                Filter by use case, copy the exact <code className="rounded bg-white px-1 py-0.5 text-xs">speaker</code> value, or copy a ready-to-run snippet.
              </p>
            </div>
            <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#315efb]">11 curated</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter featured voices by use case">
            {voiceUseCases.map((useCase) => {
              const count = useCase === "All"
                ? featuredVoices.length
                : featuredVoices.filter((voice) => voice.useCase === useCase).length;
              return <button
                key={useCase}
                type="button"
                aria-pressed={voiceFilter === useCase}
                onClick={() => setVoiceFilter(useCase)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${voiceFilter === useCase ? "border-[#315efb] bg-[#315efb] text-white" : "border-[#d0d5dd] bg-white text-[#475467] hover:border-[#315efb]"}`}
              >
                {useCase} {count}
              </button>;
            })}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleFeaturedVoices.map((voice) => <article key={voice.speaker} className="min-w-0 rounded-lg border border-[#e4e7ec] bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-[#101828]">{voice.name}</h4>
                  <p className="mt-0.5 text-xs text-[#667085]">{voice.language} · {voice.useCase}</p>
                </div>
                <span className="shrink-0 rounded bg-[#f2f4f7] px-2 py-1 text-[10px] font-medium text-[#475467]">Bulbul v4 Flash</span>
              </div>
              <p className="mt-2 min-h-10 text-xs leading-5 text-[#667085]">{voice.description}</p>
              <code className="mt-2 block break-all rounded bg-[#f9fafb] px-2 py-1.5 text-xs text-[#344054]">{voice.speaker}</code>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => selectFeaturedVoice(voice)} className="rounded-md bg-[#315efb] px-2.5 py-1.5 text-xs font-semibold text-white">Use voice</button>
                <button type="button" onClick={() => void copyText(voice.speaker, "Speaker value")} className="inline-flex items-center gap-1 rounded-md border border-[#d0d5dd] px-2.5 py-1.5 text-xs font-medium text-[#344054]">
                  <Copy size={13} /> Copy speaker
                </button>
                <button type="button" onClick={() => void copyText(makeVoiceSnippet(voice), "Request snippet")} className="inline-flex items-center gap-1 rounded-md border border-[#d0d5dd] px-2.5 py-1.5 text-xs font-medium text-[#344054]">
                  <Copy size={13} /> Copy snippet
                </button>
              </div>
            </article>)}
          </div>
          {copyStatus && <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#475467]">
            {copyStatus.endsWith("copied.") && <Check size={14} className="text-green-700" />}
            {copyStatus}
          </p>}
        </section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="tts-text" className="mb-1.5 block text-sm font-medium">Text to synthesize</label>
            <textarea
              id="tts-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={selectedMaxCharacters}
              placeholder="Enter text for speech generation…"
              className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm"
            />
            <p className="mt-1 text-xs text-[#667085]">{text.length} / {selectedMaxCharacters} characters for the selected model.</p>
          </div>
          <div>
            <label htmlFor="tts-model" className="mb-1.5 block text-sm font-medium">TTS model</label>
            <select id="tts-model" value={modelId} onChange={(event) => changeModel(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm">
              {models.map((model) => <option key={model.id} value={model.id}>{model.display_name} ({model.id})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tts-language" className="mb-1.5 block text-sm font-medium">Language</label>
            <select id="tts-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm">
              {availableLanguages.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tts-speaker" className="mb-1.5 block text-sm font-medium">Speaker / voice</label>
            <select id="tts-speaker" value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm">
              {availableSpeakers.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tts-pace" className="mb-1.5 block text-sm font-medium">Pace: {pace.toFixed(1)}×</label>
            <input id="tts-pace" type="range" min={selectedModel?.pace_min} max={selectedModel?.pace_max} step="0.1" value={pace} onChange={(event) => setPace(Number(event.target.value))} className="w-full accent-[#315efb]" />
            <div className="flex justify-between text-xs text-[#667085]"><span>{selectedModel?.pace_min}×</span><span>{selectedModel?.pace_max}×</span></div>
          </div>
          {selectedModel?.supports_codec && <div>
            <label htmlFor="tts-codec" className="mb-1.5 block text-sm font-medium">Output audio format</label>
            <select id="tts-codec" value={codec} onChange={(event) => setCodec(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm">
              {selectedModel.codecs.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}
            </select>
          </div>}
          {selectedModel?.supports_temperature && <div>
            <label htmlFor="tts-temperature" className="mb-1.5 block text-sm font-medium">Temperature: {temperature.toFixed(2)}</label>
            <input id="tts-temperature" type="range" min="0.01" max="1" step="0.01" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} className="w-full accent-[#315efb]" />
          </div>}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void generateOne()} disabled={!text.trim() || text.length > selectedMaxCharacters || isSelectedModelBusy || isAnyModelBusy || comparisonRunning} className="rounded-lg bg-[#315efb] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {isSelectedModelBusy && !comparisonRunning ? "Generating…" : "Generate TTS"}
          </button>
          <button type="button" onClick={() => void compareModels()} disabled={!text.trim() || text.length > 2500 || comparisonRunning || isAnyModelBusy || !comparisonLanguages.includes(language)} className="rounded-lg border border-[#315efb] bg-white px-4 py-2.5 text-sm font-semibold text-[#315efb] disabled:cursor-not-allowed disabled:opacity-50">
            {comparisonRunning ? "Comparing models…" : "Compare TTS Models"}
          </button>
        </div>
        {!comparisonLanguages.includes(language) && <p className="mt-2 text-xs text-[#667085]">Comparison is available for languages supported by both models.</p>}
        {options && <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-[#344054]">Generated audio results</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {comparisonModelIds.map((id) => {
              const model = models.find((item) => item.id === id);
              const result = results[id] ?? initialResult();
              return <article key={id} className="min-w-0 rounded-xl border border-[#e4e7ec] bg-[#fcfcfd] p-4">
                <h4 className="break-words text-sm font-semibold text-[#101828]">{model?.display_name}</h4>
                <p className="mt-1 break-all text-xs text-[#667085]">{id}</p>
                <p className={`mt-3 text-xs font-medium ${result.status === "error" ? "text-red-700" : result.status === "success" ? "text-green-700" : "text-[#667085]"}`}>
                  {result.status === "pending" ? <span className="inline-flex items-center gap-1"><LoaderCircle size={14} className="animate-spin" /> Generating…</span> : result.status === "error" ? "Generation failed" : result.status === "success" ? "Ready" : "Not generated"}
                </p>
                {result.audio && <div className="mt-3">
                  <p className="break-all text-xs text-[#475467]">Voice: {result.audio.speaker} · Language: {result.audio.language}</p>
                  <p className="mt-1 text-xs text-[#667085]">{result.audio.settings.join(" · ")}</p>
                  {result.audio.latency && <p className="mt-1 text-xs text-[#667085]">Provider latency: {result.audio.latency}s</p>}
                  <audio controls preload="none" src={result.audio.objectUrl} className="mt-3 w-full" aria-label={`${id} generated speech`} />
                  <a href={result.audio.objectUrl} download={result.audio.fileName} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-medium text-[#344054]"><Download size={14} />Download {result.audio.fileName}</a>
                </div>}
                {result.error && <p role="alert" className="mt-2 break-words text-xs text-red-700">{result.error}</p>}
              </article>;
            })}
          </div>
        </div>}
      </div>}
    </details>
  </section>;
}
