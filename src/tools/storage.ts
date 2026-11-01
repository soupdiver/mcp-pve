/**
 * Storage tools: list, status, content, and CRUD for PVE storage backends.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PveClient } from "../core/client.js";
import { registerTool } from "../core/tools.js";
import { optionListSchema, pruneBackupsSchema } from "../core/validators.js";
import type { AppConfig } from "../types/index.js";

interface ContentItem {
  volid: string;
  content?: string;
  subtype?: string;
  vmid?: number;
  ctime?: number;
  size?: number;
}

/**
 * Group content items by (vmid, content type), preserving first-seen order,
 * then sort groups by vmid (items without a vmid, e.g. ISOs, go last).
 */
function groupContent(items: ContentItem[]): ContentItem[][] {
  const groups = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = `${item.vmid ?? ""}|${item.content ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()].sort(
    (a, b) => (a[0].vmid ?? Infinity) - (b[0].vmid ?? Infinity),
  );
}

function newest(group: ContentItem[]): ContentItem {
  return group.reduce((best, item) =>
    (item.ctime ?? 0) > (best.ctime ?? 0) ? item : best,
  );
}

function summarizeGroup(group: ContentItem[]): Record<string, unknown> {
  const latest = newest(group);
  const ctimes = group.map((i) => i.ctime ?? 0);
  return {
    ...(latest.vmid !== undefined && { vmid: latest.vmid }),
    ...(latest.content !== undefined && { content: latest.content }),
    ...(latest.subtype !== undefined && { subtype: latest.subtype }),
    count: group.length,
    total_size: group.reduce((sum, i) => sum + (i.size ?? 0), 0),
    oldest_ctime: Math.min(...ctimes),
    newest_ctime: Math.max(...ctimes),
    latest_volid: latest.volid,
  };
}

/** Options for both create and update. */
const storageCommonShape = {
  "prune-backups": pruneBackupsSchema("Backup retention"),
  "max-protected-backups": z
    .number()
    .optional()
    .describe("Max protected backups per guest (-1 = unlimited)"),
  sparse: z.boolean().optional().describe("Use sparse volumes"),
  format: z
    .enum(["raw", "qcow2", "subvol", "vmdk"])
    .optional()
    .describe("Default image format"),
  preallocation: z
    .enum(["off", "metadata", "falloc", "full"])
    .optional()
    .describe("Preallocation for raw and qcow2 images"),
  fingerprint: z
    .string()
    .optional()
    .describe("Server certificate SHA-256 fingerprint"),
};

function applyStorageCommon(
  body: Record<string, unknown>,
  args: Record<string, unknown>,
): void {
  for (const key of Object.keys(storageCommonShape)) {
    const v = args[key];
    if (v === undefined) continue;
    body[key] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
}

export function registerStorageTools(
  server: McpServer,
  client: PveClient,
  config: AppConfig,
): void {
  // --- Read-only tools ---

  registerTool(server, config, {
    name: "pve_list_storage",
    title: "List Storage",
    description: "List all configured storage backends in the cluster",
    category: "storage",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe(
          "Filter by storage type (e.g. dir, lvm, nfs, zfspool, cephfs)",
        ),
    },
    handler: async (args) => {
      let path = "/storage";
      if (args.type) path += `?type=${args.type}`;
      const data = await client.get(path);
      return JSON.stringify(data, null, 2);
    },
  });

  registerTool(server, config, {
    name: "pve_get_storage_config",
    title: "Get Storage Configuration",
    description: "Get the configuration of a specific storage backend",
    category: "storage",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      storage: z.string().describe("The storage ID"),
    },
    handler: async (args) => {
      const data = await client.get(`/storage/${args.storage}`);
      return JSON.stringify(data, null, 2);
    },
  });

  registerTool(server, config, {
    name: "pve_list_node_storage",
    title: "List Node Storage",
    description:
      "List available storage on a specific node with usage information",
    category: "storage",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      node: z.string().describe("The node name"),
      content: z
        .string()
        .optional()
        .describe(
          "Filter by content type (e.g. images, rootdir, iso, vztmpl, backup)",
        ),
    },
    handler: async (args) => {
      let path = `/nodes/${args.node}/storage`;
      if (args.content) path += `?content=${args.content}`;
      const data = await client.get(path);
      return JSON.stringify(data, null, 2);
    },
  });

  registerTool(server, config, {
    name: "pve_get_storage_status",
    title: "Get Storage Status",
    description: "Get the status and usage of a specific storage on a node",
    category: "storage",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      node: z.string().describe("The node name"),
      storage: z.string().describe("The storage ID"),
    },
    handler: async (args) => {
      const data = await client.get(
        `/nodes/${args.node}/storage/${args.storage}/status`,
      );
      return JSON.stringify(data, null, 2);
    },
  });

  registerTool(server, config, {
    name: "pve_list_storage_content",
    title: "List Storage Content",
    description:
      "List the content (disk images, ISOs, templates, backups) of a specific storage on a node. " +
      "Backup storages (especially PBS) can hold hundreds of snapshots — filter by vmid and/or use " +
      "mode 'latest' (newest item per guest) or 'summary' (count, total size and time range per guest)",
    category: "storage",
    accessTier: "read-only",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      node: z.string().describe("The node name"),
      storage: z.string().describe("The storage ID"),
      content: z
        .string()
        .optional()
        .describe(
          "Filter by content type (e.g. images, iso, vztmpl, backup, rootdir)",
        ),
      vmid: z
        .number()
        .optional()
        .describe("Only list content belonging to this guest (VM/CT ID)"),
      mode: z
        .enum(["all", "latest", "summary"])
        .optional()
        .describe(
          "all (default): every item. latest: only the newest item (by ctime) per guest and content type. " +
            "summary: one row per guest and content type with count, total_size (bytes; logical size — " +
            "PBS deduplicates, so actual datastore usage is lower), oldest/newest ctime and latest_volid",
        ),
    },
    handler: async (args) => {
      let path = `/nodes/${args.node}/storage/${args.storage}/content`;
      const params = new URLSearchParams();
      if (args.content) params.set("content", String(args.content));
      if (args.vmid !== undefined) params.set("vmid", String(args.vmid));
      const qs = params.toString();
      if (qs) path += `?${qs}`;
      const data = (await client.get(path)) as ContentItem[];
      if (args.mode === "latest") {
        return JSON.stringify(groupContent(data).map(newest));
      }
      if (args.mode === "summary") {
        return JSON.stringify(groupContent(data).map(summarizeGroup));
      }
      return JSON.stringify(data);
    },
  });

  // --- Read-execute tools ---

  registerTool(server, config, {
    name: "pve_pull_oci_image",
    title: "Pull OCI Image",
    description:
      "Pull an OCI container image from a registry (e.g. Docker Hub, GHCR) into a storage's template cache for use as an LXC container template (PVE 9.1+). Returns a task ID",
    category: "storage",
    accessTier: "read-execute",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      node: z.string().describe("The node name"),
      storage: z
        .string()
        .describe("Target storage ID (must support templates)"),
      reference: z
        .string()
        .describe("OCI image reference (e.g. docker.io/library/alpine:3.20)"),
      filename: z
        .string()
        .optional()
        .describe("Custom destination file name (will be normalized)"),
    },
    handler: async (args) => {
      const body: Record<string, unknown> = { reference: args.reference };
      if (args.filename !== undefined) body.filename = args.filename;
      const data = await client.post(
        `/nodes/${args.node}/storage/${args.storage}/oci-registry-pull`,
        body,
      );
      return `OCI image pull initiated for '${args.reference}' on storage '${args.storage}'. Task: ${data}`;
    },
  });

  // --- Full access tools ---

  registerTool(server, config, {
    name: "pve_create_storage",
    title: "Create Storage",
    description: "Create a new storage backend in the cluster",
    category: "storage",
    accessTier: "full",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      storage: z.string().describe("The storage ID"),
      type: z
        .string()
        .describe(
          "Storage type (e.g. dir, lvm, nfs, zfspool, cifs, cephfs, rbd)",
        ),
      content: z
        .string()
        .optional()
        .describe(
          "Allowed content types, comma-separated (e.g. images,rootdir,iso)",
        ),
      path: z
        .string()
        .optional()
        .describe("Filesystem path (for dir, nfs types)"),
      server: z
        .string()
        .optional()
        .describe("Server address (for nfs, cifs, cephfs types)"),
      export: z.string().optional().describe("NFS export path"),
      vgname: z.string().optional().describe("LVM volume group name"),
      pool: z.string().optional().describe("ZFS/Ceph pool name"),
      nodes: z
        .string()
        .optional()
        .describe("Comma-separated list of nodes where storage is available"),
      shared: z
        .boolean()
        .optional()
        .describe("Whether the storage is shared across nodes"),
      disable: z.boolean().optional().describe("Create the storage disabled"),
      thinpool: z.string().optional().describe("LVM thin pool name"),
      datastore: z.string().optional().describe("PBS datastore name"),
      namespace: z.string().optional().describe("PBS namespace"),
      username: z.string().optional().describe("User (e.g. backup@pbs)"),
      password: z
        .string()
        .optional()
        .describe("Password for the share or datastore"),
      share: z.string().optional().describe("CIFS share"),
      domain: z.string().optional().describe("CIFS domain"),
      smbversion: z
        .enum(["default", "2.0", "2.1", "3", "3.0", "3.11"])
        .optional()
        .describe("SMB version"),
      subdir: z.string().optional().describe("Subdirectory to mount"),
      ...storageCommonShape,
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {
        storage: args.storage,
        type: args.type,
      };
      if (args.content !== undefined) body.content = args.content;
      if (args.path !== undefined) body.path = args.path;
      if (args.server !== undefined) body.server = args.server;
      if (args.export !== undefined) body.export = args.export;
      if (args.vgname !== undefined) body.vgname = args.vgname;
      if (args.pool !== undefined) body.pool = args.pool;
      if (args.nodes !== undefined) body.nodes = args.nodes;
      if (args.shared !== undefined) body.shared = args.shared ? 1 : 0;
      if (args.disable !== undefined) body.disable = args.disable ? 1 : 0;
      for (const key of [
        "thinpool",
        "datastore",
        "namespace",
        "username",
        "password",
        "share",
        "domain",
        "smbversion",
        "subdir",
      ]) {
        if (args[key] !== undefined) body[key] = args[key];
      }
      applyStorageCommon(body, args);
      await client.post("/storage", body);
      return `Storage '${args.storage}' (type: ${args.type}) created successfully.`;
    },
  });

  registerTool(server, config, {
    name: "pve_update_storage",
    title: "Update Storage",
    description: "Update the configuration of an existing storage backend",
    category: "storage",
    accessTier: "full",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      storage: z.string().describe("The storage ID"),
      content: z
        .string()
        .optional()
        .describe("Allowed content types, comma-separated"),
      nodes: z
        .string()
        .optional()
        .describe("Comma-separated list of nodes where storage is available"),
      shared: z
        .boolean()
        .optional()
        .describe("Whether the storage is shared across nodes"),
      disable: z.boolean().optional().describe("Disable the storage"),
      ...storageCommonShape,
      delete: optionListSchema("Settings to remove", "nodes"),
    },
    handler: async (args) => {
      const body: Record<string, unknown> = {};
      if (args.content !== undefined) body.content = args.content;
      if (args.nodes !== undefined) body.nodes = args.nodes;
      if (args.shared !== undefined) body.shared = args.shared ? 1 : 0;
      if (args.disable !== undefined) body.disable = args.disable ? 1 : 0;
      applyStorageCommon(body, args);
      if (args.delete !== undefined) body.delete = args.delete;
      await client.put(`/storage/${args.storage}`, body);
      return `Storage '${args.storage}' updated successfully.`;
    },
  });

  registerTool(server, config, {
    name: "pve_delete_storage",
    title: "Delete Storage",
    description: "Delete a storage backend configuration from the cluster",
    category: "storage",
    accessTier: "full",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
    inputSchema: {
      storage: z.string().describe("The storage ID to delete"),
    },
    handler: async (args) => {
      await client.delete(`/storage/${args.storage}`);
      return `Storage '${args.storage}' deleted successfully.`;
    },
  });
}
