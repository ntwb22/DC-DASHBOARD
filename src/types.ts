export interface RedfishHealth {
  State: "Enabled" | "Disabled" | "StandbyOffline" | "StandbySpare" | "Starting" | "Absent" | "UnavailableOffline" | "Deferring" | "Quiesced" | "Updating";
  Health: "OK" | "Warning" | "Critical";
  HealthRollup?: "OK" | "Warning" | "Critical";
}

export interface RedfishSystem {
  "@odata.id"?: string;
  Id: string;
  Name: string;
  SystemType: string;
  AssetTag: string;
  Manufacturer: string;
  Model: string;
  SKU: string;
  SerialNumber: string;
  PartNumber: string;
  Description: string;
  BiosVersion?: string;
  Status: RedfishHealth;
  PowerState: "On" | "Off" | "PoweringOn" | "PoweringOff";
  IndicatorLED: "Unknown" | "Lit" | "Blinking" | "Off";
  Processors: { count: number; status: RedfishHealth };
  Memory: { totalGiB: number; status: RedfishHealth };
  Storage: { count: number; status: RedfishHealth };
  SimpleStorage?: { "@odata.id"?: string };
}

export interface RedfishEventLogEntry {
  Id?: string;
  id?: string;
  Name?: string;
  EntryType?: string;
  Severity?: "OK" | "Warning" | "Critical" | string;
  severity?: string;
  Created?: string;
  Message?: string;
  message?: string;
  SensorType?: string;
  SensorNumber?: number;
  log_type?: string;
  source?: string;
}

export interface FleetAlert {
  id: string;
  server: string;
  component: string;
  severity: "Critical" | "Warning" | "High" | "Medium" | "OK";
  message: string;
  timestamp: string;
}

export interface RedfishUpdateService {
  Id: string;
  Name: string;
  Status: RedfishHealth;
  ServiceEnabled: boolean;
  HttpPushUri: string;
  FirmwareInventory: { "@odata.id": string };
  SoftwareInventory: { "@odata.id": string };
}

export interface RedfishVirtualMedia {
  Id: string;
  Name: string;
  Image: string | null;
  Inserted: boolean;
  WriteProtected: boolean;
  MediaTypes: string[];
  TransferProtocolType: "HTTP" | "HTTPS" | "FTP" | "NFS" | "CIFS";
}

export interface ConnectionConfig {
  url: string;
  username: string;
  password?: string;
  token?: string;
  bmcUsername?: string;
  bmcPassword?: string;
  category?: "SM" | "AS";
}

export interface FleetServer extends ConnectionConfig {
  id: string;
  name?: string;
  ip?: string;
  bmcIp?: string;
  lastSeen?: string;
  health?: "OK" | "Warning" | "Critical";
  category?: "SM" | "AS";
  chassisUri?: string;
  specs?: {
    cpu: string;
    cores: number;
    memory: string;
    storage: string;
  };
}
