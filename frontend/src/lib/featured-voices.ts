export type VoiceUseCase =
  | "Companion"
  | "Customer Support"
  | "Narration"
  | "News & Sports"
  | "Educational";

export type FeaturedVoice = {
  name: string;
  speaker: string;
  language: string;
  model: string;
  useCase: VoiceUseCase;
  description: string;
};

export const featuredVoices: FeaturedVoice[] = [
  {
    name: "Bhavik",
    speaker: "bhavik_gu_conversation",
    language: "gu-IN",
    model: "bulbul:v4-flash",
    useCase: "Companion",
    description: "Natural conversational Gujarati for friendly, everyday exchanges.",
  },
  {
    name: "Chaitra",
    speaker: "chaitra_kn_conversation",
    language: "kn-IN",
    model: "bulbul:v4-flash",
    useCase: "Companion",
    description: "An easygoing Kannada voice for helpful, human-sounding conversations.",
  },
  {
    name: "Ishita",
    speaker: "ishita_mr_conversational",
    language: "mr-IN",
    model: "bulbul:v4-flash",
    useCase: "Companion",
    description: "A warm Marathi conversational voice for daily interactions.",
  },
  {
    name: "Anand",
    speaker: "anand_pa_conversation",
    language: "pa-IN",
    model: "bulbul:v4-flash",
    useCase: "Companion",
    description: "A relaxed Punjabi voice for natural, welcoming conversations.",
  },
  {
    name: "Kavitha",
    speaker: "kavitha_te_conversation",
    language: "te-IN",
    model: "bulbul:v4-flash",
    useCase: "Companion",
    description: "A clear Telugu conversational voice with a friendly tone.",
  },
  {
    name: "Ritu",
    speaker: "ritu_hi_customer",
    language: "hi-IN",
    model: "bulbul:v4-flash",
    useCase: "Customer Support",
    description: "A reassuring Hindi voice for support flows and service updates.",
  },
  {
    name: "Ishita",
    speaker: "ishita_en_customer",
    language: "en-IN",
    model: "bulbul:v4-flash",
    useCase: "Customer Support",
    description: "A helpful English voice for clear, friendly customer assistance.",
  },
  {
    name: "Pooja",
    speaker: "pooja_gu_customer",
    language: "gu-IN",
    model: "bulbul:v4-flash",
    useCase: "Customer Support",
    description: "A composed Gujarati voice for customer care and response prompts.",
  },
  {
    name: "Mrunal",
    speaker: "mrunal_mr_narration",
    language: "mr-IN",
    model: "bulbul:v4-flash",
    useCase: "Narration",
    description: "A steady Marathi narration voice for stories and long-form listening.",
  },
  {
    name: "Bimal",
    speaker: "bimal_bn_suspense",
    language: "bn-IN",
    model: "bulbul:v4-flash",
    useCase: "News & Sports",
    description: "An expressive Bengali voice for energetic updates and match recaps.",
  },
  {
    name: "Shubh",
    speaker: "shubh_hi_devotional",
    language: "hi-IN",
    model: "bulbul:v4-flash",
    useCase: "Educational",
    description: "A measured Hindi delivery for guided lessons and devotional learning.",
  },
];
