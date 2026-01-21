/**
 * Test Setup
 *
 * Global test configuration and utilities for Jest
 */

// Setup global test utilities
beforeAll(() => {
  // Initialize any global test infrastructure
  console.log('Starting web-client test suite...');
});

afterAll(() => {
  // Cleanup
  console.log('Completed web-client test suite');
});

// Mock fetch globally for API tests
global.fetch = jest.fn();

// Mock WebSocket for WebSocket tests
class MockWebSocket {
  url: string;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    // Mock implementation
  }

  close() {
    this.readyState = 3;
  }

  addEventListener(event: string, handler: EventListener) {
    // Mock implementation
  }

  removeEventListener(event: string, handler: EventListener) {
    // Mock implementation
  }
}

if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = MockWebSocket as any;
}
