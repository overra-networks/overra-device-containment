import { create } from "zustand";

export interface DeviceBasic {
  id: string;
  name: string;
  hostname: string;
  os: string;
  agentVersion: string;
  status: "normal" | "contained" | "offline" | "pending";
  lastHeartbeat: string | null;
  walletAuthority: string | null;
  lastAuthorization: string | null;
  networkDisabled: boolean;
  sessionsRevoked: boolean;
  extensionsFrozen: boolean;
  screenLocked: boolean;
  containmentConfig: {
    disableNetwork: boolean;
    revokeSessions: boolean;
    freezeExtensions: boolean;
    lockScreen: boolean;
  } | null;
}

export interface AuditLogEntry {
  id: string;
  deviceId: string;
  timestamp: string;
  event: string;
  result: "success" | "executed" | "failed" | "pending";
  signature: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
}

interface DeviceStore {
  devices: DeviceBasic[];
  currentDevice: DeviceBasic | null;
  logs: AuditLogEntry[];
  loading: boolean;
  error: string | null;

  setDevices: (devices: DeviceBasic[]) => void;
  setCurrentDevice: (device: DeviceBasic | null) => void;
  updateDeviceStatus: (deviceId: string, status: DeviceBasic["status"]) => void;
  updateDeviceHeartbeat: (deviceId: string, lastHeartbeat: string) => void;
  setLogs: (logs: AuditLogEntry[]) => void;
  prependLog: (log: AuditLogEntry) => void;
  updateConfig: (
    deviceId: string,
    config: Partial<DeviceBasic["containmentConfig"]>
  ) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  currentDevice: null,
  logs: [],
  loading: false,
  error: null,

  setDevices: (devices) => set({ devices }),

  setCurrentDevice: (device) => set({ currentDevice: device }),

  updateDeviceStatus: (deviceId, status) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, status } : d
      ),
      currentDevice:
        state.currentDevice?.id === deviceId
          ? { ...state.currentDevice, status }
          : state.currentDevice,
    })),

  updateDeviceHeartbeat: (deviceId, lastHeartbeat) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, lastHeartbeat } : d
      ),
      currentDevice:
        state.currentDevice?.id === deviceId
          ? { ...state.currentDevice, lastHeartbeat }
          : state.currentDevice,
    })),

  setLogs: (logs) => set({ logs }),

  prependLog: (log) =>
    set((state) => ({ logs: [log, ...state.logs] })),

  updateConfig: (deviceId, config) =>
    set((state) => {
      const updateDevice = (d: DeviceBasic): DeviceBasic =>
        d.id !== deviceId
          ? d
          : {
              ...d,
              containmentConfig: {
                disableNetwork: d.containmentConfig?.disableNetwork ?? true,
                revokeSessions: d.containmentConfig?.revokeSessions ?? true,
                freezeExtensions: d.containmentConfig?.freezeExtensions ?? true,
                lockScreen: d.containmentConfig?.lockScreen ?? true,
                ...config,
              },
            };

      return {
        devices: state.devices.map(updateDevice),
        currentDevice: state.currentDevice
          ? updateDevice(state.currentDevice)
          : null,
      };
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
