import { TaskState } from '@a2a-js/sdk'
import { InMemoryTaskStore } from '@a2a-js/sdk/server'

/**
 * Works around an @a2a-js/sdk@1.0.0 defect: ListTasksRequest.fromJSON
 * defaults an omitted `status` to 0 (TASK_STATE_UNSPECIFIED) and
 * InMemoryTaskStore.list filters whenever `status !== undefined` — so
 * ListTasks over JSON-RPC always returns an empty page. UNSPECIFIED is
 * protobuf's "not set", so treat it as "no status filter" here.
 * Recorded in design/errata.md §1.
 */
export class WealthTaskStore extends InMemoryTaskStore {
  async list(params, context) {
    if (params?.status === TaskState.TASK_STATE_UNSPECIFIED) {
      const rest = { ...params }
      delete rest.status
      return super.list(rest, context)
    }
    return super.list(params, context)
  }
}

export function createTaskStore() {
  return new WealthTaskStore()
}
