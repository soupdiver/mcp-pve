/**
 * Typed VM options for the QEMU create/update tools.
 */

import { z } from "zod";
import { digestSchema, optionListSchema } from "./validators.js";

export const qemuCpuSchema = z
  .string()
  .optional()
  .describe("CPU type with optional flags (e.g. host,flags=+nested-virt)");

export const qemuBootSchema = z
  .string()
  .optional()
  .describe("Boot order (e.g. order=scsi0;ide2;net0)");

/**
 * Options for create and update. cpu and boot are exported on their own
 * because create already has boot and update already has cpu.
 */
export const qemuOptionsShape = {
  bios: z.enum(["seabios", "ovmf"]).optional().describe("BIOS type"),
  machine: z.string().optional().describe("Machine type (e.g. q35)"),
  efidisk0: z
    .string()
    .optional()
    .describe("EFI disk (e.g. local-lvm:1,efitype=4m,pre-enrolled-keys=1)"),
  tpmstate0: z
    .string()
    .optional()
    .describe("TPM state disk (e.g. local-lvm:1,version=v2.0)"),
  tags: z
    .string()
    .optional()
    .describe("Tags, semicolon-separated (e.g. prod;web)"),
  vga: z.string().optional().describe("Display (e.g. std, qxl)"),
  serial0: z
    .enum(["socket"])
    .optional()
    .describe("Serial port 0, only socket is supported"),
  startup: z
    .string()
    .optional()
    .describe("Startup order (e.g. order=1,up=30,down=60)"),
  numa: z.boolean().optional().describe("Enable NUMA"),
  balloon: z.number().optional().describe("Minimum memory in MB (0 disables)"),
  hotplug: z
    .string()
    .optional()
    .describe("Hotplug features (e.g. disk,network,usb)"),
  protection: z.boolean().optional().describe("Protect from removal"),
  ciuser: z.string().optional().describe("Cloud-init user"),
  cipassword: z.string().optional().describe("Cloud-init password"),
  nameserver: z.string().optional().describe("Cloud-init DNS server"),
  searchdomain: z.string().optional().describe("Cloud-init search domain"),
  sshkeys: z
    .string()
    .optional()
    .describe("Cloud-init SSH public keys, one per line"),
};

export const qemuUpdateShape = {
  delete: optionListSchema("Options to remove", "tags,scsi2"),
  revert: optionListSchema("Pending options to revert", "memory,cores"),
  digest: digestSchema(
    "Config digest, the update fails if the config changed since",
  ),
};

const PASSTHROUGH = [
  "bios",
  "machine",
  "efidisk0",
  "tpmstate0",
  "tags",
  "vga",
  "serial0",
  "startup",
  "hotplug",
  "ciuser",
  "cipassword",
  "nameserver",
  "searchdomain",
] as const;

export function applyQemuOptions(
  body: Record<string, unknown>,
  args: Record<string, unknown>,
): void {
  for (const key of PASSTHROUGH) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  if (args.numa !== undefined) body.numa = args.numa ? 1 : 0;
  if (args.protection !== undefined) body.protection = args.protection ? 1 : 0;
  if (args.balloon !== undefined) body.balloon = args.balloon;
  // PVE expects the keys URL-encoded, with %20 for spaces.
  if (args.sshkeys !== undefined)
    body.sshkeys = encodeURIComponent(String(args.sshkeys));
}
