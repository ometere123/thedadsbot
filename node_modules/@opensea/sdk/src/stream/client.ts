import { ENDPOINTS } from "./constants"
import { collectionTopic } from "./helpers"
import { PhoenixChannelsTransport } from "./transport/phoenix"
import type { StreamTransport } from "./transport/types"
import {
  type BaseStreamMessage,
  type Callback,
  type ClientConfig,
  type CollectionOfferEvent,
  EventType,
  type ItemCancelledEvent,
  type ItemListedEvent,
  type ItemMetadataUpdate,
  type ItemReceivedBidEvent,
  type ItemReceivedOfferEvent,
  type ItemSoldEvent,
  type ItemTransferredEvent,
  LogLevel,
  Network,
  type OnClientEvent,
  type OrderValidationEvent,
  type TraitOfferEvent,
} from "./types"

/**
 * Client for the OpenSea Stream API.
 *
 * @example
 * ```ts
 * import { OpenSeaStreamClient } from "@opensea/sdk/stream"
 *
 * const client = new OpenSeaStreamClient({ apiKey: "YOUR_API_KEY" })
 *
 * const unsubscribe = client.onItemListed("doodles-official", event => {
 *   console.log(event.payload.item.nft_id)
 * })
 * ```
 *
 * @category Main Classes
 */
export class OpenSeaStreamClient {
  private transport: StreamTransport
  private logLevel: LogLevel
  private onEvent: OnClientEvent

  constructor({
    network = Network.MAINNET,
    apiKey,
    token,
    apiUrl,
    connectOptions,
    logLevel = LogLevel.INFO,
    onError,
    onEvent = () => true,
  }: ClientConfig) {
    const key = apiKey ?? token
    if (!key) {
      throw new Error(
        "An OpenSea API key is required. Pass it as `apiKey` when constructing OpenSeaStreamClient.",
      )
    }

    this.logLevel = logLevel
    this.onEvent = onEvent

    const endpoint = apiUrl || ENDPOINTS[network]
    const { params, ...transportOptions } = connectOptions ?? {}

    this.transport = new PhoenixChannelsTransport({
      endpoint,
      params: { token: key, ...params },
      ...transportOptions,
      logger: message => this.debug(message),
    })

    this.transport.onError(onError ?? (error => this.error(error)))
  }

