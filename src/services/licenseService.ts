export interface LicenseData {
  serialKey: string;
  edition: "Standard" | "Enterprise" | "Datacenter";
  status: "Active" | "Expired" | "Grace Period" | "Invalid";
  expirationDate: string;
  maxNodes: number;
  company: string;
  email: string;
  macAddress: string;
  features: string[];
  issuedDate: string;
  signature: string;
}

const DEFAULT_ENTERPRISE_LICENSE: LicenseData = {
  serialKey: "TYR-CORE-ENT-2026-9902",
  edition: "Enterprise",
  status: "Active",
  expirationDate: "2028-12-31",
  maxNodes: 500,
  company: "Netweb Technologies India Ltd.",
  email: "admin@netwebindia.com",
  macAddress: "00:15:5D:8A:12:34",
  features: [
    "Full Redfish API Management",
    "AIOps Anomaly Engine",
    "3D Data Center Hierarchy Canvas",
    "GPU Monitoring & Diagnostics",
    "REST & SNMP Proxy Integration"
  ],
  issuedDate: "2026-01-01",
  signature: "SHA256:a9f87c6e5d4b3a2f10987654321fedcba9876543210"
};

const STORAGE_KEY = "tyrone_tcm_license";

export const licenseService = {
  getLicense(): LicenseData {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn("Failed to load license from storage, using default", err);
    }
    return DEFAULT_ENTERPRISE_LICENSE;
  },

  saveLicense(license: LicenseData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
      window.dispatchEvent(new CustomEvent("tcm-license-updated", { detail: license }));
    } catch (err) {
      console.error("Failed to save license data", err);
    }
  },

  validateKey(keyString: string): { valid: boolean; data?: Partial<LicenseData>; message: string } {
    const trimmed = keyString.trim().toUpperCase();
    
    if (!trimmed || trimmed.length < 10) {
      return { valid: false, message: "Invalid key format. License keys must follow format TYR-CORE-XXXX-XXXX-XXXX or TYR-TCM-XXXX-XXXX-XXXX." };
    }

    if (trimmed.includes("DC") || trimmed.includes("DATACENTER")) {
      return {
        valid: true,
        data: {
          serialKey: trimmed,
          edition: "Datacenter",
          status: "Active",
          maxNodes: 10000,
          expirationDate: "2030-12-31",
          features: [
            "Unlimited Server Nodes",
            "High Availability Multi-Cluster",
            "Custom GPU & AI Diagnostics",
            "3D Data Center Hierarchy Canvas",
            "24/7 Enterprise Support SLA"
          ]
        },
        message: "Datacenter Edition License key validated successfully."
      };
    } else if (trimmed.includes("ENT") || trimmed.includes("ENTERPRISE") || trimmed.startsWith("TYR-CORE") || trimmed.startsWith("TYR-TCM")) {
      return {
        valid: true,
        data: {
          serialKey: trimmed,
          edition: "Enterprise",
          status: "Active",
          maxNodes: 500,
          expirationDate: "2028-12-31",
          features: [
            "Up to 500 Managed Server Nodes",
            "Full Redfish API Management",
            "AIOps Anomaly Engine",
            "3D Data Center Hierarchy Canvas",
            "GPU Monitoring & Diagnostics"
          ]
        },
        message: "Enterprise Edition License key validated successfully."
      };
    } else if (trimmed.includes("STD") || trimmed.includes("STANDARD")) {
      return {
        valid: true,
        data: {
          serialKey: trimmed,
          edition: "Standard",
          status: "Active",
          maxNodes: 100,
          expirationDate: "2027-12-31",
          features: [
            "Up to 100 Managed Server Nodes",
            "Basic Redfish Telemetry",
            "Thermal Monitoring & Alerts"
          ]
        },
        message: "Standard Edition License key validated successfully."
      };
    }

    return { valid: false, message: "Unrecognized license key signature or expired key." };
  },

  applyKey(keyString: string): { success: boolean; message: string; license?: LicenseData } {
    const check = this.validateKey(keyString);
    if (!check.valid || !check.data) {
      return { success: false, message: check.message };
    }

    const current = this.getLicense();
    const updated: LicenseData = {
      ...current,
      ...check.data,
      serialKey: check.data.serialKey || keyString.trim().toUpperCase(),
      status: "Active",
      issuedDate: new Date().toISOString().split("T")[0]
    };

    this.saveLicense(updated);
    return { success: true, message: check.message, license: updated };
  },

  resetToDefault(): LicenseData {
    this.saveLicense(DEFAULT_ENTERPRISE_LICENSE);
    return DEFAULT_ENTERPRISE_LICENSE;
  },

  canAddNodes(currentServerCount: number): { allowed: boolean; max: number; current: number } {
    const lic = this.getLicense();
    if (lic.status === "Expired" || lic.status === "Invalid") {
      return { allowed: false, max: lic.maxNodes, current: currentServerCount };
    }
    return {
      allowed: currentServerCount < lic.maxNodes,
      max: lic.maxNodes,
      current: currentServerCount
    };
  },

  generateLicenseRequestFile(company: string, email: string, nodes: number): void {
    const payload = {
      product: "Tyrone Core Console",
      version: "6.2.0.bc154458",
      hardwareMac: "00:15:5D:8A:12:34",
      requestedNodes: nodes,
      company: company || "Netweb Customer",
      contactEmail: email || "admin@example.com",
      timestamp: new Date().toISOString(),
      challengeHash: btoa(`${company}:${email}:${nodes}:${Date.now()}`)
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Tyrone_Core_Console_License_Request_${Date.now()}.req`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
