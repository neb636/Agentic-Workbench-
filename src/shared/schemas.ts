import { z } from "zod";

export const workbenchViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  state: z.unknown().optional(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  views: z.array(workbenchViewSchema),
  activeViewId: z.string().optional(),
});

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  scope: z.enum(["global", "workspace"]),
  workspaceId: z.string().optional(),
});

export const appendedInstructionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  content: z.string(),
  enabled: z.boolean(),
});

export const persistedStateSchema = z.object({
  workspaces: z.array(workspaceSchema).default([]),
  activeWorkspaceId: z.string().optional(),
  personas: z.array(personaSchema).default([]),
  selectedPersonaByWorkspace: z.record(z.string(), z.string().optional()).default({}),
  appendedInstructions: z.array(appendedInstructionSchema).default([]),
});

export const ptyCreateOptionsSchema = z.object({
  cwd: z.string().min(1),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
});

export const ptyInputSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
});

export const ptyResizeSchema = z.object({
  sessionId: z.string(),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(1000),
});

export const ptyTerminateSchema = z.object({ sessionId: z.string() });

export const agentSessionCreateOptionsSchema = z.object({
  providerId: z.string().min(1),
  workspacePath: z.string().min(1),
});

export const agentPromptSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().trim().min(1).max(500_000),
});

export const agentSessionActionSchema = z.object({ sessionId: z.string().min(1) });