  private debug(message: unknown) {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.debug("[DEBUG]:", message)
    }
  }

  private info(message: unknown) {
    if (this.logLevel <= LogLevel.INFO) {
      console.info("[INFO]:", message)
    }
  }

  private error(message: unknown) {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error("[ERROR]:", message)
    }
  }

  public connect = () => {
    this.debug("Connecting to socket")
    this.transport.connect()
  }

  public disconnect = (
    callback = () => this.info(`Successfully disconnected from socket`),
  ) => {
    return this.transport.disconnect(callback)
  }

  private on = <Payload, Event extends BaseStreamMessage<Payload>>(
    eventType: EventType,
    collectionSlug: string,
    callback: Callback<Event>,
    eventTypes?: EventType[],
  ) => {
    const topic = collectionTopic(collectionSlug)
    this.debug(`Subscribing to ${eventType} events on ${topic}`)

    const onClientEvent = this.onEvent
    const handler = (message: unknown) => {
      const event = message as Event
      if (onClientEvent(collectionSlug, eventType, event)) {
        callback(event)
      }
    }

    const subscription = this.transport.subscribe(
      topic,
      { eventTypes },
      {
        onSubscribed: () => this.info(`Successfully joined channel "${topic}"`),
        onSubscribeError: reason => {
          this.error(`Failed to join channel "${topic}"`)
          this.debug(reason)
        },
      },
    )
    const off = subscription.on(eventType, handler)

    return () => {
      this.debug(`Unsubscribing from ${eventType} events on ${topic}`)
      // Removes only this handler. The topic is torn down once nothing is
      // listening to it. The original stream-js client left the whole channel
      // here, which silently killed sibling subscriptions on the same
      // collection.
      off()
    }
  }

  public onItemMetadataUpdated = (
    collectionSlug: string,
    callback: Callback<ItemMetadataUpdate>,
  ) => {
    this.debug(`Listening for item metadata updates on "${collectionSlug}"`)
    return this.on(EventType.ITEM_METADATA_UPDATED, collectionSlug, callback)
  }

  public onItemCancelled = (
    collectionSlug: string,
    callback: Callback<ItemCancelledEvent>,
  ) => {
    this.debug(`Listening for item cancellations on "${collectionSlug}"`)
    return this.on(EventType.ITEM_CANCELLED, collectionSlug, callback)
  }

  public onItemListed = (
    collectionSlug: string,
    callback: Callback<ItemListedEvent>,
  ) => {
    this.debug(`Listening for item listings on "${collectionSlug}"`)
    return this.on(EventType.ITEM_LISTED, collectionSlug, callback)
  }

  public onItemSold = (
    collectionSlug: string,
    callback: Callback<ItemSoldEvent>,
  ) => {
    this.debug(`Listening for item sales on "${collectionSlug}"`)
    return this.on(EventType.ITEM_SOLD, collectionSlug, callback)
  }

  public onItemTransferred = (
    collectionSlug: string,
    callback: Callback<ItemTransferredEvent>,
  ) => {
    this.debug(`Listening for item transfers on "${collectionSlug}"`)
    return this.on(EventType.ITEM_TRANSFERRED, collectionSlug, callback)
  }

  public onItemReceivedOffer = (
    collectionSlug: string,
    callback: Callback<ItemReceivedOfferEvent>,
  ) => {
    this.debug(`Listening for item offers on "${collectionSlug}"`)
    return this.on(EventType.ITEM_RECEIVED_OFFER, collectionSlug, callback)
  }

  public onItemReceivedBid = (
    collectionSlug: string,
    callback: Callback<ItemReceivedBidEvent>,
  ) => {
    this.debug(`Listening for item bids on "${collectionSlug}"`)
    return this.on(EventType.ITEM_RECEIVED_BID, collectionSlug, callback)
  }

  public onCollectionOffer = (
    collectionSlug: string,
    callback: Callback<CollectionOfferEvent>,
  ) => {
    this.debug(`Listening for collection offers on "${collectionSlug}"`)
    return this.on(EventType.COLLECTION_OFFER, collectionSlug, callback)
  }

  public onTraitOffer = (
    collectionSlug: string,
    callback: Callback<TraitOfferEvent>,
  ) => {
    this.debug(`Listening for trait offers on "${collectionSlug}"`)
    return this.on(EventType.TRAIT_OFFER, collectionSlug, callback)
  }

  public onOrderInvalidate = (
    collectionSlug: string,
    callback: Callback<OrderValidationEvent>,
  ) => {
    this.debug(`Listening for order invalidation events on "${collectionSlug}"`)
    return this.on(EventType.ORDER_INVALIDATE, collectionSlug, callback)
  }

  public onOrderRevalidate = (
    collectionSlug: string,
    callback: Callback<OrderValidationEvent>,
  ) => {
    this.debug(`Listening for order revalidation events on "${collectionSlug}"`)
    return this.on(EventType.ORDER_REVALIDATE, collectionSlug, callback)
  }

  /**
   * Subscribe to several event types on one collection with a single callback,
   * filtered server-side to the requested types.
   *
   * The callback receives `BaseStreamMessage<unknown>`: one subscription can
   * deliver several event types, so there is no single payload type to hand
   * back. `event_type` identifies which arrived, and the payload needs
   * narrowing before use.
   *
   * ```ts
   * client.onEvents(slug, [EventType.ITEM_SOLD, EventType.ITEM_LISTED], event => {
   *   if (event.event_type === EventType.ITEM_SOLD) {
   *     const sale = event as ItemSoldEvent
   *     console.log(sale.payload.sale_price)
   *   }
   * })
   * ```
   *
   * Use the typed single-event methods, such as `onItemSold`, when you want the
   * payload typed for you.
   *
   * @param collectionSlug collection slug, or `"*"` for all collections
   * @param eventTypes event types to subscribe to
   * @param callback invoked for every subscribed event type
   * @returns a function that removes all of this call's handlers
   */
  public onEvents = (
    collectionSlug: string,
    eventTypes: EventType[],
    callback: Callback<BaseStreamMessage<unknown>>,
  ) => {
    const subscriptions = eventTypes.map(eventType =>
      this.on(eventType, collectionSlug, callback, eventTypes),
    )

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
    }
  }
}
