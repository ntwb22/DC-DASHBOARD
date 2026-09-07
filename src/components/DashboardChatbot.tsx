import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Send, 
  X, 
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatAction {
  label: string;
  onClickAction: string;
}

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: Date;
  actions?: ChatAction[];
}

interface DashboardChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: () => void;
  onOpenSettings: () => void;
  onGoToTab: (tab: "overview" | "power" | "deploy" | "sel" | "ping") => void;
  onSetView: (view: "overview" | "inventory") => void;
  onToggleRelayModal: () => void;
  onSwitchTheme: (color: "purple" | "blue" | "teal" | "orange" | "pink" | "red") => void;
  onToggleDarkMode: () => void;
  onToggleViewMode: () => void;
  onSetLogsTab: (tab: "all" | "nic_down") => void;
  currentView: "overview" | "inventory";
  currentTab: "overview" | "power" | "deploy" | "sel" | "ping";
  currentTheme: "purple" | "blue" | "teal" | "orange" | "pink" | "red";
  isDarkMode: boolean;
  currentViewMode: "grid" | "list";
  currentLogsTab: "all" | "nic_down";
}

export const DashboardChatbot: React.FC<DashboardChatbotProps> = ({
  isOpen,
  onClose,
  onAddNode,
  onOpenSettings,
  onGoToTab,
  onSetView,
  onToggleRelayModal,
  onSwitchTheme,
  onToggleDarkMode,
  onToggleViewMode,
  onSetLogsTab,
  currentView,
  currentTab,
  currentTheme,
  isDarkMode,
  currentViewMode,
  currentLogsTab
}) => {
  const [input, setInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I am your Tyrone Assistant. How can I help you find what you need in the dashboard today?",
      timestamp: new Date(),
      actions: [
        { label: "➕ Add Server Node", onClickAction: "open_add_node" },
        { label: "⚙️ Customization & Settings", onClickAction: "open_settings" },
        { label: "⚡ Bulk Power Controls", onClickAction: "go_to_power" },
        { label: "🔍 Detailed Server Inventory", onClickAction: "go_to_inventory" },
        { label: "📞 Contact Support", onClickAction: "show_contact_details" }
      ]
    }
  ]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  // Close chatbot when clicking outside of the chat window and trigger button
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatWindowRef.current && chatWindowRef.current.contains(event.target as Node)) {
        return;
      }
      if ((event.target as HTMLElement).closest(".chatbot-trigger-btn")) {
        return;
      }
      onClose();
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Auto-scroll to bottom of messages when open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, messages, isTyping]);

  const quickSuggestions = [
    "How do I add a new server?",
    "Where is the ping test?",
    "Switch to dark mode",
    "Go to OS Deployment",
    "Contact Support"
  ];

  const handleActionClick = (actionName: string) => {
    switch (actionName) {
      case "show_contact_details":
        addBotReply("Here are the official contact details for **Tyrone Support**:\n\n" +
          "📧 **Support Email**: `tyronecare@tyronesystems.com` (Warranty, RMAs, hardware cases)\n" +
          "✉️ **General Info**: `info@tyronesystems.com`\n" +
          "📞 **Support Helpline**: `+91-129-2310400`\n" +
          "🌐 **Official Support Portal**: [tyronesystems.com/tyrone-care](https://www.tyronesystems.com/tyrone-care/)");
        break;
      case "open_add_node":
        onAddNode();
        addBotReply("Opening the **Add Node Form** now! You can register server profiles with their BMC credentials.");
        break;
      case "open_settings":
        onOpenSettings();
        addBotReply("Opening **Settings Menu**! Here you can adjust global font sizes, switch themes, or purge the database logs.");
        break;
      case "go_to_power":
        onGoToTab("power");
        addBotReply("Navigated to the **Power Management** bulk tab. Select target nodes on the grid to run Power On, Power Off, Reset, or Shutdown operations.");
        break;
      case "go_to_ping":
        onGoToTab("ping");
        addBotReply("Switched to the **Ping Diagnostic** tab. Enter any IP and request count to test socket connectivity directly from the server backend.");
        break;
      case "go_to_deploy":
        onGoToTab("deploy");
        addBotReply("Navigated to the **OS Deployment** tab. Configure custom PXE configurations or upload local ISO files to provision systems.");
        break;
      case "go_to_sel":
        onGoToTab("sel");
        addBotReply("Navigated to the **System Event Logs (SEL)** manager. You can load logs for checked nodes or issue SEL clears.");
        break;
      case "go_to_inventory":
        if (currentView === "inventory") {
          addBotReply("You are currently viewing a server's inventory! Click the **Back to Fleet** button at the top left to return to the list.");
        } else {
          addBotReply("To view server inventory, click the **View Inventory** button or double-click any node card on the overview screen.");
        }
        break;
      case "go_to_fleet":
        onSetView("overview");
        addBotReply("Returned to the **Fleet Overview** overview pane.");
        break;
      case "open_relay":
        onToggleRelayModal();
        addBotReply("Opened the **Relay Configuration** status overlay. You can copy the dynamic startup script directly from here.");
        break;
      case "toggle_dark":
        onToggleDarkMode();
        addBotReply(`Switched to **${!isDarkMode ? "Dark" : "Light"} Mode**!`);
        break;
      case "switch_theme_purple":
        onSwitchTheme("purple");
        addBotReply("Theme color changed to **Purple**!");
        break;
      case "switch_theme_blue":
        onSwitchTheme("blue");
        addBotReply("Theme color changed to **Blue**!");
        break;
      case "switch_theme_teal":
        onSwitchTheme("teal");
        addBotReply("Theme color changed to **Teal**!");
        break;
      case "switch_theme_orange":
        onSwitchTheme("orange");
        addBotReply("Theme color changed to **Orange**!");
        break;
      case "switch_theme_pink":
        onSwitchTheme("pink");
        addBotReply("Theme color changed to **Pink**!");
        break;
      case "switch_theme_red":
        onSwitchTheme("red");
        addBotReply("Theme color changed to **Red**!");
        break;
      case "toggle_layout":
        onToggleViewMode();
        addBotReply(`Layout toggled! Now displaying in **${currentViewMode === "grid" ? "List" : "Grid"} View**.`);
        break;
      case "toggle_nic_down":
        onSetLogsTab(currentLogsTab === "all" ? "nic_down" : "all");
        addBotReply(currentLogsTab === "all" 
          ? "Isolating Broadcom/Emulex signature failures in logs." 
          : "Switched back to full diagnostic history feed."
        );
        break;
      default:
        break;
    }
  };

  const addBotReply = (text: string, actions?: ChatAction[]) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "bot",
        text,
        timestamp: new Date(),
        actions
      }
    ]);
  };

  const processQuery = (query: string) => {
    const q = query.toLowerCase().trim();
    setIsTyping(true);

    setTimeout(() => {
      let reply = "";
      let actions: ChatAction[] = [];

      // 1. Direct Theme switches
      if (q.includes("theme to purple") || q.includes("purple theme")) {
        onSwitchTheme("purple");
        reply = "I've updated the theme to **Purple** for you!";
      } else if (q.includes("theme to blue") || q.includes("blue theme")) {
        onSwitchTheme("blue");
        reply = "I've updated the theme to **Blue** for you!";
      } else if (q.includes("theme to teal") || q.includes("teal theme")) {
        onSwitchTheme("teal");
        reply = "I've updated the theme to **Teal** for you!";
      } else if (q.includes("theme to orange") || q.includes("orange theme")) {
        onSwitchTheme("orange");
        reply = "I've updated the theme to **Orange** for you!";
      } else if (q.includes("theme to pink") || q.includes("pink theme")) {
        onSwitchTheme("pink");
        reply = "I've updated the theme to **Pink** for you!";
      } else if (q.includes("theme to red") || q.includes("red theme")) {
        onSwitchTheme("red");
        reply = "I've updated the theme to **Red** for you!";
      }
      
      // 2. Direct Layout and Dark mode toggles
      else if (q.includes("dark mode") || q.includes("light mode") || q.includes("toggle dark") || q.includes("toggle light")) {
        onToggleDarkMode();
        reply = `Toggled display mode! The dashboard is now in **${!isDarkMode ? "Dark" : "Light"}** mode.`;
      } else if (q.includes("grid view") || q.includes("list view") || q.includes("change layout") || q.includes("toggle layout") || q.includes("change view")) {
        onToggleViewMode();
        reply = `I've switched the Fleet layout mode! Now showing in **${currentViewMode === "grid" ? "List" : "Grid"} view**.`;
      } 
      
      // 3. Query mappings
      else if (q.includes("add") || q.includes("new node") || q.includes("new server") || q.includes("register")) {
        reply = "To add a new server to your monitoring pool, click the **Add Node** button (with the `+` icon) at the top-right header of the Fleet Overview. You will be prompted to supply node name, BMC IP, OS IP, and passwords.";
        actions = [{ label: "➕ Open Add Node Form", onClickAction: "open_add_node" }];
      } else if (q.includes("theme") || q.includes("color") || q.includes("settings") || q.includes("font") || q.includes("custom")) {
        reply = "Global layouts, dark mode switches, background settings, database clears, and theme color choices (Purple, Blue, Teal, Orange, Pink, Red) can be customized inside the **Settings Panel**. Open it via the gear icon in the top header.";
        actions = [
          { label: "⚙️ Open Settings Menu", onClickAction: "open_settings" },
          { label: "🎨 Use Teal Theme", onClickAction: "switch_theme_teal" },
          { label: "🎨 Use Purple Theme", onClickAction: "switch_theme_purple" }
        ];
      } else if (q.includes("power") || q.includes("shutdown") || q.includes("reboot") || q.includes("restart") || q.includes("reset") || q.includes("turn off") || q.includes("turn on")) {
        reply = "Bulk power controls let you send BMC power actions (Graceful Shutdown, Hard Reset, Power On, Power Off) to multiple machines simultaneously. Select target nodes, go to the **Power Management** tab in the bulk panel at the bottom of the screen.";
        actions = [{ label: "⚡ Go to Power Controls", onClickAction: "go_to_power" }];
      } else if (q.includes("ping") || q.includes("reachability") || q.includes("offline") || q.includes("online") || q.includes("connect")) {
        reply = "To diagnose network socket dropouts or verify BMC connectivity, launch a ping command. Select the **Ping Test** tab in the bulk operations panel, enter the destination, and check the real-time logs.";
        actions = [{ label: "🌐 Go to Ping Test", onClickAction: "go_to_ping" }];
      } else if (q.includes("deploy") || q.includes("pxe") || q.includes("iso") || q.includes("operating system") || q.includes("install")) {
        reply = "Operating system deployments can be run from the dashboard. Go to the **OS Deployment** tab in the bulk panel to load custom templates, set PXE target paths, or mount ISO installation discs.";
        actions = [{ label: "💿 Go to OS Deployment", onClickAction: "go_to_deploy" }];
      } else if (q.includes("sel") || q.includes("log") || q.includes("event") || q.includes("diagnostics") || q.includes("nic")) {
        reply = "You can view System Event Logs (SEL) and NIC failure signatures in two ways:\n1. Scroll down to the **Live Diagnostics & Fabric Feed**.\n2. Go to the **System Event Logs (SEL)** tab in the bulk pane.";
        actions = [
          { label: "📋 Go to SEL Logs Manager", onClickAction: "go_to_sel" },
          { label: "⚠️ Filter NIC Down Signatures", onClickAction: "toggle_nic_down" }
        ];
      } else if (q.includes("inventory") || q.includes("details") || q.includes("raid") || q.includes("cpu") || q.includes("memory") || q.includes("storage") || q.includes("sensor") || q.includes("fan") || q.includes("temp")) {
        reply = "To view comprehensive server diagnostics (including CPU cores, RAM modules, physical storage controllers, RAID layout configurations, fan RPMs, temperature zones, and network links), double-click a node on the main dashboard grid or click its **View Inventory** button.";
        actions = [
          { label: "📊 Detailed Server Inventory", onClickAction: "go_to_inventory" }
        ];
        if (currentView === "inventory") {
          actions.push({ label: "🔙 Return to Fleet Overview", onClickAction: "go_to_fleet" });
        }
      } else if (q.includes("relay") || q.includes("proxy") || q.includes("agent")) {
        reply = "If nodes are isolated inside local networks behind firewalls, you can run a local Tyrone Relay Agent. Click **Relay Status** or **Connection info** on the dashboard to copy the run commands.";
        actions = [{ label: "🔗 Open Relay Settings", onClickAction: "open_relay" }];
      } else if (q.includes("hello") || q.includes("hi") || q.includes("hey") || q.includes("help")) {
        reply = "Hi! I am the dashboard helper bot. You can ask me things like 'How to add a server', 'Where are power actions', 'Change theme to blue', 'Open settings', or 'How to view detailed storage inventory'.";
      } else if (q.includes("contact") || q.includes("support") || q.includes("helpdesk") || q.includes("phone") || q.includes("email") || q.includes("call") || q.includes("address") || q.includes("customer")) {
        reply = "Here are the contact channels for **Tyrone Support**:\n\n" +
          "📧 **Support Email**: `tyronecare@tyronesystems.com` (Hardware RMAs and SLA cases)\n" +
          "✉️ **General Info**: `info@tyronesystems.com`\n" +
          "📞 **Support Helpline**: `+91-129-2310400`\n" +
          "🌐 **Support Web Portal**: [tyronesystems.com/tyrone-care](https://www.tyronesystems.com/tyrone-care/)";
      } else {
        reply = "I couldn't quite find details for that query. You can use the buttons below to access typical dashboard sections, or specify if you need help with server settings, power controls, ping checks, or hardware info.";
        actions = [
          { label: "➕ Add Server", onClickAction: "open_add_node" },
          { label: "🌐 Ping Diagnostics", onClickAction: "go_to_ping" },
          { label: "⚙️ Settings", onClickAction: "open_settings" }
        ];
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "bot",
          text: reply,
          timestamp: new Date(),
          actions
        }
      ]);
      setIsTyping(false);
    }, 600);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: "user",
        text: userText,
        timestamp: new Date()
      }
    ]);
    setInput("");

    processQuery(userText);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          style={{
            position: "fixed",
            top: "100px",
            right: "24px",
            zIndex: 9999
          }}
          className="pointer-events-none flex flex-col items-end gap-3"
        >
          {/* Chat Window */}
          <motion.div
            ref={chatWindowRef}
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-[calc(100vw-2rem)] sm:w-96 h-[480px] sm:h-[520px] max-h-[calc(100vh-10rem)] sm:max-h-[calc(100vh-14rem)] rounded-2xl overflow-hidden shadow-2xl border flex flex-col pointer-events-auto
                       bg-slate-50 border-slate-200/60 text-slate-700 font-sans animate-fade-in"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200/50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                    <Bot size={18} />
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Tyrone Assistant</h3>
                  <p className="text-[10px] text-slate-500/70 font-medium uppercase leading-none mt-0.5">Online Helper</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-250 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages Area */}
            <div ref={scrollContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-thin">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div 
                    className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[11px] sm:text-[10.5px] leading-relaxed shadow-sm font-normal
                              ${msg.sender === "user" 
                                ? "bg-primary text-white rounded-tr-none animate-pulse-subtle font-medium" 
                                : "bg-slate-200/80 border border-slate-200/30 text-slate-705 rounded-tl-none font-medium"
                              }`}
                  >
                    {/* Render helper text with basic markdown styling for bolding */}
                    {msg.text.split("\n").map((line, lineIdx) => (
                      <p key={lineIdx} className={lineIdx > 0 ? "mt-1.5" : ""}>
                        {line.split("**").map((part, partIdx) => 
                          partIdx % 2 === 1 ? <strong key={partIdx} className="font-bold text-primary">{part}</strong> : part
                        ).map((subPart, subPartIdx) => {
                          if (typeof subPart === "string") {
                            return subPart.split("`").map((codePart, codeIdx) => 
                              codeIdx % 2 === 1 ? <code key={codeIdx} className="px-1.5 py-0.5 bg-slate-250/50 font-mono text-[9.5px] rounded">{codePart}</code> : codePart
                            );
                          }
                          return subPart;
                        })}
                      </p>
                    ))}
                  </div>

                  {/* Actions inside message */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="w-full flex flex-wrap gap-1.5 mt-2">
                      {msg.actions.map((act, actIdx) => (
                        <button
                          key={actIdx}
                          type="button"
                          onClick={() => handleActionClick(act.onClickAction)}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-200 text-slate-700 border border-slate-200/60 rounded-xl text-[10px] sm:text-[9.5px] font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer hover:border-primary/50 hover:text-primary leading-tight text-left whitespace-normal"
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="text-[8.5px] text-slate-500/60 font-normal tracking-wide mt-1 px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}

              {/* Bot Typing Indicator */}
              {isTyping && (
                <div className="flex flex-col items-start">
                  <div className="bg-slate-200/80 border border-slate-200/30 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestions list (hiding browser scrollbar track cleanly across platforms) */}
            <div 
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none"
              }}
              className="px-4 py-2 bg-slate-50/50 border-t border-slate-200/40 overflow-x-auto whitespace-nowrap flex gap-1.5 scroll-smooth [&::-webkit-scrollbar]:hidden"
            >
              {quickSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInput("");
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: Math.random().toString(),
                        sender: "user",
                        text: suggestion,
                        timestamp: new Date()
                      }
                    ]);
                    processQuery(suggestion);
                  }}
                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-250 text-[9.5px] font-semibold uppercase tracking-wider text-slate-600 border border-slate-200/50 rounded-full transition-colors cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form 
              onSubmit={handleSend}
              className="p-3 border-t border-slate-200/50 flex gap-2 bg-slate-50/50"
            >
              <input
                type="text"
                placeholder="Ask Tyrone Assistant..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-[15px] sm:text-[11px] font-normal text-slate-700 placeholder:text-slate-500/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button
                type="submit"
                className="w-9 h-9 rounded-xl bg-primary hover:bg-primary-dark text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
