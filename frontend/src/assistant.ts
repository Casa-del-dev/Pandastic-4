export type Attachment = {
  id: string
  kind: 'image' | 'audio'
  file: File
  url: string
}

export type AssistantRequest = {
  text: string
  attachment?: Attachment
}

// Replace this adapter with the on-device Android model bridge.
// It deliberately performs no network request and no inference.
export async function respond(request: AssistantRequest, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const input = request.attachment?.kind === 'image' ? 'picture' : request.attachment?.kind === 'audio' ? 'voice recording' : 'question'
  return `Your ${input} is ready. This is a frontend preview, so I haven’t processed it with an AI model yet. Once the on-device model is connected, its answer will appear here. Your input has stayed in this session on this device.`
}
