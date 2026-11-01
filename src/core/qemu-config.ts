/**
 * Indexed device keys (scsi1, net1, ipconfig0, ...) for the QEMU
 * create/update tools.
 */

import { z } from "zod";

const DEVICE_MAX_INDEX: Record<string, number> = {
  ide: 3,
  sata: 5,
  scsi: 30,
  virtio: 15,
  net: 31,
  ipconfig: 31,
  unused: 255,
};

const DEVICE_KEY_RE =
  /^(ide|sata|scsi|virtio|net|ipconfig|unused)(0|[1-9]\d*)$/;

const DEVICE_KEYS_HELP =
  "ide0-3, sata0-5, scsi0-30, virtio0-15, net0-31, ipconfig0-31, unused0-255";

function isDeviceKey(key: string): boolean {
  const m = DEVICE_KEY_RE.exec(key);
  if (!m) return false;
  return Number(m[2]) <= (DEVICE_MAX_INDEX[m[1] as string] as number);
}

export const devicesSchema = z
  .record(
    z.string().refine(isDeviceKey, {
      message: `Invalid device key. Allowed: ${DEVICE_KEYS_HELP}`,
    }),
    z.string(),
  )
  .optional()
  .describe(
    `Disks, NICs and cloud-init IP config by key (e.g. {"scsi1": "local-lvm:50", "net1": "virtio,bridge=vmbr1"}). Keys: ${DEVICE_KEYS_HELP}`,
  );

/** Copies devices into the body. A key may not also be set as a parameter. */
export function applyDevices(
  body: Record<string, unknown>,
  devices: unknown,
): void {
  if (devices === undefined) return;
  for (const [key, value] of Object.entries(
    devices as Record<string, string>,
  )) {
    if (key in body) {
      throw new Error(`${key} is set both as a parameter and in devices`);
    }
    body[key] = value;
  }
}
