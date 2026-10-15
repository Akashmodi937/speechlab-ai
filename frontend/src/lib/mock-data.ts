export type TestRun = {
  id: string; title: string; language: string;
  status: "Completed" | "Needs review" | "Failed";
  wer: string; latency: string; createdAt: string; transcript: string;
};
export const testRuns: TestRun[] = [
  { id: "RUN-0248", title: "Customer support · 01", language: "Hindi + English", status: "Completed", wer: "8.4%", latency: "1.42 s", createdAt: "Today, 10:42 AM", transcript: "नमस्ते, मेरा order अभी तक deliver नहीं हुआ है. Can you please check the status?" },
  { id: "RUN-0247", title: "Marathi field recording", language: "Marathi", status: "Needs review", wer: "—", latency: "1.87 s", createdAt: "Today, 10:18 AM", transcript: "नमस्कार, मला माझ्या अर्जाची स्थिती तपासायची आहे." },
  { id: "RUN-0246", title: "Product feedback · 03", language: "English", status: "Completed", wer: "4.1%", latency: "0.96 s", createdAt: "Yesterday", transcript: "The new experience is much easier to use, especially on mobile." },
  { id: "RUN-0245", title: "Hindi short clip", language: "Hindi", status: "Failed", wer: "—", latency: "—", createdAt: "Yesterday", transcript: "The provider request failed. Retry this test after checking its configuration." },
];
export const languageOptions = [
  { value: "auto", label: "Auto detect (unknown)" },
  { value: "hi-IN", label: "Hindi (hi-IN)" },
  { value: "mr-IN", label: "Marathi (mr-IN)" },
  { value: "en-IN", label: "English - India (en-IN)" },
  { value: "as-IN", label: "Assamese (as-IN)" },
  { value: "bn-IN", label: "Bengali (bn-IN)" },
  { value: "brx-IN", label: "Bodo (brx-IN)" },
  { value: "doi-IN", label: "Dogri (doi-IN)" },
  { value: "gu-IN", label: "Gujarati (gu-IN)" },
  { value: "kn-IN", label: "Kannada (kn-IN)" },
  { value: "kok-IN", label: "Konkani (kok-IN)" },
  { value: "ks-IN", label: "Kashmiri (ks-IN)" },
  { value: "mai-IN", label: "Maithili (mai-IN)" },
  { value: "ml-IN", label: "Malayalam (ml-IN)" },
  { value: "mni-IN", label: "Manipuri (mni-IN)" },
  { value: "ne-IN", label: "Nepali (ne-IN)" },
  { value: "od-IN", label: "Odia (od-IN)" },
  { value: "pa-IN", label: "Punjabi (pa-IN)" },
  { value: "sa-IN", label: "Sanskrit (sa-IN)" },
  { value: "sat-IN", label: "Santali (sat-IN)" },
  { value: "sd-IN", label: "Sindhi (sd-IN)" },
  { value: "ta-IN", label: "Tamil (ta-IN)" },
  { value: "te-IN", label: "Telugu (te-IN)" },
  { value: "ur-IN", label: "Urdu (ur-IN)" },
];
export const sarvamModes = [
  { value: "transcribe", label: "Transcribe", detail: "Original language with formatting and number normalization" },
  { value: "translate", label: "Translate to English", detail: "Produces English text regardless of source language" },
  { value: "verbatim", label: "Verbatim", detail: "Word-for-word; preserves fillers and spoken numbers" },
  { value: "translit", label: "Transliteration", detail: "Roman/Latin script output" },
  { value: "codemix", label: "Code-mixed", detail: "English in Latin script, Indic words in native script" },
];
