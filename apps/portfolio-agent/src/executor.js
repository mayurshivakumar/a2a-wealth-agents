import { randomUUID } from 'node:crypto'
import { TaskState } from '@a2a-js/sdk'
import {
  extractText,
  firstDataPart,
  noopLogger,
  parseWireMessage,
  publishArtifact,
  publishStatus,
  publishTaskSubmitted,
  requestMalformed,
  requestMalformedFromZod,
} from '@wealth/a2a-common'
import { Portfolio, PortfolioRequest } from '@wealth/schemas'
import { parseHoldings } from './parser.js'

// Resolves the inbound message (in-process part shapes) to a validated
// portfolio-request-v1: a data part takes precedence, otherwise the joined
// text parts become { rawText }.
export function resolvePortfolioRequest(message) {
  const data = firstDataPart(message)
  if (data !== undefined) {
    const result = PortfolioRequest.safeParse(data)
    if (!result.success) {
      throw requestMalformedFromZod(result.error.issues, {
        pathPrefix: 'portfolio-request-v1',
      })
    }
    return result.data
  }
  const rawText = extractText(message)
  if (!rawText) {
    throw requestMalformed(
      'holdings',
      'expected at least one recognizable symbol/quantity pair',
    )
  }
  return { rawText }
}

// Boundary middleware for the Hapi bridge: rejects malformed requests with
// RequestMalformedError (-32602) BEFORE any task record exists. Runs the full
// deterministic parse so garbage text fails here, on the wire, per Flow A's
// error branch. Follow-up sends (taskId set) are left to SDK semantics.
export function createPortfolioRequestValidator({ prices } = {}) {
  return ({ message }) => {
    if (message?.taskId) return
    const request = resolvePortfolioRequest(parseWireMessage(message))
    parseHoldings(request.rawText, { prices })
  }
}

export function createPortfolioExecutor({
  prices,
  clock = () => new Date(),
  idFactory = randomUUID,
  logger = noopLogger,
} = {}) {
  return {
    async execute(ctx, eventBus) {
      // The host middleware already validated; re-derive as defense in depth
      // (a failure here becomes a FAILED task instead of -32602).
      const request = resolvePortfolioRequest(ctx.userMessage)
      const { portfolio, warnings } = parseHoldings(request.rawText, {
        prices,
        clock,
        idFactory,
      })
      const artifact = Portfolio.parse(portfolio)

      publishTaskSubmitted(eventBus, ctx, { clock })
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_WORKING,
        'standardizing holdings',
        {
          clock,
          idFactory,
        },
      )
      publishArtifact(eventBus, ctx, {
        artifactId: 'standardized-holdings',
        name: 'standardized-holdings',
        data: artifact,
        schemaName: 'portfolio-v1',
        metadata: { warnings },
      })
      publishStatus(eventBus, ctx, TaskState.TASK_STATE_COMPLETED, undefined, {
        clock,
        idFactory,
      })
      eventBus.finished()
      logger.info('portfolio standardized', {
        taskId: ctx.taskId,
        contextId: ctx.contextId,
        holdings: artifact.holdings.length,
        warnings: warnings.length,
      })
    },
    // Synchronous single-turn flow: there is never anything to cancel.
    async cancelTask() {},
  }
}
