import React, { useState } from "react";
import { Send, Menu, Bot } from "lucide-react";

export function AIOpsView() {
  const [messages, setMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([]);
  const [input, setInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userText = input.trim();
    setMessages(prev => [...prev, { sender: "user", text: userText }]);
    setInput("");

    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          sender: "bot",
          text: `AI Ops Assistant: Analyzing request "${userText}". All cluster nodes operating within normal power and thermal parameters.`
        }
      ]);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full">
      {/* Top Sub-tabs */}
      <div className="border-b border-slate-400 mb-2.5 flex items-center gap-2 pt-1 pb-0 shrink-0">
        <button className="px-5 py-2 text-xs font-bold border-t-2 border-t-blue-600 border-x border-x-slate-300 text-slate-900 bg-white rounded-t cursor-pointer shadow-xs z-10">
          Chat Bot
        </button>
      </div>

      {/* Main Chat Bot Canvas Card matching Image 3 */}
      <div className="flex-1 bg-white border border-slate-300 rounded-xl shadow-xs p-6 flex flex-col justify-between relative overflow-hidden">
        
        {/* Top left menu icon */}
        <div className="flex items-center gap-3 text-slate-600">
          <Menu className="w-5 h-5 cursor-pointer hover:text-slate-900" />
        </div>

        {/* Center Welcome Container or Message History */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto my-4 space-y-4 px-4">
          {messages.length === 0 ? (
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-normal text-slate-800 tracking-tight">
                Hello admin!
              </h2>
            </div>
          ) : (
            <div className="w-full max-w-2xl space-y-3">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-md px-4 py-2.5 rounded-2xl text-xs ${
                      m.sender === "user"
                        ? "bg-[#002f54] text-white font-medium"
                        : "bg-slate-100 text-slate-800 border border-slate-200"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Floating Chat Bar matching Image 3 */}
        <form onSubmit={handleSend} className="w-full max-w-3xl mx-auto relative">
          <div className="relative flex items-center bg-slate-50 border border-slate-300 rounded-full px-5 py-3 shadow-sm focus-within:border-[#002f54] focus-within:ring-1 focus-within:ring-[#002f54]">
            <input
              type="text"
              placeholder="Ask Chat Bot"
              value={input}
              onChange={e => setInput(e.target.value)}
              className="w-full bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none pr-10"
            />
            <button
              type="submit"
              className="absolute right-3 w-8 h-8 bg-[#364860] hover:bg-[#002f54] text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
