import { TaskState, taskStateToJSON } from '@a2a-js/sdk'

// In-process task states are numeric protobuf enums; only the wire JSON uses
// the TASK_STATE_* strings. Never compare against string literals in code.

export const TERMINAL_STATES = new Set([
  TaskState.TASK_STATE_COMPLETED,
  TaskState.TASK_STATE_FAILED,
  TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_REJECTED,
])

export function isTerminal(state) {
  return TERMINAL_STATES.has(state)
}

export function stateLabel(state) {
  return taskStateToJSON(state)
}

// "TASK_STATE_INPUT_REQUIRED" → "input-required" (the docs' short display form).
export function shortStateLabel(state) {
  return stateLabel(state)
    .replace('TASK_STATE_', '')
    .toLowerCase()
    .replaceAll('_', '-')
}
