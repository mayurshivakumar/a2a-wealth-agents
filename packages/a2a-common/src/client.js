import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client'

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
