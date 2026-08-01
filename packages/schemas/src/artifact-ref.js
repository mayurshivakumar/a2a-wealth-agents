import { z } from 'zod'

// How the Orchestrator refers to artifacts it has collected: registry entries and
// tool results carry references, never inline financial payloads.
export const ArtifactRef = z.object({
  agent: z.string().min(1),
  taskId: z.string().min(1),
  contextId: z.string().min(1),
  artifactId: z.string().min(1),
  schema: z.string().min(1),
})
