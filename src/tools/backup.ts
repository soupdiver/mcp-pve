/**
 * Backup tools: backup jobs, manual backup execution, and job management.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PveClient } from "../core/client.js";
import { registerTool } from "../core/tools.js";
import { pruneBackupsSchema } from "../core/validators.js";
import type { AppConfig } from "../types/index.js";

/** Options for both the run and the job tool. */
const backupCommonShape = {
  "notes-template": z
    .string()
    .optional()
    .describe("Backup notes (e.g. {{guestname}})"),
  protected: z.boolean().optional().describe("Mark the backups as protected"),
  fleecing: z
    .string()
    .optional()
    .describe("Fleecing options, VMs only (e.g. enabled=1,storage=local-lvm)"),
  "pbs-change-detection-mode": z
    .enum(["legacy", "data", "metadata"])
    .optional()
    .describe("PBS change detection, containers only"),
  "notification-mode": z
    .enum(["auto", "legacy-sendmail", "notification-system"])
    .optional()
    .describe("Notification system"),
  bwlimit: z.number().optional().describe("I/O limit in KiB/s"),
  ionice: z.number().optional().describe("I/O priority"),
  lockwait: z.number().optional().describe("Minutes to wait for the lock"),
  stopwait: z
    .number()
    .optional()
    .describe("Minutes to wait for a guest to stop"),
};

