/**
 * Event Sourcing Module - Central exports
 */

// Event types and interfaces
export * from './position.events';
export * from './position-event-store.interface';
export * from './position-state-projection.interface';

// Services
export { PositionEventStore } from './position-event-store.service';
export { PositionStateProjection } from './position-state-projection.service';
export { PositionEventEmitter } from './position-event-emitter.service';

// Factory
export {
  initializeEventSourcing,
  getEventSourcingInstance,
  resetEventSourcingInstance,
  type EventSourcingComponents,
} from './position-event-store.factory';
