import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PveClient } from "../core/client.js";
import { createServer } from "../core/server.js";
import { registerAllTools } from "../tools/index.js";
import { connectTestClient, makeConfig, makeMockClient } from "./helpers.js";

describe("handler: pve_list_nodes", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns node list as JSON text", async () => {
    const fakeNodes = [{ node: "pve1", status: "online" }];
    vi.mocked(mockClient.get).mockResolvedValueOnce(fakeNodes);

    const result = await mcpClient.callTool({
      name: "pve_list_nodes",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(JSON.parse(text)).toEqual(fakeNodes);
  });

  it("returns isError when client throws", async () => {
    vi.mocked(mockClient.get).mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const result = await mcpClient.callTool({
      name: "pve_list_nodes",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("connection refused");
  });
});

describe("handler: pve_get_node_status", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("calls client.get with correct path", async () => {
    const fakeStatus = { cpu: 0.05, memory: { used: 1024 } };
    vi.mocked(mockClient.get).mockResolvedValueOnce(fakeStatus);

    const result = await mcpClient.callTool({
      name: "pve_get_node_status",
      arguments: { node: "pve1" },
    });

    expect(mockClient.get).toHaveBeenCalledWith("/nodes/pve1/status");
    expect(result.isError).toBeFalsy();
  });

  it("rejects missing required node argument", async () => {
    const result = await mcpClient.callTool({
      name: "pve_get_node_status",
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });
});

describe("handler: pve_manage_node_service (read-execute)", () => {
  it("is not registered in read-only mode", async () => {
    const server = createServer();
    registerAllTools(
      server,
      makeMockClient(),
      makeConfig({ accessTier: "read-only" }),
    );
    const { client, cleanup } = await connectTestClient(server);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("pve_manage_node_service");
    await cleanup();
  });

  it("calls client.post with correct path", async () => {
    const mockClient = makeMockClient();
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve1:task123");
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const { client, cleanup } = await connectTestClient(server);

    const result = await client.callTool({
      name: "pve_manage_node_service",
      arguments: { node: "pve1", service: "pveproxy", command: "restart" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/nodes/pve1/services/pveproxy/restart",
    );
    await cleanup();
  });
});

describe("handler: pve_list_ha_rules", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("calls client.get with /cluster/ha/rules and no query by default", async () => {
    const fakeRules = [{ rule: "keep-apart", type: "resource-affinity" }];
    vi.mocked(mockClient.get).mockResolvedValueOnce(fakeRules);

    const result = await mcpClient.callTool({
      name: "pve_list_ha_rules",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.get).toHaveBeenCalledWith("/cluster/ha/rules");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(JSON.parse(text)).toEqual(fakeRules);
  });

  it("passes type and resource filters as query params", async () => {
    vi.mocked(mockClient.get).mockResolvedValueOnce([]);

    await mcpClient.callTool({
      name: "pve_list_ha_rules",
      arguments: { type: "node-affinity", resource: "vm:100" },
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      "/cluster/ha/rules?type=node-affinity&resource=vm%3A100",
    );
  });
});

describe("handler: pve_get_ha_rule", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("calls client.get with the rule id in the path", async () => {
    const fakeRule = { rule: "keep-apart", type: "resource-affinity" };
    vi.mocked(mockClient.get).mockResolvedValueOnce(fakeRule);

    const result = await mcpClient.callTool({
      name: "pve_get_ha_rule",
      arguments: { rule: "keep-apart" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.get).toHaveBeenCalledWith("/cluster/ha/rules/keep-apart");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(JSON.parse(text)).toEqual(fakeRule);
  });
});

describe("handler: HA rule write tools", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_ha_rule posts required and optional fields", async () => {
    const result = await mcpClient.callTool({
      name: "pve_create_ha_rule",
      arguments: {
        rule: "keep-apart",
        type: "resource-affinity",
        resources: "vm:100,vm:101",
        affinity: "negative",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/cluster/ha/rules", {
      rule: "keep-apart",
      type: "resource-affinity",
      resources: "vm:100,vm:101",
      affinity: "negative",
    });
  });

  it("pve_update_ha_rule puts to the rule path and converts booleans", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_ha_rule",
      arguments: { rule: "keep-apart", disable: true, comment: "paused" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith(
      "/cluster/ha/rules/keep-apart",
      { disable: 1, comment: "paused" },
    );
  });

  it("pve_update_ha_rule remaps delete_settings to the delete body field", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_ha_rule",
      arguments: { rule: "keep-apart", delete_settings: "comment" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith(
      "/cluster/ha/rules/keep-apart",
      {
        delete: "comment",
      },
    );
  });

  it("pve_delete_ha_rule deletes the rule path", async () => {
    const result = await mcpClient.callTool({
      name: "pve_delete_ha_rule",
      arguments: { rule: "keep-apart" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/cluster/ha/rules/keep-apart",
    );
  });
});

describe("handler: HA arm/disarm", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_disarm_ha posts resource-mode", async () => {
    const result = await mcpClient.callTool({
      name: "pve_disarm_ha",
      arguments: { resource_mode: "freeze" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/cluster/ha/status/disarm-ha",
      { "resource-mode": "freeze" },
    );
  });

  it("pve_arm_ha posts with no body", async () => {
    const result = await mcpClient.callTool({
      name: "pve_arm_ha",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/cluster/ha/status/arm-ha");
  });
});

describe("handler: bulk guest actions", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_bulk_start_guests posts vms array and mapped max-workers", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0000");

    const result = await mcpClient.callTool({
      name: "pve_bulk_start_guests",
      arguments: { vms: [100, 101], max_workers: 2 },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/cluster/bulk-action/guest/start",
      { vms: [100, 101], "max-workers": 2 },
    );
  });

  it("pve_bulk_start_guests rejects an empty vms array", async () => {
    const result = await mcpClient.callTool({
      name: "pve_bulk_start_guests",
      arguments: { vms: [] },
    });

    expect(result.isError).toBe(true);
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("pve_bulk_shutdown_guests maps force_stop and timeout", async () => {
    const result = await mcpClient.callTool({
      name: "pve_bulk_shutdown_guests",
      arguments: { vms: [100], timeout: 60, force_stop: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/cluster/bulk-action/guest/shutdown",
      { vms: [100], timeout: 60, "force-stop": 0 },
    );
  });

  it("pve_bulk_suspend_guests maps to-disk and statestorage", async () => {
    const result = await mcpClient.callTool({
      name: "pve_bulk_suspend_guests",
      arguments: { vms: [100], to_disk: true, statestorage: "local-lvm" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/cluster/bulk-action/guest/suspend",
      { vms: [100], "to-disk": 1, statestorage: "local-lvm" },
    );
  });

  it("pve_bulk_migrate_guests requires target and maps online/with-local-disks", async () => {
    const result = await mcpClient.callTool({
      name: "pve_bulk_migrate_guests",
      arguments: {
        vms: [100, 200],
        target: "pve2",
        online: true,
        with_local_disks: true,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/cluster/bulk-action/guest/migrate",
      { vms: [100, 200], target: "pve2", online: 1, "with-local-disks": 1 },
    );
  });
});

describe("handler: pve_pull_oci_image", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("posts the reference to the oci-registry-pull endpoint", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0001");

    const result = await mcpClient.callTool({
      name: "pve_pull_oci_image",
      arguments: {
        node: "pve",
        storage: "local",
        reference: "docker.io/library/alpine:3.20",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/nodes/pve/storage/local/oci-registry-pull",
      { reference: "docker.io/library/alpine:3.20" },
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("UPID:pve:0001");
  });

  it("includes filename when provided", async () => {
    await mcpClient.callTool({
      name: "pve_pull_oci_image",
      arguments: {
        node: "pve",
        storage: "local",
        reference: "ghcr.io/acme/app:v1",
        filename: "acme-app-v1",
      },
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      "/nodes/pve/storage/local/oci-registry-pull",
      { reference: "ghcr.io/acme/app:v1", filename: "acme-app-v1" },
    );
  });
});

describe("handler: PVE 9.1/9.2 parameter additions", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_update_cluster_options passes crs through", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_cluster_options",
      arguments: { crs: "ha=dynamic,ha-auto-rebalance=1" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/cluster/options", {
      crs: "ha=dynamic,ha-auto-rebalance=1",
    });
  });

  it("pve_update_qemu_config passes cpu through", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_qemu_config",
      arguments: { node: "pve", vmid: 100, cpu: "host,flags=+nested-virt" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/qemu/100/config", {
      cpu: "host,flags=+nested-virt",
    });
  });

  it("pve_create_lxc_container passes entrypoint and NUL-joins env", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0002");

    const result = await mcpClient.callTool({
      name: "pve_create_lxc_container",
      arguments: {
        node: "pve",
        vmid: 200,
        ostemplate: "local:vztmpl/alpine-3.20.tar",
        entrypoint: "/usr/bin/redis-server",
        env: ["FOO=bar", "BAZ=qux"],
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/lxc", {
      vmid: 200,
      ostemplate: "local:vztmpl/alpine-3.20.tar",
      entrypoint: "/usr/bin/redis-server",
      env: "FOO=bar\u0000BAZ=qux",
    });
  });
});

describe("handler: LXC create/update new parameters", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_lxc_container passes features, onboot, tags, and startup", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0001");

    const result = await mcpClient.callTool({
      name: "pve_create_lxc_container",
      arguments: {
        node: "pve1",
        vmid: 200,
        ostemplate: "local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst",
        features: "nesting=1,fuse=1",
        onboot: true,
        tags: "prod;web",
        startup: "order=3,up=30",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve1/lxc", {
      vmid: 200,
      ostemplate: "local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst",
      features: "nesting=1,fuse=1",
      onboot: 1,
      tags: "prod;web",
      startup: "order=3,up=30",
    });
  });

  it("pve_update_lxc_config passes features, tags, and startup", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_lxc_config",
      arguments: {
        node: "pve1",
        vmid: 200,
        features: "nesting=1",
        tags: "prod",
        startup: "order=3",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve1/lxc/200/config", {
      features: "nesting=1",
      tags: "prod",
      startup: "order=3",
    });
  });
});

describe("handler: API token tools", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_list_user_tokens gets the user token list", async () => {
    vi.mocked(mockClient.get).mockResolvedValueOnce([
      { tokenid: "automation", privsep: 0 },
    ]);

    const result = await mcpClient.callTool({
      name: "pve_list_user_tokens",
      arguments: { userid: "mcp@pam" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.get).toHaveBeenCalledWith(
      "/access/users/mcp%40pam/token",
    );
  });

  it("pve_create_user_token posts options and prints the secret once", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce({
      "full-tokenid": "mcp@pam!automation",
      info: { privsep: 0 },
      value: "12345678-aaaa-bbbb-cccc-1234567890ab",
    });

    const result = await mcpClient.callTool({
      name: "pve_create_user_token",
      arguments: {
        userid: "mcp@pam",
        tokenid: "automation",
        privsep: false,
        comment: "created by MCP",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/access/users/mcp%40pam/token/automation",
      { privsep: 0, comment: "created by MCP" },
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("mcp@pam!automation");
    expect(text).toContain("12345678-aaaa-bbbb-cccc-1234567890ab");
    expect(text).toContain("cannot be retrieved again");
  });

  it("pve_update_user_token puts the changed fields", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_user_token",
      arguments: {
        userid: "mcp@pam",
        tokenid: "automation",
        comment: "rotated",
        expire: 0,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith(
      "/access/users/mcp%40pam/token/automation",
      { comment: "rotated", expire: 0 },
    );
  });

  it("pve_delete_user_token deletes the token path", async () => {
    const result = await mcpClient.callTool({
      name: "pve_delete_user_token",
      arguments: { userid: "mcp@pam", tokenid: "automation" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.delete).toHaveBeenCalledWith(
      "/access/users/mcp%40pam/token/automation",
    );
  });
});

describe("handler: pve_list_storage_content", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  const backups = [
    {
      volid: "pbs:backup/vm/100/2026-09-01T02:00:00Z",
      content: "backup",
      subtype: "qemu",
      vmid: 100,
      ctime: 1000,
      size: 10,
    },
    {
      volid: "pbs:backup/vm/100/2026-09-03T02:00:00Z",
      content: "backup",
      subtype: "qemu",
      vmid: 100,
      ctime: 3000,
      size: 30,
    },
    {
      volid: "pbs:backup/ct/101/2026-09-02T02:00:00Z",
      content: "backup",
      subtype: "lxc",
      vmid: 101,
      ctime: 2000,
      size: 5,
    },
    {
      volid: "pbs:backup/vm/100/2026-09-02T02:00:00Z",
      content: "backup",
      subtype: "qemu",
      vmid: 100,
      ctime: 2000,
      size: 20,
    },
    { volid: "local:iso/debian.iso", content: "iso", ctime: 500, size: 7 },
  ];

  async function call(args: Record<string, unknown>) {
    const result = await mcpClient.callTool({
      name: "pve_list_storage_content",
      arguments: { node: "pve1", storage: "pbs", ...args },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    return { text, data: JSON.parse(text) };
  }

  beforeEach(async () => {
    mockClient = makeMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(backups);
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns the full list as compact JSON by default", async () => {
    const { text, data } = await call({});
    expect(mockClient.get).toHaveBeenCalledWith(
      "/nodes/pve1/storage/pbs/content",
    );
    expect(data).toEqual(backups);
    expect(text).not.toContain("\n");
  });

  it("passes content and vmid filters to the API", async () => {
    await call({ content: "backup", vmid: 100 });
    expect(mockClient.get).toHaveBeenCalledWith(
      "/nodes/pve1/storage/pbs/content?content=backup&vmid=100",
    );
  });

  it("mode=latest keeps the newest item per guest and content type", async () => {
    const { data } = await call({ mode: "latest" });
    expect(data.map((i: { volid: string }) => i.volid)).toEqual([
      "pbs:backup/vm/100/2026-09-03T02:00:00Z",
      "pbs:backup/ct/101/2026-09-02T02:00:00Z",
      "local:iso/debian.iso",
    ]);
  });

  it("mode=summary aggregates count, size and time range per guest", async () => {
    const { data } = await call({ mode: "summary" });
    expect(data).toEqual([
      {
        vmid: 100,
        content: "backup",
        subtype: "qemu",
        count: 3,
        total_size: 60,
        oldest_ctime: 1000,
        newest_ctime: 3000,
        latest_volid: "pbs:backup/vm/100/2026-09-03T02:00:00Z",
      },
      {
        vmid: 101,
        content: "backup",
        subtype: "lxc",
        count: 1,
        total_size: 5,
        oldest_ctime: 2000,
        newest_ctime: 2000,
        latest_volid: "pbs:backup/ct/101/2026-09-02T02:00:00Z",
      },
      {
        content: "iso",
        count: 1,
        total_size: 7,
        oldest_ctime: 500,
        newest_ctime: 500,
        latest_volid: "local:iso/debian.iso",
      },
    ]);
  });
});

describe("handler: rrddata tools", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  const rows = [
    { time: 1060, cpu: 0.2, maxcpu: 2 },
    { time: 1000, cpu: 0.1, maxcpu: 2 },
  ];

  beforeEach(async () => {
    mockClient = makeMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(rows);
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  async function call(name: string, args: Record<string, unknown>) {
    const result = await mcpClient.callTool({ name, arguments: args });
    expect(result.isError).toBeFalsy();
    return JSON.parse(
      (result.content[0] as { type: "text"; text: string }).text,
    );
  }

  it("pve_get_node_rrddata reads the node's own rrddata", async () => {
    const data = await call("pve_get_node_rrddata", {
      node: "pve1",
      timeframe: "week",
      fields: ["cpu"],
    });
    expect(mockClient.get).toHaveBeenCalledWith(
      "/nodes/pve1/rrddata?timeframe=week",
    );
    expect(data).toMatchObject({
      columns: ["time", "cpu"],
      rows: [
        [1000, 0.1],
        [1060, 0.2],
      ],
    });
  });

  for (const [tool, kind] of [
    ["pve_get_qemu_rrddata", "qemu"],
    ["pve_get_lxc_rrddata", "lxc"],
  ] as const) {
    it(`${tool} returns a compact table by default`, async () => {
      const data = await call(tool, {
        node: "pve1",
        vmid: 100,
        timeframe: "hour",
      });
      expect(mockClient.get).toHaveBeenCalledWith(
        `/nodes/pve1/${kind}/100/rrddata?timeframe=hour`,
      );
      expect(data).toMatchObject({
        constant: { maxcpu: 2 },
        columns: ["time", "cpu"],
        rows: [
          [1000, 0.1],
          [1060, 0.2],
        ],
      });
    });

    it(`${tool} passes cf and returns the raw response on format=raw`, async () => {
      const data = await call(tool, {
        node: "pve1",
        vmid: 100,
        timeframe: "day",
        cf: "MAX",
        format: "raw",
      });
      expect(mockClient.get).toHaveBeenCalledWith(
        `/nodes/pve1/${kind}/100/rrddata?timeframe=day&cf=MAX`,
      );
      expect(data).toEqual(rows);
    });
  }
});

describe("handler: QEMU agent and devices", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_qemu_vm passes agent and devices", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0003");

    const result = await mcpClient.callTool({
      name: "pve_create_qemu_vm",
      arguments: {
        node: "pve",
        vmid: 300,
        agent: "enabled=1,fstrim_cloned_disks=1",
        devices: {
          scsi1: "local-lvm:50,discard=on",
          net1: "virtio,bridge=vmbr1",
          ipconfig0: "ip=dhcp",
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/qemu", {
      vmid: 300,
      agent: "enabled=1,fstrim_cloned_disks=1",
      scsi1: "local-lvm:50,discard=on",
      net1: "virtio,bridge=vmbr1",
      ipconfig0: "ip=dhcp",
    });
  });

  it("pve_update_qemu_config passes agent and devices", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_qemu_config",
      arguments: {
        node: "pve",
        vmid: 100,
        agent: "1",
        devices: { virtio0: "local-lvm:vm-100-disk-1,iothread=1" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/qemu/100/config", {
      agent: "1",
      virtio0: "local-lvm:vm-100-disk-1,iothread=1",
    });
  });

  it("rejects keys outside the allowed ranges", async () => {
    for (const key of [
      "hostpci0",
      "scsi31",
      "ide4",
      "net32",
      "scsi01",
      "args",
    ]) {
      const result = await mcpClient.callTool({
        name: "pve_update_qemu_config",
        arguments: { node: "pve", vmid: 100, devices: { [key]: "x" } },
      });
      expect(result.isError).toBe(true);
    }
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it("rejects a key set both as a parameter and in devices", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_qemu_config",
      arguments: {
        node: "pve",
        vmid: 100,
        scsi0: "local-lvm:vm-100-disk-0",
        devices: { scsi0: "local-lvm:vm-100-disk-1" },
      },
    });
    expect(result.isError).toBe(true);
    expect(mockClient.put).not.toHaveBeenCalled();
  });
});

describe("handler: QEMU VM options", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_qemu_vm passes cpu, pool and the new options", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0004");

    const result = await mcpClient.callTool({
      name: "pve_create_qemu_vm",
      arguments: {
        node: "pve",
        vmid: 301,
        cpu: "host",
        bios: "ovmf",
        machine: "q35",
        efidisk0: "local-lvm:1,efitype=4m,pre-enrolled-keys=1",
        tpmstate0: "local-lvm:1,version=v2.0",
        pool: "prod",
        tags: "prod;web",
        vga: "std",
        serial0: "socket",
        startup: "order=1,up=30",
        numa: true,
        balloon: 0,
        hotplug: "disk,network",
        protection: false,
        boot: "order=scsi0;net0",
        ciuser: "ops",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/qemu", {
      vmid: 301,
      boot: "order=scsi0;net0",
      pool: "prod",
      cpu: "host",
      bios: "ovmf",
      machine: "q35",
      efidisk0: "local-lvm:1,efitype=4m,pre-enrolled-keys=1",
      tpmstate0: "local-lvm:1,version=v2.0",
      tags: "prod;web",
      vga: "std",
      serial0: "socket",
      startup: "order=1,up=30",
      hotplug: "disk,network",
      ciuser: "ops",
      numa: 1,
      protection: 0,
      balloon: 0,
    });
  });

  it("pve_update_qemu_config passes boot, delete, revert and digest", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_qemu_config",
      arguments: {
        node: "pve",
        vmid: 100,
        boot: "order=scsi0",
        tags: "db",
        protection: true,
        delete: "scsi2,net1",
        revert: "memory",
        digest: "ABCDEF0123",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/qemu/100/config", {
      boot: "order=scsi0",
      tags: "db",
      protection: 1,
      delete: "scsi2,net1",
      revert: "memory",
      digest: "ABCDEF0123",
    });
  });

  it("rejects bad lists, lock, digest, bios and serial0", async () => {
    const bad = [
      { delete: "lock" },
      { delete: "tags,lock" },
      { delete: "tags; rm -rf" },
      { revert: "a b" },
      { digest: "not-hex!" },
      { bios: "uefi" },
      { serial0: "/dev/ttyS0" },
    ];
    for (const extra of bad) {
      const result = await mcpClient.callTool({
        name: "pve_update_qemu_config",
        arguments: { node: "pve", vmid: 100, ...extra },
      });
      expect(result.isError).toBe(true);
    }
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it("URL-encodes sshkeys", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_qemu_config",
      arguments: {
        node: "pve",
        vmid: 100,
        sshkeys: "ssh-ed25519 AAAA a@b\nssh-rsa BBBB c@d",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/qemu/100/config", {
      sshkeys: "ssh-ed25519%20AAAA%20a%40b%0Assh-rsa%20BBBB%20c%40d",
    });
  });

  it("has no host-level options in the schema", async () => {
    const { tools } = await mcpClient.listTools();
    for (const name of ["pve_create_qemu_vm", "pve_update_qemu_config"]) {
      const props = Object.keys(
        tools.find((t) => t.name === name)?.inputSchema.properties ?? {},
      );
      for (const key of [
        "args",
        "hookscript",
        "cicustom",
        "hostpci0",
        "lock",
      ]) {
        expect(props).not.toContain(key);
      }
    }
  });
});