function applyBackupCommon(
  body: Record<string, unknown>,
  args: Record<string, unknown>,
): void {
  for (const key of Object.keys(backupCommonShape)) {
    const v = args[key];
    if (v === undefined) continue;
    body[key] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
}

export function registerBackupTools(
  server: McpServer,
  client: PveClient,
  config: AppConfig,
): void {
  // --- Read-only tools ---

  registerTool(server, config, {
    name: "pve_list_backup_jobs",
    title: "List Backup Jobs",
    description: "List all scheduled backup jobs in the cluster",
    category: "backup",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    handler: async () => {
      const data = await client.get("/cluster/backup");
      return JSON.stringify(data, null, 2);
    },
  });

  registerTool(server, config, {
    name: "pve_get_backup_job",
    title: "Get Backup Job",
    description: "Get the configuration of a specific backup job",
    category: "backup",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      id: z.string().describe("The backup job ID"),
    },
    handler: async (args) => {
      const data = await client.get(`/cluster/backup/${args.id}`);
      return JSON.stringify(data, null, 2);
    },
  });

  // --- Read-execute tools ---

  registerTool(server, config, {
    name: "pve_run_backup",
    title: "Run Backup",
    description:
      "Run an immediate backup (vzdump) of one or more VMs/containers on a node",
    category: "backup",
    accessTier: "read-execute",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      node: z.string().describe("The node name"),
      vmid: z
        .string()
        .optional()
        .describe("Comma-separated list of VMIDs to back up (omit for all)"),
      storage: z.string().optional().describe("Target storage for the backup"),
      mode: z
        .enum(["snapshot", "suspend", "stop"])
        .optional()
        .describe("Backup mode (default: snapshot)"),
      compress: z
        .enum(["0", "gzip", "lzo", "zstd"])
        .optional()
        .describe("Compression algorithm"),
      mailnotification: z
        .enum(["always", "failure"])
        .optional()
        .describe("When to send email notification"),
      mailto: z
        .string()
        .optional()
        .describe("Email address for backup notifications"),
      ...backupCommonShape,
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.vmid !== undefined) body.vmid = args.vmid;
      if (args.storage !== undefined) body.storage = args.storage;
      if (args.mode !== undefined) body.mode = args.mode;
      if (args.compress !== undefined) body.compress = args.compress;
      if (args.mailnotification !== undefined)
        body.mailnotification = args.mailnotification;
      if (args.mailto !== undefined) body.mailto = args.mailto;
      applyBackupCommon(body, args);
      const data = await client.post(`/nodes/${args.node}/vzdump`, body);
      return `Backup initiated on node ${args.node}. Task: ${data}`;
    },
  });

  // --- Full access tools ---

  registerTool(server, config, {
    name: "pve_create_backup_job",
    title: "Create Backup Job",
    description: "Create a new scheduled backup job",
    category: "backup",
    accessTier: "full",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      vmid: z
        .string()
        .optional()
        .describe("Comma-separated list of VMIDs to include (omit for all)"),
      storage: z.string().optional().describe("Target storage for backups"),
      schedule: z
        .string()
        .optional()
        .describe("Backup schedule in cron-like format or PVE calendar event"),
      mode: z
        .enum(["snapshot", "suspend", "stop"])
        .optional()
        .describe("Backup mode (default: snapshot)"),
      compress: z
        .enum(["0", "gzip", "lzo", "zstd"])
        .optional()
        .describe("Compression algorithm"),
      mailnotification: z
        .enum(["always", "failure"])
        .optional()
        .describe("When to send email notification"),
      mailto: z
        .string()
        .optional()
        .describe("Email address for backup notifications"),
      enabled: z
        .boolean()
        .optional()
        .describe("Enable the backup job (default: true)"),
      node: z.string().optional().describe("Restrict to specific node"),
      pool: z.string().optional().describe("Backup all VMs in this pool"),
      maxfiles: z
        .number()
        .optional()
        .describe("Maximum number of backup files per VM (0 = unlimited)"),
      id: z.string().optional().describe("Job ID"),
      comment: z.string().optional().describe("Job comment"),
      all: z.boolean().optional().describe("Back up all guests"),
      exclude: z
        .string()
        .refine((v) => /^\d+(,\d+)*$/.test(v), {
          message: "Expected VMIDs like 100,101",
        })
        .optional()
        .describe("VMIDs to skip, comma-separated"),
      "prune-backups": pruneBackupsSchema("Retention"),
      remove: z.boolean().optional().describe("Prune old backups"),
      "repeat-missed": z
        .boolean()
        .optional()
        .describe("Run a missed job later"),
      ...backupCommonShape,
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.vmid !== undefined) body.vmid = args.vmid;
      if (args.storage !== undefined) body.storage = args.storage;
      if (args.schedule !== undefined) body.schedule = args.schedule;
      if (args.mode !== undefined) body.mode = args.mode;
      if (args.compress !== undefined) body.compress = args.compress;
      if (args.mailnotification !== undefined)
        body.mailnotification = args.mailnotification;
      if (args.mailto !== undefined) body.mailto = args.mailto;
      if (args.enabled !== undefined) body.enabled = args.enabled ? 1 : 0;
      if (args.node !== undefined) body.node = args.node;
      if (args.pool !== undefined) body.pool = args.pool;
      if (args.maxfiles !== undefined) body.maxfiles = args.maxfiles;
      if (args.id !== undefined) body.id = args.id;
      if (args.comment !== undefined) body.comment = args.comment;
      if (args.exclude !== undefined) body.exclude = args.exclude;
      if (args["prune-backups"] !== undefined)
        body["prune-backups"] = args["prune-backups"];
      if (args.all !== undefined) body.all = args.all ? 1 : 0;
      if (args.remove !== undefined) body.remove = args.remove ? 1 : 0;
      if (args["repeat-missed"] !== undefined)
        body["repeat-missed"] = args["repeat-missed"] ? 1 : 0;
      applyBackupCommon(body, args);
      await client.post("/cluster/backup", body);
      return "Backup job created successfully.";
    },
  });

  registerTool(server, config, {
    name: "pve_delete_backup_job",
    title: "Delete Backup Job",
    description: "Delete a scheduled backup job",
    category: "backup",
    accessTier: "full",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
    inputSchema: {
      id: z.string().describe("The backup job ID to delete"),
    },
    handler: async (args) => {
      await client.delete(`/cluster/backup/${args.id}`);
      return `Backup job '${args.id}' deleted successfully.`;
    },
  });
}
