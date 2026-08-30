/**
 * Internal transport abstraction for the stream client.
 *
 * `OpenSeaStreamClient` talks only to these interfaces, never to a specific
 * wire protocol. The current implementation speaks Phoenix Channels v2
 * (`./phoenix`), which is what `wss://stream-api.opensea.io/socket` serves.
 *
 * The vocabulary here is deliberately protocol-neutral (subscribe/unsubscribe
 * rather than Phoenix's join/leave) so that a Stream API v2 transport, whose
 * draft protocol is plain JSON frames with `subscribe` / `subscribed` /
 * `event` types and no application-level heartbeat, can be added alongside
 * this one without touching the client or the public event types.
 *
 * Protocol details that are not universal live in the implementation, not
 * here: Phoenix's join refs, reply correlation, and 30s heartbeat are all
 * private to `./phoenix`.
 *
 * These types are deliberately NOT exported from `src/stream/index.ts`.
 * Keeping them internal leaves us free to reshape them once the next stream
 * backend is real. Do not re-export them without a deliberate decision.
 */

/** Minimal structural shape of a WebSocket implementation. */
export interface StreamWebSocket {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

/**
 * A WebSocket constructor. The global `WebSocket` satisfies this, as does the
 * `ws` package, which is only needed on runtimes without a global
 * (Node < 22).
 */
export type StreamWebSocketConstructor = new (url: string) => StreamWebSocket

/** Handler invoked with the raw decoded payload for a subscribed event. */
export type StreamMessageHandler = (message: unknown) => void

/** Options for a single topic subscription. */
export interface SubscribeOptions {
  /**
   * Restrict the subscription to these event names. Maps to Phoenix join
   * params (`event_types`) today and to the `events` array in the v2 draft.
   */
  eventTypes?: string[]
}

/** Lifecycle callbacks for a subscription request. */
export interface SubscribeCallbacks {
  /** The server accepted the subscription. */
  onSubscribed?: () => void
  /** The server rejected it, or the request timed out. */
  onSubscribeError?: (reason: unknown) => void
}

/** An active subscription to one topic. */
export interface StreamSubscription {
  readonly topic: string
  /**
   * Register a handler for an event name on this topic. Returns a function
   * that removes just that handler; the transport unsubscribes from the topic
   * once its last handler is gone.
   */
  on(event: string, handler: StreamMessageHandler): () => void
  /** Unsubscribe from the whole topic, dropping every handler on it. */
  unsubscribe(onUnsubscribed?: () => void): void
}

export interface StreamTransport {
  /** Idempotent. Safe to call when already connected or connecting. */
  connect(): void
  disconnect(onDisconnect?: () => void): void
  isConnected(): boolean
  /** Fully qualified socket URL, including query parameters. */
  endpointUrl(): string
  /** `"ws"` or `"wss"`. */
  protocol(): string
  /** Subscribe to a topic, connecting first if necessary. */
  subscribe(
    topic: string,
    options?: SubscribeOptions,
    callbacks?: SubscribeCallbacks,
  ): StreamSubscription
  /** Register a handler for transport-level errors. */
  onError(handler: (error: unknown) => void): void
}
