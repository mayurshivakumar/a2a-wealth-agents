import { TaskState } from '@a2a-js/sdk'
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client'

/**
 * Builds proto-default-complete ListTasks params. The SDK's client codec
 * serializes an ABSENT enum as the string "UNRECOGNIZED" (status -1 on the
 * server), which matches nothing — every hand-built listTasks call must fill
 * status with TASK_STATE_UNSPECIFIED explicitly. See design/errata.md §1.
 */
export function listTasksParams({
  tenant = '',
  contextId = '',
  status = TaskState.TASK_STATE_UNSPECIFIED,
  pageToken = '',
  pageSize,
  historyLength,
  statusTimestampAfter,
  includeArtifacts,
} = {}) {
  return {
    tenant,
    contextId,
    status,
    pageToken,
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(historyLength !== undefined ? { historyLength } : {}),
    ...(statusTimestampAfter !== undefined ? { statusTimestampAfter } : {}),
    ...(includeArtifacts !== undefined ? { includeArtifacts } : {}),
  }
}

export function createTimeoutFetch(
  timeoutMs,
  fetchImplementation = globalThis.fetch,
) {
  return (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal

    return fetchImplementation(input, { ...init, signal })
  }
}

/**
 * ClientFactory configured for this mesh: JSONRPC transport only, card
 * resolution and every request bounded by `timeoutMs`. One factory serves all
 * agents; create one Client per agent via `factory.createFromUrl(agentUrl)`.
 */
export function createRemoteClientFactory({
  timeoutMs,
  fetchImplementation = globalThis.fetch,
}) {
  const timedFetch = createTimeoutFetch(timeoutMs, fetchImplementation)
  const options = ClientFactoryOptions.createFrom(
    ClientFactoryOptions.default,
    {
      cardResolver: new DefaultAgentCardResolver({ fetchImpl: timedFetch }),
      transports: [new JsonRpcTransportFactory({ fetchImpl: timedFetch })],
      preferredTransports: ['JSONRPC'],
    },
  )

  return new ClientFactory(options)
}
