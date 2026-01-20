/**
 * PositionEventStore Factory
 * Creates and initializes event store, projection, and emitter
 */

import { PositionEventStore } from './position-event-store.service';
import { PositionStateProjection } from './position-state-projection.service';
import { PositionEventEmitter } from './position-event-emitter.service';
import { IPositionEventStore } from './position-event-store.interface';
import { IPositionStateProjection } from './position-state-projection.interface';

export interface EventSourcingComponents {
  eventStore: IPositionEventStore;
  projection: IPositionStateProjection;
  emitter: PositionEventEmitter;
}

/**
 * Initialize event sourcing system
 */
export async function initializeEventSourcing(
  storagePath: string = './data/position-events.jsonl'
): Promise<EventSourcingComponents> {
  // Create event store
  const eventStore = new PositionEventStore(storagePath);
  await eventStore.initialize();

  // Create projection
  const projection = new PositionStateProjection(eventStore);

  // Create emitter
  const emitter = new PositionEventEmitter(eventStore);

  return {
    eventStore,
    projection,
    emitter,
  };
}

/**
 * Singleton instance management
 */
let eventSourcingInstance: EventSourcingComponents | null = null;

export async function getEventSourcingInstance(
  storagePath?: string
): Promise<EventSourcingComponents> {
  if (!eventSourcingInstance) {
    eventSourcingInstance = await initializeEventSourcing(storagePath);
  }
  return eventSourcingInstance;
}

export function resetEventSourcingInstance(): void {
  eventSourcingInstance = null;
}
