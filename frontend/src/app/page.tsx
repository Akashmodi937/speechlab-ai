"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioLines, Mic, Square, Upload } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TtsPanel } from "@/components/tts-panel";
import { languageOptions } from "@/lib/stt-options";

type Comparison = {
  cer_percent?: number | null;
  wer_percent?: number | null;
};

type ExternalComparison = {
  transcript?: string;
  comparison?: Comparison | null;
  product_vs_reference?: Comparison | null;
  detail?: string;
};

type Run = {
  [field: string]: unknown;
  run_id?: string;
  test_case_id?: string;
  status?: string;
  raw_transcript?: string;
  error?: string;
  detail?: string;
  keyterms?: string[];
  critical_terms?: string[];
  critical_term_accuracy?: string;
  critical_term_accuracy_other?: string;
  reference_comparison?: Comparison | null;
  external_comparison?: ExternalComparison | null;
};

function termAccuracy(transcript: string, terms: string[]) {
  if (!terms.length) return "—";
  const text = transcript.toLocaleLowerCase();
  const matched = terms.filter((term) => text.includes(term.toLocaleLowerCase())).length;
  return `${Math.round((matched / terms.length) * 100)}% (${matched}/${terms.length})`;
}

export default function Dashboard() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";
  const [runs, setRuns] = useState<Run[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState("auto");
  const [desiredOutput, setDesiredOutput] = useState("auto");
  const [verbatim, setVerbatim] = useState(false);
  const [translate, setTranslate] = useState(false);
  const [reference, setReference] = useState("");
  const [criticalTerms, setCriticalTerms] = useState("");
  const [otherTranscript, setOtherTranscript] = useState("");
  const [testCaseId, setTestCaseId] = useState(() => `STT-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [latest, setLatest] = useState<Run | null>(null);
  const [micRecording, setMicRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/audio-tests/runs?limit=100`, { cache: "no-store" });
      const data = await response.json() as { items?: Run[] };
      if (response.ok) setRuns(Array.isArray(data.items) ? data.items : []);
    } catch { /* Keep the form usable when history is unavailable. */ }
  }, [apiBase]);
  useEffect(() => { void refreshRuns(); }, [refreshRuns]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType });
        setFile(new File([audioBlob], "recording.webm", { type: audioBlob.type }));
        stream.getTracks().forEach((track) => track.stop());
        setMicRecording(false);
      };
      recorder.start(); setMediaRecorder(recorder); setMicRecording(true); setNotice("Recording from microphone…");
    } catch { setNotice("Microphone permission unavailable. Please upload an audio file instead."); }
  }

  async function runTest() {
    if (!file) { setNotice("Upload an audio file or record from the microphone first."); return; }
    const terms = criticalTerms.split("\n").map((term) => term.trim()).filter(Boolean);
    const uniqueTerms = [...new Set(terms)];
    if (uniqueTerms.length > 50 || uniqueTerms.some((term) => term.length > 64)) {
      setNotice("Add up to 50 unique critical terms; each term must be 64 characters or fewer."); return;
    }
    const mode = translate ? "translate" : verbatim ? "verbatim" : desiredOutput === "roman" ? "translit" : desiredOutput === "devanagari" ? "transcribe" : "codemix";
    const form = new FormData();
    form.append("file", file);
    form.append("language_code", lang);
    form.append("mode", mode);
    form.append("keyterms_json", JSON.stringify(uniqueTerms));
    form.append("reference_transcript", reference);
    form.append("test_case_id", testCaseId);
    form.append("desired_output", desiredOutput);
    form.append("verbatim", String(verbatim));
    form.append("translate", String(translate));
    form.append("with_timestamps", "false");
    form.append("input_audio_codec", "auto");
    setBusy(true); setNotice("Running Saaras v4 and calculating the comparison…"); setLatest(null);
    try {
      const response = await fetch(`${apiBase}/audio-tests/run`, { method: "POST", body: form });
      const data = await response.json() as Run;
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Request failed (${response.status})`);
      let completed: Run = { ...data, critical_terms: uniqueTerms, critical_term_accuracy: termAccuracy(String(data.raw_transcript || ""), uniqueTerms) };
      if (data.status === "success" && data.run_id && otherTranscript.trim()) {
        const compareResponse = await fetch(`${apiBase}/audio-tests/${encodeURIComponent(String(data.run_id))}/compare-external`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "Other Whisper response", model: "Whisper", transcript: otherTranscript.trim() })
        });
        const compareData = await compareResponse.json() as ExternalComparison;
        if (compareResponse.ok) completed = { ...completed, external_comparison: compareData, critical_term_accuracy_other: termAccuracy(otherTranscript, uniqueTerms) };
        else setNotice(`Audio transcribed, but Whisper comparison failed: ${compareData.detail || compareResponse.status}`);
      }
      setLatest(completed);
      setRuns((previous) => [completed, ...previous.filter((item) => item.run_id !== completed.run_id)]);
      if (data.status === "success") setNotice("Test complete.");
      else setNotice(String(data.error || "The transcription provider returned an error."));
      void refreshRuns();
      setTestCaseId(`STT-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not run the test. Check the backend connection."); }
    finally { setBusy(false); }
  }

  function openSidebar(label: string) {
    if (label === "Run history") document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    else if (label === "Help") window.open(`${apiBase.split("/api/v1")[0]}/docs`, "_blank", "noopener,noreferrer");
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className="min-h-screen bg-[#f7f8fa]">
    <Sidebar onNavigate={openSidebar} onSettings={() => window.open(`${apiBase.split("/api/v1")[0]}/docs`, "_blank", "noopener,noreferrer")} />
    <main className="min-h-screen px-4 py-6 lg:ml-[236px] sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs text-[#667085]">SpeechLab AI</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#101828]">STT Test Run</h1><p className="mt-1 text-sm text-[#667085]">One simple form. One four-column report.</p></div>
          <a href={`${apiBase}/audio-tests/export.xlsx`} download className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#344054]">Export Excel</a>
        </header>

        <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-2"><AudioLines size={19} className="text-[#315efb]"/><h2 className="text-base font-semibold">Audio test inputs</h2></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium">Audio</label><div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[#cbd5e1] bg-[#fafbfc] p-4"><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium"><Upload size={16}/>Upload audio<input type="file" accept="audio/*,.pcm" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] || null); setNotice(""); }}/></label><button type="button" onClick={() => micRecording ? mediaRecorder?.stop() : void startRecording()} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${micRecording ? "bg-red-600 text-white" : "border border-[#d0d5dd] bg-white text-[#344054]"}`}>{micRecording ? <><Square size={14}/>Stop recording</> : <><Mic size={16}/>Record microphone</>}</button><span className="min-w-0 break-all text-sm text-[#667085]">{file?.name || "No audio selected"}</span></div></div>
            <div><label className="mb-1.5 block text-sm font-medium">Test case ID</label><input value={testCaseId} readOnly className="h-10 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"/></div>
            <div><label className="mb-1.5 block text-sm font-medium">Input language mode</label><select value={lang} onChange={(event) => setLang(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm">{languageOptions.filter((item) => ["auto", "hi-IN", "en-IN", "mr-IN"].includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="mb-1.5 block text-sm font-medium">Desired output</label><select value={desiredOutput} onChange={(event) => setDesiredOutput(event.target.value)} className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm"><option value="auto">Auto — mixed script (Hindi/Marathi Devanagari, English Roman)</option><option value="devanagari">Devanagari</option><option value="roman">Roman / Latin</option></select></div>
            <div className="flex flex-wrap items-center gap-5 pt-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verbatim} onChange={(event) => setVerbatim(event.target.checked)} />Verbatim</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={translate} onChange={(event) => setTranslate(event.target.checked)} />Translate to English</label></div>
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium">Reference transcript</label><textarea value={reference} onChange={(event) => setReference(event.target.value)} rows={3} placeholder="Paste the verified reference transcript (optional)…" className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm"/></div>
            <div><label className="mb-1.5 block text-sm font-medium">Critical terms to preserve</label><textarea value={criticalTerms} onChange={(event) => setCriticalTerms(event.target.value)} rows={3} placeholder={'One term per line\nCase number, party names, legal terms…'} className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm"/><p className="mt-1 text-xs text-[#667085]">Terms are passed to Saaras as keyterms and checked in the transcript.</p></div>
            <div><label className="mb-1.5 block text-sm font-medium">Other Whisper response</label><textarea value={otherTranscript} onChange={(event) => setOtherTranscript(event.target.value)} rows={3} placeholder="Paste Whisper's transcript for the same audio (optional)…" className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2.5 text-sm"/></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={runTest} disabled={busy || micRecording} className="rounded-lg bg-[#315efb] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Running STT…" : "Run STT"}</button>{notice && <p className="text-sm text-[#475467]">{notice}</p>}</div>
        </section>

        <TtsPanel apiBase={apiBase} />

        <section id="results" className="mt-6 overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] px-5 py-4"><h2 className="text-base font-semibold">Results</h2><p className="mt-1 text-xs text-[#667085]">Only the four requested columns.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f9fafb] text-xs uppercase tracking-wide text-[#667085]"><tr><th className="px-4 py-3 font-semibold">Test case ID</th><th className="px-4 py-3 font-semibold">Raw Sarvam transcript</th><th className="px-4 py-3 font-semibold">CER / WER</th><th className="px-4 py-3 font-semibold">Critical-term accuracy</th></tr></thead><tbody>
            {(latest ? [latest, ...runs.filter((item) => item.run_id !== latest.run_id)] : runs).map((run) => {
              const referenceMetrics = run.reference_comparison;
              const external = run.external_comparison;
              const externalMetrics = external?.comparison;
              const metrics = referenceMetrics || externalMetrics;
              const accuracy = run.critical_term_accuracy || termAccuracy(String(run.raw_transcript || ""), Array.isArray(run.keyterms) ? run.keyterms : Array.isArray(run.critical_terms) ? run.critical_terms : []);
              return <tr key={String(run.run_id)} className="border-t border-[#eaecf0] align-top"><td className="px-4 py-3 font-medium text-[#344054]">{String(run.test_case_id || "—")}<div className="mt-1 text-xs font-normal text-[#98a2b3]">{String(run.status || "")}</div></td><td className="max-w-[440px] whitespace-pre-wrap px-4 py-3 text-[#344054]">{String(run.raw_transcript || run.error || "—")}{external?.transcript && <div className="mt-3 border-t border-[#eaecf0] pt-2 text-xs text-[#667085]"><b>Whisper:</b> {String(external.transcript)}</div>}</td><td className="whitespace-nowrap px-4 py-3 text-[#344054]">{metrics ? <>{metrics.cer_percent ?? "—"}% / {metrics.wer_percent ?? "—"}%<div className="mt-1 text-xs text-[#667085]">{referenceMetrics ? "vs reference" : "Sarvam vs Whisper"}</div>{external?.product_vs_reference && <div className="mt-1 text-xs text-[#667085]">Whisper vs ref: {String(external.product_vs_reference.cer_percent ?? "—")}% / {String(external.product_vs_reference.wer_percent ?? "—")}%</div>}</> : "Add reference transcript"}</td><td className="px-4 py-3 text-[#344054]">{String(accuracy)}{run.critical_term_accuracy_other && <div className="mt-1 text-xs text-[#667085]">Whisper: {String(run.critical_term_accuracy_other)}</div>}</td></tr>;
            })}
            {!runs.length && !latest && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[#667085]">No test runs yet. Add audio above and select Run test.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </main>
  </div>;
}