describe("handler: LXC options and devices", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_lxc_container passes the new options and devices", async () => {
    vi.mocked(mockClient.post).mockResolvedValueOnce("UPID:pve:0005");

    const result = await mcpClient.callTool({
      name: "pve_create_lxc_container",
      arguments: {
        node: "pve",
        vmid: 210,
        ostemplate: "local:vztmpl/debian-12.tar.zst",
        description: "web",
        pool: "prod",
        arch: "amd64",
        ostype: "debian",
        nameserver: "10.0.0.1",
        searchdomain: "lan",
        timezone: "Europe/Berlin",
        cpulimit: 2,
        cpuunits: 512,
        protection: true,
        console: true,
        tty: 2,
        cmode: "tty",
        devices: {
          mp0: "local-lvm:8,mp=/data,backup=1",
          net1: "name=eth1,bridge=vmbr1,ip=dhcp",
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/lxc", {
      vmid: 210,
      ostemplate: "local:vztmpl/debian-12.tar.zst",
      description: "web",
      pool: "prod",
      arch: "amd64",
      ostype: "debian",
      nameserver: "10.0.0.1",
      searchdomain: "lan",
      timezone: "Europe/Berlin",
      cpulimit: 2,
      cpuunits: 512,
      tty: 2,
      cmode: "tty",
      protection: 1,
      console: 1,
      mp0: "local-lvm:8,mp=/data,backup=1",
      net1: "name=eth1,bridge=vmbr1,ip=dhcp",
    });
  });

  it("pve_update_lxc_config passes rootfs, delete, revert and digest", async () => {
    const result = await mcpClient.callTool({
      name: "pve_update_lxc_config",
      arguments: {
        node: "pve",
        vmid: 210,
        rootfs: "local-lvm:vm-210-disk-0,size=16G",
        protection: false,
        delete: "mp1,tags",
        revert: "memory",
        digest: "abc123",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/lxc/210/config", {
      rootfs: "local-lvm:vm-210-disk-0,size=16G",
      protection: 0,
      delete: "mp1,tags",
      revert: "memory",
      digest: "abc123",
    });
  });

  it("rejects unknown keys and bad values", async () => {
    const bad = [
      { devices: { mp256: "local-lvm:1,mp=/x" } },
      { devices: { dev0: "/dev/sda" } },
      { devices: { unused0: "local-lvm:vm-1-disk-0" } },
      { delete: "lock" },
      { ostype: "windows" },
    ];
    for (const extra of bad) {
      const result = await mcpClient.callTool({
        name: "pve_update_lxc_config",
        arguments: { node: "pve", vmid: 210, ...extra },
      });
      expect(result.isError).toBe(true);
    }
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it("has no hookscript, lock, dev or template in the schema", async () => {
    const { tools } = await mcpClient.listTools();
    for (const name of ["pve_create_lxc_container", "pve_update_lxc_config"]) {
      const props = Object.keys(
        tools.find((t) => t.name === name)?.inputSchema.properties ?? {},
      );
      for (const key of ["hookscript", "lock", "dev0", "template", "debug"]) {
        expect(props).not.toContain(key);
      }
    }
  });
});

describe("handler: clone and snapshot options", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_clone_qemu_vm passes pool, bwlimit and format", async () => {
    await mcpClient.callTool({
      name: "pve_clone_qemu_vm",
      arguments: {
        node: "pve",
        vmid: 9000,
        newid: 101,
        full: true,
        storage: "local-lvm",
        format: "qcow2",
        pool: "prod",
        bwlimit: 51200,
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/qemu/9000/clone", {
      newid: 101,
      full: 1,
      storage: "local-lvm",
      pool: "prod",
      bwlimit: 51200,
      format: "qcow2",
    });
  });

  it("pve_clone_lxc_container passes pool and bwlimit", async () => {
    await mcpClient.callTool({
      name: "pve_clone_lxc_container",
      arguments: {
        node: "pve",
        vmid: 200,
        newid: 201,
        pool: "p",
        bwlimit: 1000,
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/lxc/200/clone", {
      newid: 201,
      pool: "p",
      bwlimit: 1000,
    });
  });

  it("pve_clone_qemu_vm rejects an unknown format", async () => {
    const result = await mcpClient.callTool({
      name: "pve_clone_qemu_vm",
      arguments: { node: "pve", vmid: 1, newid: 2, format: "vdi" },
    });
    expect(result.isError).toBe(true);
  });

  it("snapshot delete adds force only when set", async () => {
    await mcpClient.callTool({
      name: "pve_delete_qemu_snapshot",
      arguments: { node: "pve", vmid: 100, snapname: "s1" },
    });
    expect(mockClient.delete).toHaveBeenLastCalledWith(
      "/nodes/pve/qemu/100/snapshot/s1",
    );
    await mcpClient.callTool({
      name: "pve_delete_lxc_snapshot",
      arguments: { node: "pve", vmid: 200, snapname: "s1", force: true },
    });
    expect(mockClient.delete).toHaveBeenLastCalledWith(
      "/nodes/pve/lxc/200/snapshot/s1?force=1",
    );
  });

  it("snapshot rollback sends start only when set", async () => {
    await mcpClient.callTool({
      name: "pve_rollback_qemu_snapshot",
      arguments: { node: "pve", vmid: 100, snapname: "s1" },
    });
    expect(mockClient.post).toHaveBeenLastCalledWith(
      "/nodes/pve/qemu/100/snapshot/s1/rollback",
      {},
    );
    await mcpClient.callTool({
      name: "pve_rollback_lxc_snapshot",
      arguments: { node: "pve", vmid: 200, snapname: "s1", start: true },
    });
    expect(mockClient.post).toHaveBeenLastCalledWith(
      "/nodes/pve/lxc/200/snapshot/s1/rollback",
      { start: 1 },
    );
  });
});

describe("handler: backup options", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_run_backup passes the new options", async () => {
    await mcpClient.callTool({
      name: "pve_run_backup",
      arguments: {
        node: "pve",
        vmid: "100",
        "notes-template": "{{guestname}}",
        protected: true,
        fleecing: "enabled=1,storage=local-lvm",
        "pbs-change-detection-mode": "metadata",
        "notification-mode": "notification-system",
        bwlimit: 1000,
        ionice: 7,
        lockwait: 5,
        stopwait: 10,
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/vzdump", {
      vmid: "100",
      "notes-template": "{{guestname}}",
      protected: 1,
      fleecing: "enabled=1,storage=local-lvm",
      "pbs-change-detection-mode": "metadata",
      "notification-mode": "notification-system",
      bwlimit: 1000,
      ionice: 7,
      lockwait: 5,
      stopwait: 10,
    });
  });

  it("pve_create_backup_job passes retention, comment and exclude", async () => {
    await mcpClient.callTool({
      name: "pve_create_backup_job",
      arguments: {
        id: "nightly",
        comment: "nightly",
        schedule: "02:00",
        all: true,
        exclude: "100,101",
        "prune-backups": "keep-last=3,keep-weekly=2",
        remove: true,
        "repeat-missed": true,
        protected: false,
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/cluster/backup", {
      schedule: "02:00",
      id: "nightly",
      comment: "nightly",
      exclude: "100,101",
      "prune-backups": "keep-last=3,keep-weekly=2",
      all: 1,
      remove: 1,
      "repeat-missed": 1,
      protected: 0,
    });
  });

  it("pve_create_backup_job rejects bad retention and exclude", async () => {
    for (const extra of [
      { "prune-backups": "keep-last=0" },
      { "prune-backups": "keep-last=3;rm" },
      { exclude: "100, 101" },
    ]) {
      const result = await mcpClient.callTool({
        name: "pve_create_backup_job",
        arguments: { schedule: "02:00", ...extra },
      });
      expect(result.isError).toBe(true);
    }
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("pve_run_backup has no host-level or deleting options", async () => {
    const { tools } = await mcpClient.listTools();
    const run = tools.find((t) => t.name === "pve_run_backup");
    const props = Object.keys(run?.inputSchema.properties ?? {});
    for (const key of [
      "script",
      "dumpdir",
      "tmpdir",
      "stdout",
      "prune-backups",
      "remove",
    ]) {
      expect(props).not.toContain(key);
    }
  });
});

describe("handler: task filters, VM list and pool move", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_list_tasks builds the filter query", async () => {
    await mcpClient.callTool({
      name: "pve_list_tasks",
      arguments: {
        node: "pve",
        source: "all",
        errors: true,
        since: 1700000000,
        until: 1700086400,
        statusfilter: "error,warning",
        userfilter: "root@pam",
        vmid: 100,
        limit: 10,
      },
    });
    const path = vi.mocked(mockClient.get).mock.calls.at(-1)?.[0] as string;
    const url = new URL(path, "http://x");
    expect(url.pathname).toBe("/nodes/pve/tasks");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "10",
      vmid: "100",
      source: "all",
      errors: "1",
      since: "1700000000",
      until: "1700086400",
      statusfilter: "error,warning",
      userfilter: "root@pam",
    });
  });

  it("pve_list_tasks without filters uses the plain path", async () => {
    await mcpClient.callTool({
      name: "pve_list_tasks",
      arguments: { node: "pve" },
    });
    expect(mockClient.get).toHaveBeenLastCalledWith("/nodes/pve/tasks");
  });

  it("pve_list_tasks rejects an unknown source", async () => {
    const result = await mcpClient.callTool({
      name: "pve_list_tasks",
      arguments: { node: "pve", source: "everything" },
    });
    expect(result.isError).toBe(true);
  });

  it("pve_list_qemu_vms passes full only when set", async () => {
    await mcpClient.callTool({
      name: "pve_list_qemu_vms",
      arguments: { node: "pve" },
    });
    expect(mockClient.get).toHaveBeenLastCalledWith("/nodes/pve/qemu");
    await mcpClient.callTool({
      name: "pve_list_qemu_vms",
      arguments: { node: "pve", full: true },
    });
    expect(mockClient.get).toHaveBeenLastCalledWith("/nodes/pve/qemu?full=1");
  });

  it("pve_update_pool passes allow-move", async () => {
    await mcpClient.callTool({
      name: "pve_update_pool",
      arguments: { poolid: "prod", vms: "100", "allow-move": true },
    });
    expect(mockClient.put).toHaveBeenLastCalledWith("/pools/prod", {
      vms: "100",
      "allow-move": 1,
    });
  });
});

