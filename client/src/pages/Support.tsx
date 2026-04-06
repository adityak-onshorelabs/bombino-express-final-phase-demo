import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Send,
  Loader2,
  Package,
  Calculator,
  HelpCircle,
  MessageCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import biaOrbGif from "@assets/bia-orb.gif";

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  { label: "Track a shipment", icon: Package },
  { label: "Get shipping rates", icon: Calculator },
  { label: "How do I ship?", icon: HelpCircle },
  { label: "Contact support", icon: MessageCircle },
] as const;

const GENERIC_ERROR =
  "Something went wrong. Please try again or contact support from the app menu.";

export default function Support() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessages = async (nextMessages: ChatMessage[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/support/chat", {
        messages: nextMessages,
      });
      const data = (await res.json()) as { message?: string };
      const text =
        typeof data?.message === "string"
          ? data.message
          : GENERIC_ERROR;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: text },
      ]);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    sendMessages(nextMessages);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (loading) return;
    const userMessage: ChatMessage = { role: "user", content: prompt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    sendMessages(nextMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div
      className="flex flex-col min-h-screen safe-top safe-bottom relative overflow-hidden"
      data-testid="screen-support"
    >
      {/* Dark AI background: gradient + grid + glow + specks */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1b1e] via-[#151618] to-[#0f1012]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div
            className="w-[min(85vw,440px)] h-[min(85vw,440px)] rounded-full opacity-[0.07] blur-[100px]"
            style={{
              background: "radial-gradient(circle, rgba(198,40,40,.4) 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="absolute w-0.5 h-0.5 rounded-full bg-white opacity-[0.10]"
              style={{
                left: `${15 + (i * 7) % 70}%`,
                top: `${10 + (i * 11) % 80}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Minimal top: back + BIA + tagline */}
      <div className="shrink-0 px-4 pt-4 pb-2 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/home")}
            className="p-2 -ml-2 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-lg text-white tracking-tight">
              BIA
            </h1>
            <p className="text-xs text-white/50">
              Tracking, rates, and shipping help
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable content: empty state or messages — transparent so dark AI background stays visible */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 max-w-md mx-auto w-full bg-transparent"
      >
        <div className="py-4 pb-40 bg-transparent">
          {isEmpty ? (
            <>
              {/* AI empty-state centerpiece */}
              <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
                <img
                  src={biaOrbGif}
                  alt=""
                  className="w-[150px] h-auto max-w-[160px] mb-8 flex-shrink-0 object-contain"
                  loading="eager"
                  decoding="async"
                />
                <h2 className="text-xl font-semibold text-white mb-3">
                  Ask BIA
                </h2>
                <p className="text-sm text-white/60 max-w-[260px] leading-relaxed mb-10">
                  Track shipments, get rates, or resolve shipping questions faster.
                </p>
              </div>
              {/* Quick prompt chips */}
              <div className="flex flex-wrap justify-center gap-2 px-2 mt-2">
                {QUICK_PROMPTS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickPrompt(label)}
                    className={cn(
                      "rounded-full pl-4 pr-5 py-2 text-xs font-medium transition-all duration-200",
                      "bg-white/[0.07] text-white/90 border border-white/[0.06]",
                      "hover:bg-white/[0.11] hover:border-white/[0.08] hover:shadow-[0_0_24px_rgba(255,255,255,.08)]",
                      "active:scale-[0.98]",
                      "disabled:opacity-50 disabled:pointer-events-none",
                      "inline-flex items-center gap-2.5"
                    )}
                  >
                    <Icon className="w-4 h-4 text-white/75 shrink-0" strokeWidth={2.25} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    i === messages.length - 1 && "animate-bia-message-in",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "rounded-br-md"
                        : "rounded-bl-md backdrop-blur-[8px]"
                    )}
                    style={
                      msg.role === "user"
                        ? {
                            background: "rgba(255,60,45,0.18)",
                            border: "1px solid rgba(255,60,45,0.35)",
                          }
                        : {
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.12)",
                          }
                    }
                  >
                    <p className="whitespace-pre-wrap break-words text-white/95">{msg.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start animate-bia-message-in">
                  <div
                    className="rounded-2xl rounded-bl-md px-4 py-3 text-sm flex items-center gap-1.5 backdrop-blur-[8px]"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <span className="flex gap-1 items-center">
                      <span className="bia-typing-dot w-1.5 h-1.5 rounded-full bg-white/80" />
                      <span className="bia-typing-dot w-1.5 h-1.5 rounded-full bg-white/80" />
                      <span className="bia-typing-dot w-1.5 h-1.5 rounded-full bg-white/80" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="shrink-0 px-4 py-2 max-w-md mx-auto w-full absolute bottom-28 left-0 right-0">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2 flex items-center justify-between gap-2">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError(null)}
              className="shrink-0 border-white/20 text-white hover:bg-white/10"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Floating input dock + disclaimer */}
      <div className="shrink-0 px-4 pb-20 pt-4 max-w-md mx-auto w-full">
        <div
          className={cn(
            "rounded-2xl p-2 flex gap-2 items-end",
            "bg-white/[0.06] border border-white/[0.06]",
            "shadow-[0_8px_32px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.03)]"
          )}
        >
          <Textarea
            placeholder="Ask BIA..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            className={cn(
              "min-h-[44px] max-h-24 resize-none py-2.5 px-3 flex-1",
              "bg-transparent border-0 text-white placeholder:text-white/40",
              "focus-visible:ring-0 focus-visible:ring-offset-0"
            )}
            aria-label="Message"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={cn(
              "shrink-0 h-10 w-10 rounded-full text-white border-0 transition-all duration-200",
              "bg-[#D32F2F] hover:bg-[#C62828] active:scale-95",
              "shadow-[0_0_20px_rgba(211,47,47,.35),inset_0_0_0_1px_rgba(255,255,255,.08)]"
            )}
            aria-label="Send"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-white/40 text-center mt-2 px-2">
          BIA may make mistakes. Please verify important shipment details.
        </p>
      </div>
    </div>
  );
}
