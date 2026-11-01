/**
 * Typed options and indexed devices for the LXC create/update tools.
 */

import { z } from "zod";

const MAX_INDEX: Record<string, number> = { mp: 255, net: 31 };

const KEY_RE = /^(mp|net)(0|[1-9]\d*)$/;

const KEYS_HELP = "mp0-255, net0-31";

function isLxcDeviceKey(key: string): boolean {
  const m = KEY_RE.exec(key);
  if (!m) return false;
  return Number(m[2]) <= (MAX_INDEX[m[1] as string] as number);
}

export const lxcDevicesSchema = z
  .record(
    z.string().refine(isLxcDeviceKey, {
      message: `Invalid device key. Allowed: ${KEYS_HELP}`,
    }),
    z.string(),
  )
  .optional()
  .describe(
    `Mount points and NICs by key (e.g. {"mp0": "local-lvm:8,mp=/data", "net1": "name=eth1,bridge=vmbr1,ip=dhcp"}). Keys: ${KEYS_HELP}`,
  );

export const lxcOptionsShape = {
  ostype: z
    .enum([
      "debian",
      "devuan",
      "ubuntu",
      "centos",
      "fedora",
      "opensuse",
      "archlinux",
      "alpine",
      "gentoo",
      "nixos",
      "unmanaged",
    ])
    .optional()
    .describe("OS type"),
  nameserver: z.string().optional().describe("DNS server"),
  searchdomain: z.string().optional().describe("DNS search domain"),
  timezone: z.string().optional().describe("Time zone (e.g. Europe/Berlin)"),
  cpulimit: z.number().optional().describe("CPU limit in cores (0 = none)"),
  cpuunits: z.number().optional().describe("CPU weight (default: 100)"),
  protection: z.boolean().optional().describe("Protect from removal"),
  console: z.boolean().optional().describe("Attach a console"),
  tty: z.number().optional().describe("Number of ttys (0-6)"),
  cmode: z
    .enum(["shell", "console", "tty"])
    .optional()
    .describe("Console mode"),
  devices: lxcDevicesSchema,
};

const PASSTHROUGH = [
  "ostype",
  "nameserver",
  "searchdomain",
  "timezone",
  "cpulimit",
  "cpuunits",
  "tty",
  "cmode",
] as const;

export function applyLxcOptions(
  body: Record<string, unknown>,
  args: Record<string, unknown>,
): void {
  for (const key of PASSTHROUGH) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  for (const key of ["protection", "console"] as const) {
    if (args[key] !== undefined) body[key] = args[key] ? 1 : 0;
  }
  const devices = (args.devices ?? {}) as Record<string, string>;
  for (const [key, value] of Object.entries(devices)) {
    if (key in body) {
      throw new Error(`${key} is set both as a parameter and in devices`);
    }
    body[key] = value;
  }
}
