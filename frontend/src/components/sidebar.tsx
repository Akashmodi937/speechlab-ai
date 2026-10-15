"use client";
import { AudioLines, CircleHelp, History, LayoutDashboard, Settings2, SlidersHorizontal, Waves } from "lucide-react";

type SidebarProps = {
  onNavigate?: (label: string) => void;
  onSettings?: () => void;
};

const items = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Audio test studio", icon: AudioLines },
  { label: "Run history", icon: History },
];

export function Sidebar({ onNavigate, onSettings }: SidebarProps) {
  return <aside className="fixed inset-y-0 left-0 z-20 hidden w-[236px] flex-col border-r border-[#e7eaf0] bg-white lg:flex">
    <div className="flex h-[72px] items-center gap-3 border-b border-[#eef0f4] px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#315efb] text-white"><Waves size={20}/></div>
      <div><div className="text-[15px] font-bold">SpeechLab <span className="text-[#315efb]">AI</span></div><div className="mt-0.5 text-[10px] uppercase tracking-[1.5px] text-[#98a2b3]">Testing workspace</div></div>
    </div>
    <div className="px-3 pt-6">
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#98a2b3]">Workspace</div>
      <nav className="space-y-1">{items.map(({label,icon:Icon}) => <button key={label} onClick={() => onNavigate?.(label)} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-[#667085] hover:bg-[#f7f8fa]"><Icon size={17}/>{label}</button>)}</nav>
    </div>
    <div className="mt-8 px-3">
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#98a2b3]">Configuration</div>
      <button onClick={onSettings} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] text-[#667085] hover:bg-[#f7f8fa]"><SlidersHorizontal size={17}/>Providers & models</button>
      <button onClick={onSettings} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] text-[#667085] hover:bg-[#f7f8fa]"><Settings2 size={17}/>Settings & API status</button>
    </div>
    <div className="mt-auto p-3">
      <div className="rounded-xl border border-[#e7eaf0] bg-[#fafbfc] p-3.5"><div className="flex items-center gap-2 text-[12px] font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Connected workspace</div><p className="mt-2 text-[11px] leading-5 text-[#667085]">Run history, transcripts and comparisons use the configured backend store.</p></div>
      <button onClick={() => onNavigate?.("Help")} className="mt-3 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[12px] text-[#667085] hover:bg-[#f7f8fa]"><CircleHelp size={16}/>Help & API docs</button>
    </div>
  </aside>;
}