describe("handler: pve_migrate_qemu_vm options", () => {
  it("passes storage and limit options in read-execute mode", async () => {
    const mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(
      server,
      mockClient,
      makeConfig({ accessTier: "read-execute" }),
    );
    const { client: mcpClient, cleanup } = await connectTestClient(server);

    const result = await mcpClient.callTool({
      name: "pve_migrate_qemu_vm",
      arguments: {
        node: "pve",
        vmid: 100,
        target: "pve2",
        online: true,
        "with-local-disks": true,
        targetstorage: "local-lvm",
        "with-conntrack-state": false,
        bwlimit: 51200,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockClient.post).toHaveBeenCalledWith(
      "/nodes/pve/qemu/100/migrate",
      {
        target: "pve2",
        online: 1,
        "with-local-disks": 1,
        "with-conntrack-state": 0,
        targetstorage: "local-lvm",
        bwlimit: 51200,
      },
    );
    await cleanup();
  });
});

describe("handler: network and storage options", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_network passes mtu, VLAN and IPv6 options", async () => {
    await mcpClient.callTool({
      name: "pve_create_network",
      arguments: {
        node: "pve",
        iface: "vmbr1",
        type: "bridge",
        bridge_vlan_aware: true,
        bridge_vids: "2-4094",
        mtu: 9000,
        cidr6: "fd00::1/64",
        gateway6: "fd00::ff",
        "vlan-id": 10,
        "vlan-raw-device": "eno1",
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/nodes/pve/network", {
      iface: "vmbr1",
      type: "bridge",
      bridge_vlan_aware: 1,
      bridge_vids: "2-4094",
      mtu: 9000,
      cidr6: "fd00::1/64",
      gateway6: "fd00::ff",
      "vlan-id": 10,
      "vlan-raw-device": "eno1",
    });
  });

  it("pve_update_network passes delete and rejects a bad list", async () => {
    await mcpClient.callTool({
      name: "pve_update_network",
      arguments: {
        node: "pve",
        iface: "vmbr1",
        type: "bridge",
        mtu: 1500,
        delete: "gateway,comments",
      },
    });
    expect(mockClient.put).toHaveBeenCalledWith("/nodes/pve/network/vmbr1", {
      type: "bridge",
      mtu: 1500,
      delete: "gateway,comments",
    });
    const bad = await mcpClient.callTool({
      name: "pve_update_network",
      arguments: { node: "pve", iface: "vmbr1", type: "bridge", delete: "a;b" },
    });
    expect(bad.isError).toBe(true);
  });

  it("pve_create_storage passes PBS, retention and format options", async () => {
    await mcpClient.callTool({
      name: "pve_create_storage",
      arguments: {
        storage: "pbs",
        type: "pbs",
        server: "pbs.lan",
        datastore: "main",
        namespace: "prod",
        username: "backup@pbs",
        fingerprint: "AA:BB",
        "prune-backups": "keep-last=3,keep-weekly=2",
        "max-protected-backups": 5,
        sparse: true,
        format: "qcow2",
        preallocation: "metadata",
        disable: false,
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/storage", {
      storage: "pbs",
      type: "pbs",
      server: "pbs.lan",
      disable: 0,
      datastore: "main",
      namespace: "prod",
      username: "backup@pbs",
      "prune-backups": "keep-last=3,keep-weekly=2",
      "max-protected-backups": 5,
      sparse: 1,
      format: "qcow2",
      preallocation: "metadata",
      fingerprint: "AA:BB",
    });
  });

  it("pve_update_storage passes retention and delete, rejects bad values", async () => {
    await mcpClient.callTool({
      name: "pve_update_storage",
      arguments: {
        storage: "pbs",
        "prune-backups": "keep-all=1",
        delete: "nodes",
      },
    });
    expect(mockClient.put).toHaveBeenCalledWith("/storage/pbs", {
      "prune-backups": "keep-all=1",
      delete: "nodes",
    });
    for (const extra of [
      { "prune-backups": "keep-last=0" },
      { format: "vdi" },
      { delete: "nodes, content" },
    ]) {
      const bad = await mcpClient.callTool({
        name: "pve_update_storage",
        arguments: { storage: "pbs", ...extra },
      });
      expect(bad.isError).toBe(true);
    }
  });
});

describe("handler: firewall rule and HA resource options", () => {
  let cleanup: () => Promise<void>;
  let mcpClient: Client;
  let mockClient: PveClient;

  beforeEach(async () => {
    mockClient = makeMockClient();
    const server = createServer();
    registerAllTools(server, mockClient, makeConfig());
    const conn = await connectTestClient(server);
    mcpClient = conn.client;
    cleanup = conn.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("pve_create_firewall_rule passes macro, iface, log and icmp-type", async () => {
    await mcpClient.callTool({
      name: "pve_create_firewall_rule",
      arguments: {
        action: "ACCEPT",
        type: "in",
        macro: "SSH",
        iface: "vmbr0",
        log: "info",
        "icmp-type": "echo-request",
        digest: "ABCDEF",
      },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/cluster/firewall/rules", {
      action: "ACCEPT",
      type: "in",
      macro: "SSH",
      iface: "vmbr0",
      log: "info",
      "icmp-type": "echo-request",
      digest: "ABCDEF",
    });
  });

  it("pve_update_firewall_rule passes delete and moveto, rejects bad input", async () => {
    await mcpClient.callTool({
      name: "pve_update_firewall_rule",
      arguments: { pos: 2, log: "nolog", delete: "dport,comment", moveto: 0 },
    });
    expect(mockClient.put).toHaveBeenCalledWith("/cluster/firewall/rules/2", {
      log: "nolog",
      delete: "dport,comment",
      moveto: 0,
    });
    for (const extra of [
      { log: "verbose" },
      { delete: "a b" },
      { digest: "zz" },
    ]) {
      const bad = await mcpClient.callTool({
        name: "pve_update_firewall_rule",
        arguments: { pos: 2, ...extra },
      });
      expect(bad.isError).toBe(true);
    }
  });

  it("HA resource tools pass failback, auto-rebalance and delete", async () => {
    await mcpClient.callTool({
      name: "pve_create_ha_resource",
      arguments: { sid: "vm:100", failback: false, "auto-rebalance": true },
    });
    expect(mockClient.post).toHaveBeenCalledWith("/cluster/ha/resources", {
      sid: "vm:100",
      failback: 0,
      "auto-rebalance": 1,
    });
    await mcpClient.callTool({
      name: "pve_update_ha_resource",
      arguments: { sid: "vm:100", failback: true, delete: "group,comment" },
    });
    expect(mockClient.put).toHaveBeenCalledWith(
      "/cluster/ha/resources/vm%3A100",
      { failback: 1, delete: "group,comment" },
    );
  });
});
