import { ethers } from "ethers";
import prisma from "@/lib/prisma";
import { broadcaster } from "@/lib/events";

const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Shared containment engine. Extracted verbatim from the per-owner route
 * handlers so the owner routes and the new admin routes cannot drift.
 * Status codes are preserved exactly (regression-gated by the existing
 * containment integration tests).
 */
export class ContainmentError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ContainmentError";
    this.status = status;
  }
}

type Mode = "enter" | "release";

function verifyWalletSignature(
  mode: Mode,
  deviceId: string,
  walletAuthority: string,
  signature?: string,
  message?: string
) {
  if (!signature || !message) {
    throw new ContainmentError(
      400,
      mode === "enter"
        ? "Wallet signature required for this device"
        : "Wallet signature required to release containment"
    );
  }
  const verb = mode === "enter" ? "Activate" : "Release";
  const msgMatch = message.match(
    new RegExp(`^Overra Containment ${verb}: device=([a-f0-9-]+) ts=(\\d+)$`)
  );
  if (!msgMatch || msgMatch[1] !== deviceId) {
    throw new ContainmentError(400, "Invalid signature message format");
  }
  const msgTs = parseInt(msgMatch[2], 10);
  if (Math.abs(Date.now() - msgTs) > SIGNATURE_TTL_MS) {
    throw new ContainmentError(
      400,
      "Wallet signature has expired, please try again"
    );
  }
  const recovered = ethers.verifyMessage(message, signature);
  if (recovered.toLowerCase() !== walletAuthority.toLowerCase()) {
    throw new ContainmentError(403, "Invalid wallet signature");
  }
}

interface ActorOptions {
  signature?: string;
  message?: string;
  /**
   * When set, the device must belong to this user or a 404 is thrown
   * (owner routes pass session.user.id; admin routes omit it for
   * deliberate cross-tenant access).
   */
  requireOwnerUserId?: string;
  /** Wallet recorded in the device AuditLog metadata only. */
  actorWallet?: string | null;
  ipAddress?: string | null;
}

async function loadDevice(deviceId: string, requireOwnerUserId?: string) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, deletedAt: null },
    include: { containmentConfig: true },
  });
  if (
    !device ||
    (requireOwnerUserId !== undefined && device.userId !== requireOwnerUserId)
  ) {
    throw new ContainmentError(404, "Device not found");
  }
  return device;
}

export async function enterContainment(deviceId: string, opts: ActorOptions) {
  const device = await loadDevice(deviceId, opts.requireOwnerUserId);
  if (device.status === "contained") {
    throw new ContainmentError(409, "Device is already contained");
  }
  if (device.walletAuthority) {
    verifyWalletSignature(
      "enter",
      deviceId,
      device.walletAuthority,
      opts.signature,
      opts.message
    );
  }

  const config = device.containmentConfig;
  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: "contained",
      lastAuthorization: new Date(),
      networkDisabled: config?.disableNetwork ?? true,
      sessionsRevoked: config?.revokeSessions ?? true,
      extensionsFrozen: config?.freezeExtensions ?? true,
      screenLocked: config?.lockScreen ?? true,
    },
  });

  // Device AuditLog stays attributed to the device OWNER so the device's
  // own trail is coherent; the privileged admin actor (if any) is recorded
  // separately in AdminAuditLog by the admin route.
  const log = await prisma.auditLog.create({
    data: {
      deviceId,
      userId: device.userId,
      event: "Containment mode activated",
      result: "success",
      signature: opts.signature || null,
      ipAddress: opts.ipAddress || null,
      metadata: { wallet: opts.actorWallet || null },
    },
  });

  // Broadcast to the device OWNER so their portal updates regardless of
  // who initiated the action.
  broadcaster.broadcastToUser(device.userId, "device:status_update", {
    deviceId,
    status: "contained",
  });
  broadcaster.broadcastToUser(device.userId, "log:new_entry", log);

  return { device: updatedDevice, log, ownerUserId: device.userId };
}

export async function releaseContainment(deviceId: string, opts: ActorOptions) {
  const device = await loadDevice(deviceId, opts.requireOwnerUserId);
  if (device.status !== "contained") {
    throw new ContainmentError(409, "Device is not in containment");
  }
  if (device.walletAuthority) {
    verifyWalletSignature(
      "release",
      deviceId,
      device.walletAuthority,
      opts.signature,
      opts.message
    );
  }

  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: "normal",
      networkDisabled: false,
      sessionsRevoked: false,
      extensionsFrozen: false,
      screenLocked: false,
      lastAuthorization: new Date(),
    },
  });

  const log = await prisma.auditLog.create({
    data: {
      deviceId,
      userId: device.userId,
      event: "Containment mode released",
      result: "success",
      signature: opts.signature || null,
      ipAddress: opts.ipAddress || null,
      metadata: { wallet: opts.actorWallet || null },
    },
  });

  broadcaster.broadcastToUser(device.userId, "device:status_update", {
    deviceId,
    status: "normal",
  });
  broadcaster.broadcastToUser(device.userId, "log:new_entry", log);

  return { device: updatedDevice, log, ownerUserId: device.userId };
}

export async function updateContainmentConfig(
  deviceId: string,
  toggles: {
    disable_network?: boolean;
    revoke_sessions?: boolean;
    freeze_extensions?: boolean;
    lock_screen?: boolean;
  },
  requireOwnerUserId?: string
) {
  await loadDevice(deviceId, requireOwnerUserId);
  const { disable_network, revoke_sessions, freeze_extensions, lock_screen } =
    toggles;

  return prisma.containmentConfig.upsert({
    where: { deviceId },
    create: {
      deviceId,
      disableNetwork: disable_network ?? true,
      revokeSessions: revoke_sessions ?? true,
      freezeExtensions: freeze_extensions ?? true,
      lockScreen: lock_screen ?? true,
    },
    update: {
      ...(disable_network !== undefined && { disableNetwork: disable_network }),
      ...(revoke_sessions !== undefined && { revokeSessions: revoke_sessions }),
      ...(freeze_extensions !== undefined && {
        freezeExtensions: freeze_extensions,
      }),
      ...(lock_screen !== undefined && { lockScreen: lock_screen }),
    },
  });
}
