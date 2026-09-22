import React, { useState, useEffect } from "react";
import { Plus, Save, Trash2, X, Pencil, Check, RefreshCw, Key, Eye, EyeOff, Radio, Send, Bell, Shield, Network, CheckCircle2, AlertCircle } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

interface SettingsViewProps {
  activeUsername?: string;
  onUpdateUsername?: (newName: string) => void;
}

export function SettingsView({ activeUsername = "admin", onUpdateUsername }: SettingsViewProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "user_management" | "email_subscriptions" | "snmp_trap"
  >("user_management");

  const [consoleUsernameInput, setConsoleUsernameInput] = useState<string>(activeUsername);

  useEffect(() => {
    setConsoleUsernameInput(activeUsername);
  }, [activeUsername]);

  // User Management Persistent State
  const [users, setUsers] = useState<Array<{ id: string; username: string; password?: string; role: string; description: string; limit: string }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_console_users");
      if (saved) {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((u: any) => u.username !== "dcmadmin");
        if (filtered.length > 0) return filtered;
      }
    } catch { }
    return [
      { id: "1", username: "admin", password: "admin", role: "Administrator", description: "System Administrator", limit: "N/A" }
    ];
  });

  useEffect(() => {
    localStorage.setItem("tyrone_console_users", JSON.stringify(users));
  }, [users]);

  // Inline User Editing State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");

  const startEditUser = (u: { id: string; role: string; description: string }) => {
    setEditingUserId(u.id);
    setEditingRole(u.role);
    setEditingDescription(u.description);
  };

  const handleSaveUserDetails = (userId: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, role: editingRole, description: editingDescription };
      }
      return u;
    }));
    setEditingUserId(null);
  };

  const [userToDelete, setUserToDelete] = useState<{ id: string; username: string } | null>(null);

  const handleDeleteUser = (user: { id: string; username: string }) => {
    if (user.username === "admin") {
      alert("Built-in account 'admin' cannot be deleted.");
      return;
    }
    setUserToDelete(user);
  };

  const handleConfirmDeleteUser = () => {
    if (userToDelete) {
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setUserToDelete(null);
    }
  };

  // Create User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [accountType, setAccountType] = useState("DCM Console User");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState("Administrator");
  const [newDescription, setNewDescription] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [confirmUserPassword, setConfirmUserPassword] = useState("");
  const [userFormError, setUserFormError] = useState<string | null>(null);

  const handleAddUser = () => {
    setUserFormError(null);
    if (!newUsername.trim()) {
      setUserFormError("Username is required.");
      return;
    }
    if (!userPassword) {
      setUserFormError("Password is required.");
      return;
    }
    if (userPassword !== confirmUserPassword) {
      setUserFormError("Passwords do not match.");
      return;
    }

    const newUserObj = {
      id: `user-${Date.now()}`,
      username: newUsername.trim(),
      password: userPassword,
      role: newRole,
      description: newDescription.trim() || "Console Account",
      limit: "N/A"
    };

    setUsers(prev => [...prev, newUserObj]);
    setNewUsername("");
    setUserPassword("");
    setConfirmUserPassword("");
    setNewDescription("");
    setShowAddUserModal(false);
  };

  // Password & Username Change state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<string | null>(null);

  const [showUserPassword, setShowUserPassword] = useState(false);
  const [showConfirmUserPassword, setShowConfirmUserPassword] = useState(false);

  const handleChangeUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleUsernameInput.trim()) return;
    if (onUpdateUsername) {
      onUpdateUsername(consoleUsernameInput.trim());
    }
    setUsernameStatus("Console Administrator username updated.");
    setTimeout(() => setUsernameStatus(null), 3000);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      setPasswordStatus("New passwords do not match.");
      return;
    }
    setPasswordStatus("Password changed successfully.");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordStatus(null), 3000);
  };

  // Device Access Proxy State
  const [httpProxyHost, setHttpProxyHost] = useState<string>(() => localStorage.getItem("tyrone_http_proxy_host") || "");
  const [httpProxyPort, setHttpProxyPort] = useState<string>(() => localStorage.getItem("tyrone_http_proxy_port") || "");
  const [proxyStatus, setProxyStatus] = useState<string | null>(null);

  const handleSaveProxySettings = () => {
    localStorage.setItem("tyrone_http_proxy_host", httpProxyHost);
    localStorage.setItem("tyrone_http_proxy_port", httpProxyPort);
    setProxyStatus("Proxy settings saved successfully.");
    setTimeout(() => setProxyStatus(null), 4000);
  };

  // AI Ops MCP State
  const [enableMcpServer, setEnableMcpServer] = useState<boolean>(() => localStorage.getItem("tyrone_mcp_enabled") === "true");
  const [mcpApiKey, setMcpApiKey] = useState<string>(() => localStorage.getItem("tyrone_mcp_api_key") || "");
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);

  const handleGenerateApiKey = () => {
    const key = `mcp_live_key_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
    setMcpApiKey(key);
  };

  const handleSaveMcpsettings = () => {
    localStorage.setItem("tyrone_mcp_enabled", enableMcpServer ? "true" : "false");
    localStorage.setItem("tyrone_mcp_api_key", mcpApiKey);
    setMcpStatus("MCP Server configuration saved successfully.");
    setTimeout(() => setMcpStatus(null), 4000);
  };

  // Email Subscriptions State
  const [smtpSubscriptions, setSmtpSubscriptions] = useState<Array<{
    smtpServer: string;
    port: string;
    connection: string;
    account: string;
    fromEmail: string;
  }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_smtp_subscriptions");
      if (saved) return JSON.parse(saved);
    } catch { }
    return [
      { smtpServer: "smtp.company.com", port: "587", connection: "STARTTLS", account: "alerts@company.com", fromEmail: "no-reply@company.com" }
    ];
  });

  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);
  const [showAddSmtpModal, setShowAddSmtpModal] = useState(false);
  const [smtpServerInput, setSmtpServerInput] = useState("");
  const [smtpPortInput, setSmtpPortInput] = useState("587");
  const [smtpConnInput, setSmtpConnInput] = useState("STARTTLS");
  const [smtpAccountInput, setSmtpAccountInput] = useState("");
  const [smtpFromEmailInput, setSmtpFromEmailInput] = useState("");

  const handleAddSmtpSubscription = () => {
    if (!smtpServerInput.trim() || !smtpFromEmailInput.trim()) {
      alert("SMTP Server and From Email Address are required.");
      return;
    }
    const newSub = {
      smtpServer: smtpServerInput.trim(),
      port: smtpPortInput.trim() || "587",
      connection: smtpConnInput,
      account: smtpAccountInput.trim() || "admin",
      fromEmail: smtpFromEmailInput.trim()
    };
    const updated = [...smtpSubscriptions, newSub];
    setSmtpSubscriptions(updated);
    localStorage.setItem("tyrone_smtp_subscriptions", JSON.stringify(updated));

    setSmtpServerInput("");
    setSmtpPortInput("587");
    setSmtpAccountInput("");
    setSmtpFromEmailInput("");
    setShowAddSmtpModal(false);

    setSmtpStatus("Email Subscription saved successfully.");
    setTimeout(() => setSmtpStatus(null), 4000);
  };

  const handleSaveSmtpSubscriptions = () => {
    localStorage.setItem("tyrone_smtp_subscriptions", JSON.stringify(smtpSubscriptions));
    setSmtpStatus("All Email Subscriptions saved successfully.");
    setTimeout(() => setSmtpStatus(null), 4000);
  };

  // Predefined Events State
  const [predefinedRules, setPredefinedRules] = useState<Array<{ name: string; severity: string; category: string; email: boolean; snmp: boolean }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_predefined_rules");
      if (saved) return JSON.parse(saved);
    } catch { }
    return [
      { name: "Power Supply Failure", severity: "Critical", category: "Hardware Power", email: true, snmp: true },
      { name: "High Temperature Exceeded", severity: "Warning", category: "Thermal", email: true, snmp: false },
      { name: "Memory Uncorrectable ECC Error", severity: "Critical", category: "Memory", email: true, snmp: true },
      { name: "Storage Drive Fault", severity: "Warning", category: "Storage", email: false, snmp: true },
      { name: "Chassis Intrusion Detected", severity: "Warning", category: "Security", email: true, snmp: true }
    ];
  });

  const [predefinedStatus, setPredefinedStatus] = useState<string | null>(null);

  const togglePredefinedEmail = (idx: number) => {
    const updated = [...predefinedRules];
    updated[idx].email = !updated[idx].email;
    setPredefinedRules(updated);
    localStorage.setItem("tyrone_predefined_rules", JSON.stringify(updated));
  };

  const togglePredefinedSnmp = (idx: number) => {
    const updated = [...predefinedRules];
    updated[idx].snmp = !updated[idx].snmp;
    setPredefinedRules(updated);
    localStorage.setItem("tyrone_predefined_rules", JSON.stringify(updated));
  };

  const handleSavePredefinedRules = () => {
    localStorage.setItem("tyrone_predefined_rules", JSON.stringify(predefinedRules));
    setPredefinedStatus("Predefined Event rules saved successfully.");
    setTimeout(() => setPredefinedStatus(null), 4000);
  };

  // SEL Rules State
  const [selRules, setSelRules] = useState<Array<{ rule: string; sensor: string; threshold: string; autoClear: boolean; status: string }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_sel_rules");
      if (saved) return JSON.parse(saved);
    } catch { }
    return [
      { rule: "Auto Archive Critical SEL", sensor: "All Sensors", threshold: "Critical", autoClear: true, status: "Active" },
      { rule: "Filter Fan Speed Fluctuations", sensor: "Fan Sensor", threshold: "Warning", autoClear: false, status: "Active" }
    ];
  });

  const [selStatus, setSelStatus] = useState<string | null>(null);

  const toggleSelAutoClear = (idx: number) => {
    const updated = [...selRules];
    updated[idx].autoClear = !updated[idx].autoClear;
    setSelRules(updated);
    localStorage.setItem("tyrone_sel_rules", JSON.stringify(updated));
  };

  const toggleSelStatus = (idx: number) => {
    const updated = [...selRules];
    updated[idx].status = updated[idx].status === "Active" ? "Disabled" : "Active";
    setSelRules(updated);
    localStorage.setItem("tyrone_sel_rules", JSON.stringify(updated));
  };

  const handleSaveSelRules = () => {
    localStorage.setItem("tyrone_sel_rules", JSON.stringify(selRules));
    setSelStatus("SEL Rules saved successfully.");
    setTimeout(() => setSelStatus(null), 4000);
  };

  // SNMP Trap Persistent State
  const [snmpEnabled, setSnmpEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).enabled ?? true;
    } catch {}
    return true;
  });
  const [snmpVersion, setSnmpVersion] = useState<"v1" | "v2c" | "v3">((): any => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).version || "v2c";
    } catch {}
    return "v2c";
  });
  const [snmpHost, setSnmpHost] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).host || "172.16.12.100";
    } catch {}
    return "172.16.12.100";
  });
  const [snmpPort, setSnmpPort] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).port || "162";
    } catch {}
    return "162";
  });
  const [snmpCommunity, setSnmpCommunity] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).community || "public";
    } catch {}
    return "public";
  });
  const [snmpSecurityName, setSnmpSecurityName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).securityName || "snmpadmin";
    } catch {}
    return "snmpadmin";
  });
  const [snmpSecurityLevel, setSnmpSecurityLevel] = useState<"noAuthNoPriv" | "authNoPriv" | "authPriv">((): any => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).securityLevel || "authPriv";
    } catch {}
    return "authPriv";
  });
  const [snmpAuthProtocol, setSnmpAuthProtocol] = useState<"SHA" | "MD5">((): any => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).authProtocol || "SHA";
    } catch {}
    return "SHA";
  });
  const [snmpAuthPass, setSnmpAuthPass] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).authPass || "AuthPass123!";
    } catch {}
    return "AuthPass123!";
  });
  const [snmpPrivProtocol, setSnmpPrivProtocol] = useState<"AES" | "DES">((): any => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).privProtocol || "AES";
    } catch {}
    return "AES";
  });
  const [snmpPrivPass, setSnmpPrivPass] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("tyrone_snmp_trap_config");
      if (saved) return JSON.parse(saved).privPass || "PrivPass123!";
    } catch {}
    return "PrivPass123!";
  });

  const [snmpTrapCritical, setSnmpTrapCritical] = useState<boolean>(true);
  const [snmpTrapWarning, setSnmpTrapWarning] = useState<boolean>(true);
  const [snmpTrapInfo, setSnmpTrapInfo] = useState<boolean>(false);

  const [snmpStatus, setSnmpStatus] = useState<string | null>(null);
  const [sendingTestTrap, setSendingTestTrap] = useState<boolean>(false);

  const handleSaveSnmpConfig = () => {
    const config = {
      enabled: snmpEnabled,
      version: snmpVersion,
      host: snmpHost.trim(),
      port: snmpPort.trim(),
      community: snmpCommunity.trim(),
      securityName: snmpSecurityName.trim(),
      securityLevel: snmpSecurityLevel,
      authProtocol: snmpAuthProtocol,
      authPass: snmpAuthPass,
      privProtocol: snmpPrivProtocol,
      privPass: snmpPrivPass,
      critical: snmpTrapCritical,
      warning: snmpTrapWarning,
      info: snmpTrapInfo
    };
    localStorage.setItem("tyrone_snmp_trap_config", JSON.stringify(config));
    setSnmpStatus("SNMP Trap configuration saved successfully.");
    setTimeout(() => setSnmpStatus(null), 4000);
  };

  const handleSendTestTrap = () => {
    if (!snmpHost.trim()) {
      alert("Destination Host / IP Address is required to send a test trap.");
      return;
    }
    setSendingTestTrap(true);
    setTimeout(() => {
      setSendingTestTrap(false);
      setSnmpStatus(`Test SNMP ${snmpVersion.toUpperCase()} Trap notification successfully transmitted to ${snmpHost}:${snmpPort}!`);
      setTimeout(() => setSnmpStatus(null), 5000);
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#dce1e7] text-slate-800 text-xs select-none p-3 space-y-3 w-full font-sans">

      {/* Settings Top Sub-Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-300 pb-0">
        {[
          { id: "user_management", label: "User Management" },
          { id: "email_subscriptions", label: "Email Subscriptions" },
          { id: "snmp_trap", label: "SNMP Trap" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSettingsTab(tab.id as any)}
            className={`px-5 py-2 text-xs font-bold rounded-t transition-all cursor-pointer border-t border-x ${activeSettingsTab === tab.id
              ? "bg-[#680505] text-white font-extrabold border-[#4d0000] shadow-xs"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300 border-slate-300"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* USER MANAGEMENT SUB-TAB */}
      {activeSettingsTab === "user_management" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
            <div className="bg-[#680505] text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b border-[#4d0000]">
              <span>User Accounts</span>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add User</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                    <th className="py-2.5 px-4 border-r border-slate-200">User Account</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Role</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Description</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 border-r border-slate-200 font-bold text-[#680505]">{u.username}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 font-medium">
                        {editingUserId === u.id ? (
                          <select
                            value={editingRole}
                            onChange={e => setEditingRole(e.target.value)}
                            className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] bg-white"
                          >
                            <option value="Administrator">Administrator</option>
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-slate-600">
                        {editingUserId === u.id ? (
                          <input
                            type="text"
                            value={editingDescription}
                            onChange={e => setEditingDescription(e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                          />
                        ) : (
                          u.description
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {editingUserId === u.id ? (
                            <button
                              onClick={() => handleSaveUserDetails(u.id)}
                              className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                              title="Save Changes"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditUser(u)}
                              className="text-slate-600 hover:text-[#680505] font-bold cursor-pointer"
                              title="Edit User"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Account Credential Change Card */}
          <div className="bg-white border border-slate-300 rounded shadow-xs p-5 max-w-xl space-y-4">
            <h3 className="font-bold text-sm text-[#680505] border-b border-slate-200 pb-2">
              Console Account Credentials
            </h3>

            {usernameStatus && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-bold text-xs">
                {usernameStatus}
              </div>
            )}

            <form onSubmit={handleChangeUsername} className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700 min-w-[120px]">Console Admin:</label>
              <input
                type="text"
                value={consoleUsernameInput}
                onChange={e => setConsoleUsernameInput(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded font-bold text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded cursor-pointer text-xs transition-colors shadow-xs"
              >
                Save Name
              </button>
            </form>

            <h3 className="font-bold text-sm text-[#680505] border-b border-slate-200 pb-2 pt-2">
              Change Console Password
            </h3>

            {passwordStatus && (
              <div className={`p-2 border rounded font-bold text-xs ${passwordStatus.includes("successfully") ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"}`}>
                {passwordStatus}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-xs font-bold text-slate-700 text-right">Old Password</label>
                <div className="col-span-8 relative flex items-center">
                  <input
                    type={showOldPassword ? "text" : "password"}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full px-3 py-1.5 pr-9 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showOldPassword ? "Hide password" : "Show password"}
                  >
                    {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-xs font-bold text-slate-700 text-right">New Password</label>
                <div className="col-span-8 relative flex items-center">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-1.5 pr-9 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-xs font-bold text-slate-700 text-right">Confirm Password</label>
                <div className="col-span-8 relative flex items-center">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-1.5 pr-9 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded cursor-pointer text-xs transition-colors shadow-xs"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMAIL SUBSCRIPTIONS SUB-TAB */}
      {activeSettingsTab === "email_subscriptions" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
          <div className="bg-[#680505] text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b border-[#4d0000]">
            <span>Email Subscription</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddSmtpModal(true)}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Add Email Subscription"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subscription</span>
              </button>
              <button
                onClick={handleSaveSmtpSubscriptions}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Save Subscriptions"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {smtpStatus && (
            <div className="p-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 font-bold text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{smtpStatus}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-center">
                  <th className="py-2.5 px-4 border-r border-slate-200">SMTP Server</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Port</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Connection</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Account</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">From Email Address</th>
                  <th className="py-2.5 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 text-center">
                {smtpSubscriptions.map((sub, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 border-r border-slate-200 font-mono font-bold text-[#680505]">{sub.smtpServer}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 font-mono">{sub.port}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 font-medium">{sub.connection}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200">{sub.account}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 font-medium">{sub.fromEmail}</td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => {
                          const updated = smtpSubscriptions.filter((_, i) => i !== idx);
                          setSmtpSubscriptions(updated);
                          localStorage.setItem("tyrone_smtp_subscriptions", JSON.stringify(updated));
                        }}
                        className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                        title="Delete Subscription"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {smtpSubscriptions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                      No Email Subscriptions configured. Click "+ Add Subscription" above to configure SMTP server alerts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SNMP TRAP SUB-TAB */}
      {activeSettingsTab === "snmp_trap" && (
        <div className="space-y-4 font-sans">
          {/* Status Message Toast */}
          {snmpStatus && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-md flex items-center gap-2 shadow-xs animate-fade-in font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{snmpStatus}</span>
            </div>
          )}

          {/* Card 1: Service Enable / Disable Header */}
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
            <div className="bg-[#680505] text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b border-[#4d0000]">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-rose-300" />
                <span>SNMP Trap Forwarding Service</span>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <span className="font-bold text-slate-200">
                  {snmpEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <input
                  type="checkbox"
                  checked={snmpEnabled}
                  onChange={e => setSnmpEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </label>
            </div>
            <div className="p-4 bg-slate-50/50 flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-xs">Out-of-Band Hardware Event SNMP Trap Forwarder</h4>
                <p className="text-slate-500 text-[11px]">
                  Automatically dispatches SNMP Trap notifications to centralized NMS/SIEM receivers when hardware alerts, thermal warnings, or power faults occur.
                </p>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase border ${
                snmpEnabled ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-200 text-slate-600 border-slate-300"
              }`}>
                {snmpEnabled ? "● Active Forwarder" : "○ Inactive"}
              </div>
            </div>
          </div>

          {/* Card 2: SNMP Trap Destination & Protocol Settings */}
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
            <div className="bg-[#680505] text-white px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b border-[#4d0000]">
              <Network className="w-4 h-4 text-rose-300" />
              <span>Target Receiver & Protocol Configuration</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">SNMP Version *</label>
                <div className="col-span-9 flex items-center gap-4">
                  {(["v1", "v2c", "v3"] as const).map(ver => (
                    <label key={ver} className="flex items-center gap-1.5 font-bold cursor-pointer text-slate-800">
                      <input
                        type="radio"
                        name="snmpVersion"
                        value={ver}
                        checked={snmpVersion === ver}
                        onChange={() => setSnmpVersion(ver)}
                        className="accent-[#680505]"
                      />
                      <span>SNMP {ver.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Trap Receiver Host / IP *</label>
                <div className="col-span-9">
                  <input
                    type="text"
                    value={snmpHost}
                    onChange={e => setSnmpHost(e.target.value)}
                    placeholder="e.g. 172.16.12.100 or nms.company.local"
                    className="w-full max-w-md px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Trap UDP Port *</label>
                <div className="col-span-9">
                  <input
                    type="text"
                    value={snmpPort}
                    onChange={e => setSnmpPort(e.target.value)}
                    placeholder="162"
                    className="w-32 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                  <span className="text-[11px] text-slate-500 ml-2">(Standard SNMP Trap UDP port is 162)</span>
                </div>
              </div>

              {(snmpVersion === "v1" || snmpVersion === "v2c") && (
                <div className="grid grid-cols-12 items-center gap-4 animate-fade-in">
                  <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Community String *</label>
                  <div className="col-span-9">
                    <input
                      type="text"
                      value={snmpCommunity}
                      onChange={e => setSnmpCommunity(e.target.value)}
                      placeholder="public"
                      className="w-64 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                    />
                  </div>
                </div>
              )}

              {snmpVersion === "v3" && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-md animate-fade-in">
                  <h5 className="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#680505]" />
                    <span>SNMP v3 USM Security Parameters</span>
                  </h5>

                  <div className="grid grid-cols-12 items-center gap-4">
                    <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Security Name *</label>
                    <div className="col-span-9">
                      <input
                        type="text"
                        value={snmpSecurityName}
                        onChange={e => setSnmpSecurityName(e.target.value)}
                        placeholder="snmpadmin"
                        className="w-64 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-4">
                    <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Security Level</label>
                    <div className="col-span-9">
                      <select
                        value={snmpSecurityLevel}
                        onChange={e => setSnmpSecurityLevel(e.target.value as any)}
                        className="w-64 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold focus:outline-none focus:border-[#680505]"
                      >
                        <option value="authPriv">authPriv (Authentication & Privacy Encryption)</option>
                        <option value="authNoPriv">authNoPriv (Authentication Only)</option>
                        <option value="noAuthNoPriv">noAuthNoPriv (No Auth, No Privacy)</option>
                      </select>
                    </div>
                  </div>

                  {snmpSecurityLevel !== "noAuthNoPriv" && (
                    <>
                      <div className="grid grid-cols-12 items-center gap-4">
                        <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Auth Protocol & Key</label>
                        <div className="col-span-9 flex items-center gap-2">
                          <select
                            value={snmpAuthProtocol}
                            onChange={e => setSnmpAuthProtocol(e.target.value as any)}
                            className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold focus:outline-none"
                          >
                            <option value="SHA">SHA</option>
                            <option value="MD5">MD5</option>
                          </select>
                          <input
                            type="password"
                            value={snmpAuthPass}
                            onChange={e => setSnmpAuthPass(e.target.value)}
                            placeholder="Authentication Passphrase"
                            className="w-64 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505]"
                          />
                        </div>
                      </div>

                      {snmpSecurityLevel === "authPriv" && (
                        <div className="grid grid-cols-12 items-center gap-4">
                          <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2">Privacy Protocol & Key</label>
                          <div className="col-span-9 flex items-center gap-2">
                            <select
                              value={snmpPrivProtocol}
                              onChange={e => setSnmpPrivProtocol(e.target.value as any)}
                              className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold focus:outline-none"
                            >
                              <option value="AES">AES</option>
                              <option value="DES">DES</option>
                            </select>
                            <input
                              type="password"
                              value={snmpPrivPass}
                              onChange={e => setSnmpPrivPass(e.target.value)}
                              placeholder="Privacy Encryption Passphrase"
                              className="w-64 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505]"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Event Severity Triggers */}
              <div className="grid grid-cols-12 items-start gap-4 border-t border-slate-200 pt-4">
                <label className="col-span-3 text-slate-700 font-bold text-xs text-right pr-2 pt-1">Event Severity Triggers</label>
                <div className="col-span-9 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={snmpTrapCritical}
                      onChange={e => setSnmpTrapCritical(e.target.checked)}
                      className="accent-[#680505] w-4 h-4"
                    />
                    <span className="font-bold text-red-700">Critical / Fatal Events</span>
                    <span className="text-slate-500 text-[11px]">(Power Outages, Memory Uncorrectable ECC, Fan Failures)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={snmpTrapWarning}
                      onChange={e => setSnmpTrapWarning(e.target.checked)}
                      className="accent-[#680505] w-4 h-4"
                    />
                    <span className="font-bold text-amber-700">Warning / Degradation Events</span>
                    <span className="text-slate-500 text-[11px]">(Thermal Thresholds, Redundancy Degraded, Disk Degraded)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={snmpTrapInfo}
                      onChange={e => setSnmpTrapInfo(e.target.checked)}
                      className="accent-[#680505] w-4 h-4"
                    />
                    <span className="font-bold text-blue-700">Informational / Operational Events</span>
                    <span className="text-slate-500 text-[11px]">(User logins, Virtual Media Mounts, System Reboots)</span>
                  </label>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={handleSendTestTrap}
                  disabled={sendingTestTrap || !snmpEnabled}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded cursor-pointer text-xs disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTestTrap ? "animate-pulse" : ""}`} />
                  <span>{sendingTestTrap ? "Transmitting Trap..." : "Send Test Trap"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSnmpConfig}
                  className="px-5 py-2 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded cursor-pointer text-xs shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <Save className="w-3.5 h-[#680505]" />
                  <span>Save SNMP Trap Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}





      {/* Add SMTP Subscription Modal */}
      {showAddSmtpModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none font-sans">
          <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs">
            <div className="bg-[#680505] text-white px-5 py-3.5 font-bold text-sm flex justify-between items-center border-b border-[#4d0000]">
              <span>Add Email Subscription</span>
              <button onClick={() => setShowAddSmtpModal(false)} className="text-white hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 font-sans bg-slate-50/50">
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs">SMTP Server *</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={smtpServerInput}
                    onChange={e => setSmtpServerInput(e.target.value)}
                    placeholder="e.g. smtp.company.com"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs">Port</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={smtpPortInput}
                    onChange={e => setSmtpPortInput(e.target.value)}
                    placeholder="587"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs">Connection</label>
                <div className="col-span-8">
                  <select
                    value={smtpConnInput}
                    onChange={e => setSmtpConnInput(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                  >
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="SSL/TLS">SSL/TLS</option>
                    <option value="None">None</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs">Account</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={smtpAccountInput}
                    onChange={e => setSmtpAccountInput(e.target.value)}
                    placeholder="e.g. alerts@company.com"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs">From Email Address *</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={smtpFromEmailInput}
                    onChange={e => setSmtpFromEmailInput(e.target.value)}
                    placeholder="e.g. no-reply@company.com"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={handleAddSmtpSubscription}
                className="px-6 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded cursor-pointer text-xs shadow-xs"
              >
                Save
              </button>
              <button
                onClick={() => setShowAddSmtpModal(false)}
                className="px-5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded cursor-pointer text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none font-sans">
          <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs">
            {/* Header */}
            <div className="bg-[#680505] text-white px-5 py-3.5 font-bold text-sm flex justify-between items-center border-b border-[#4d0000]">
              <span>Create User</span>
              <button onClick={() => setShowAddUserModal(false)} className="text-white hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 font-sans bg-slate-50/50">
              {userFormError && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded text-xs">
                  {userFormError}
                </div>
              )}

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Account Type</label>
                <div className="col-span-8">
                  <select
                    value={accountType}
                    onChange={e => setAccountType(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                  >
                    <option value="DCM Console User">DCM Console User</option>
                    <option value="IPMI / BMC User">IPMI / BMC User</option>
                    <option value="LDAP User">LDAP User</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Username</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="Required"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs placeholder-slate-400 focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Role</label>
                <div className="col-span-8">
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                  >
                    <option value="Administrator">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Description</label>
                <div className="col-span-8">
                  <input
                    type="text"
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#680505]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Password</label>
                <div className="col-span-8 relative flex items-center">
                  <input
                    type={showUserPassword ? "text" : "password"}
                    value={userPassword}
                    onChange={e => setUserPassword(e.target.value)}
                    placeholder="Required"
                    className="w-full px-3 py-1.5 pr-9 bg-white border border-slate-300 rounded text-xs placeholder-slate-400 focus:outline-none focus:border-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showUserPassword ? "Hide password" : "Show password"}
                  >
                    {showUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-700 font-bold text-xs text-left">Confirm Password</label>
                <div className="col-span-8 relative flex items-center">
                  <input
                    type={showConfirmUserPassword ? "text" : "password"}
                    value={confirmUserPassword}
                    onChange={e => setConfirmUserPassword(e.target.value)}
                    placeholder="Required"
                    className="w-full px-3 py-1.5 pr-9 bg-white border border-slate-300 rounded text-xs placeholder-slate-400 focus:outline-none focus:border-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmUserPassword(!showConfirmUserPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showConfirmUserPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={handleAddUser}
                className="px-6 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded cursor-pointer text-xs shadow-xs"
              >
                OK
              </button>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="px-5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded cursor-pointer text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!userToDelete}
        title="Delete User Account"
        message={`Are you sure you want to delete user account '${userToDelete?.username}'?`}
        confirmText="Delete User"
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
