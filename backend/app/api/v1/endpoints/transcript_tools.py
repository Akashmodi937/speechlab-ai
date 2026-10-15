import re, time
from difflib import SequenceMatcher
from typing import Literal
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.core.config import settings

router = APIRouter(prefix="/transcripts", tags=["Transcript tools"])
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

class ScriptTransformRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=30000)
    language: Literal["hi", "mr"] = "hi"
    output_script: Literal["devanagari", "roman"] = "devanagari"
    protected_terms: list[str] = Field(default_factory=list, max_length=50)

class CompareRequest(BaseModel):
    reference_text: str = Field(min_length=1, max_length=30000)
    hypothesis_text: str = Field(min_length=1, max_length=30000)

def distance(a, b):
    prev = list(range(len(b)+1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(cur[-1]+1, prev[j]+1, prev[j-1]+(x != y)))
        prev = cur
    return prev[-1]

def normalize(value):
    return " ".join(re.sub(r"[^\w\s]", " ", value.casefold(), flags=re.UNICODE).split())

@router.post("/convert-script")
async def convert_script(body: ScriptTransformRequest):
    if not settings.gemini_api_key:
        raise HTTPException(503, "GEMINI_API_KEY is not configured on the backend.")
    if any(not x.strip() for x in body.protected_terms) or len(set(body.protected_terms)) != len(body.protected_terms):
        raise HTTPException(422, "Protected terms must be non-empty and unique.")
    language = "Hindi" if body.language == "hi" else "Marathi"
    task = ("Write in Devanagari script" if body.output_script == "devanagari"
            else "Romanize/transliterate into readable Latin script")
    protected = "\n".join("- " + x for x in body.protected_terms) or "(none)"
    prompt = (
        "You are a careful transcript script converter.\n"
        f"Language: {language}. Task: {task}.\n"
        "Do NOT translate into another language. Do not summarize, paraphrase, correct grammar, or add words. "
        "Keep code-switched English phrases in their original English spelling and case. "
        "Preserve every protected term exactly as supplied, including script and spelling; do not translate or transliterate it. "
        "Preserve numbers, names, punctuation and sentence order. Return only the converted transcript.\n"
        f"Protected terms:\n{protected}\nTranscript:\n{body.transcript}"
    )
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                GEMINI_URL.format(model=settings.gemini_model),
                params={"key": settings.gemini_api_key},
                json={"contents":[{"parts":[{"text":prompt}]}],
                      "generationConfig":{"temperature":0,"maxOutputTokens":8192}}
            )
        response.raise_for_status()
        payload = response.json()
        converted = "".join(p.get("text","") for p in payload.get("candidates",[{}])[0].get("content",{}).get("parts",[])).strip()
        if not converted:
            raise HTTPException(502, "Gemini returned an empty transcript.")
        usage = payload.get("usageMetadata", {})
        return {"converted_text":converted,"language":body.language,"output_script":body.output_script,
                "model":settings.gemini_model,"latency_seconds":round(time.perf_counter()-started,3),
                "input_tokens":usage.get("promptTokenCount"),"output_tokens":usage.get("candidatesTokenCount"),
                "protected_terms":body.protected_terms}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Gemini request failed ({exc.response.status_code}): {exc.response.text[:1000]}")
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Gemini request failed: {type(exc).__name__}")

def compare_text_values(reference_text: str, hypothesis_text: str) -> dict:
    ref, hyp = normalize(reference_text), normalize(hypothesis_text)
    rw, hw = ref.split(), hyp.split()
    rc, hc = list(ref.replace(" ", "")), list(hyp.replace(" ", ""))
    if not rw or not rc:
        raise HTTPException(422, "Reference text must contain comparable characters.")
    we, ce = distance(rw, hw), distance(rc, hc)
    matcher = SequenceMatcher(a=rw, b=hw, autojunk=False)
    word_differences = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        word_differences.append({
            "type": {"replace": "different", "delete": "missing_from_hypothesis",
                     "insert": "extra_in_hypothesis"}[tag],
            "reference": " ".join(rw[i1:i2]),
            "hypothesis": " ".join(hw[j1:j2]),
            "reference_word_start": i1,
            "hypothesis_word_start": j1,
        })
        if len(word_differences) >= 200:
            break
    matched_words = sum(j2 - j1 for tag, i1, i2, j1, j2 in matcher.get_opcodes() if tag == "equal")
    return {"reference_word_count": len(rw), "hypothesis_word_count": len(hw),
            "matched_words": matched_words, "word_differences": word_differences,
            "word_differences_truncated": len(word_differences) >= 200,
            "word_edits": we, "wer": round(we / len(rw), 6), "wer_percent": round(100 * we / len(rw), 2),
            "reference_character_count": len(rc), "hypothesis_character_count": len(hc),
            "character_edits": ce, "cer": round(ce / len(rc), 6), "cer_percent": round(100 * ce / len(rc), 2),
            "note": "WER/CER measure text mismatch, not semantic quality. Compare the same language and script."}

@router.post("/compare")
async def compare_text(body: CompareRequest):
    return compare_text_values(body.reference_text, body.hypothesis_text)
