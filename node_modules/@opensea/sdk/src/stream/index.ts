/**
 * OpenSea Stream API client.
 *
 * Subscribe to real-time marketplace events over WebSocket.
 *
 * @example
 * ```ts
 * import { OpenSeaStreamClient } from "@opensea/sdk/stream"
 *
 * const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" })
 * client.onItemSold("doodles-official", event => console.log(event))
 * ```
 *
 * @module
 */

export * from "./client"
export * from "./types"
