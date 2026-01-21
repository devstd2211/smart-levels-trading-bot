/**
 * Web Server Entry Point
 *
 * Initializes Express API server and WebSocket server.
 * Connects to trading bot via BotBridgeService.
 */

import express, { Express } from 'express';
import cors from 'cors';
import * as path from 'path';
import { BotBridgeService, type IBotInstance } from './services/bot-bridge.service.js';
import { WebSocketService } from './websocket/ws-server.js';
import { createBotRoutes } from './routes/bot.routes.js';
import { createDataRoutes } from './routes/data.routes.js';
import { createAnalyticsRoutes } from './routes/analytics.routes.js';
import { FileWatcherService } from './services/file-watcher.service.js';
import { createRequestLoggingMiddleware } from './middleware/request-logging.middleware.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { createErrorHandlerMiddleware } from './middleware/error-handler.middleware.js';
import { swaggerConfig } from './swagger.config.js';
import * as dotenv from 'dotenv';
import { createConfigRoutes } from './routes/config.routes.js';

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_PORT = parseInt(process.env.API_PORT || '4000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '4001', 10);

export interface WebServerConfig {
  apiPort?: number;
  wsPort?: number;
}

export class WebServer {
  private app: Express;
  private bridge: BotBridgeService;
  private wsService: WebSocketService | null = null;
  private fileWatcher: FileWatcherService | null = null;

  constructor(private bot: IBotInstance, config: WebServerConfig = {}) {
    this.app = express();
    this.bridge = new BotBridgeService(bot);

    const apiPort = config.apiPort || API_PORT;
    const wsPort = config.wsPort || WS_PORT;

    this.setupMiddleware();
    this.setupRoutes(apiPort);
    this.setupWebSocket(wsPort);
    this.setupFileWatcher();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cors());

    // Request/Response logging middleware
    this.app.use(
      createRequestLoggingMiddleware({
        logBody: false, // Set to true for debugging request bodies
        logHeaders: false, // Set to true for debugging headers
        excludePaths: ['/health'],
        maxBodyLength: 500,
      })
    );

    // Rate limiting middleware
    this.app.use(
      createRateLimitMiddleware({
        windowMs: 60 * 1000, // 1 minute window
        maxRequests: 100, // 100 requests per window
        whitelist: ['::1', '127.0.0.1'], // Localhost always allowed
      })
    );
  }

  /**
   * Setup API routes
   */
  private setupRoutes(port: number) {
    const botRoutes = createBotRoutes(this.bridge);
    const dataRoutes = createDataRoutes(this.bridge);
    const configPath = path.resolve(process.cwd(), 'config.json');
    // Pass callback to get actual WebSocket port (may differ if occupied)
    const configRoutes = createConfigRoutes(configPath, () => this.wsService?.getPort() || 4003);

    // Initialize FileWatcher for analytics routes
    const journalPath = path.resolve(process.cwd(), 'data', 'trade-journal.json');
    const sessionsPath = path.resolve(process.cwd(), 'data', 'session-stats.json');
    this.fileWatcher = new FileWatcherService(journalPath, sessionsPath);
    const analyticsRoutes = createAnalyticsRoutes(this.fileWatcher);

    // Serve web-client static files
    const webClientPath = path.resolve(process.cwd(), 'web-client', 'dist');
    this.app.use(express.static(webClientPath));

    this.app.use('/api/bot', botRoutes);
    this.app.use('/api/data', dataRoutes);
    this.app.use('/api/config', configRoutes);
    this.app.use('/api/analytics', analyticsRoutes);

    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        botRunning: this.bridge.isRunning(),
      });
    });

    // Swagger/OpenAPI documentation
    this.app.get('/api/docs/openapi.json', (_req, res) => {
      res.json(swaggerConfig);
    });

    this.app.get('/api/docs', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>API Documentation</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: 'Roboto', sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
            }
            .container {
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
              background: white;
              border-radius: 8px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.3);
              margin-top: 20px;
              margin-bottom: 20px;
            }
            h1 {
              color: #333;
              text-align: center;
              margin-bottom: 10px;
            }
            .info {
              text-align: center;
              color: #666;
              margin-bottom: 20px;
            }
            .endpoints {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
              gap: 15px;
              margin-top: 20px;
            }
            .endpoint {
              border: 1px solid #e0e0e0;
              border-radius: 4px;
              padding: 15px;
              background: #f9f9f9;
            }
            .endpoint h3 {
              margin: 0 0 10px 0;
              color: #333;
            }
            .endpoint p {
              margin: 5px 0;
              color: #666;
              font-size: 14px;
            }
            .method {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 3px;
              font-weight: bold;
              font-size: 12px;
              margin-right: 5px;
            }
            .get { background: #61affe; color: white; }
            .post { background: #49cc90; color: white; }
            .put { background: #fca130; color: white; }
            .delete { background: #f93e3e; color: white; }
            .swagger-ui-link {
              text-align: center;
              margin-top: 30px;
            }
            .swagger-ui-link a {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 12px 30px;
              border-radius: 4px;
              text-decoration: none;
              font-weight: bold;
              display: inline-block;
            }
            .swagger-ui-link a:hover {
              transform: translateY(-2px);
              box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Trading Bot API</h1>
            <div class="info">
              <p>Real-time API for trading bot management and data retrieval</p>
              <p>OpenAPI Spec: <code>/api/docs/openapi.json</code></p>
            </div>

            <h2>Quick Reference</h2>
            <div class="endpoints">
              <div class="endpoint">
                <h3><span class="method get">GET</span>/health</h3>
                <p>Health check endpoint</p>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span>/api/bot/start</h3>
                <p>Start trading bot</p>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span>/api/bot/stop</h3>
                <p>Stop trading bot</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/bot/status</h3>
                <p>Get bot status</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/data/position</h3>
                <p>Get current position</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/data/balance</h3>
                <p>Get account balance</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/data/market</h3>
                <p>Get market data</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/data/signals/recent</h3>
                <p>Get recent signals</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/config</h3>
                <p>Get configuration</p>
              </div>
              <div class="endpoint">
                <h3><span class="method put">PUT</span>/api/config</h3>
                <p>Update configuration</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/analytics/journal</h3>
                <p>Get trade journal</p>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span>/api/analytics/stats</h3>
                <p>Get trading stats</p>
              </div>
            </div>

            <div class="swagger-ui-link">
              <p>Full API documentation available at:</p>
              <a href="https://swagger.io/tools/swagger-ui/" target="_blank">Swagger UI (see /api/docs/openapi.json)</a>
            </div>
          </div>
        </body>
        </html>
      `);
    });

    // SPA catch-all route: serve index.html for all non-API routes (must be after all API routes)
    this.app.get('*', (req, res) => {
      const indexPath = path.join(webClientPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          // If index.html doesn't exist, return 404
          res.status(404).json({ error: 'Not found' });
        }
      });
    });

    // Global error handler (must be last middleware)
    this.app.use(createErrorHandlerMiddleware());

    // Start Express server with proper error handling and port fallback
    const startServer = (tryPort: number, maxRetries: number = 3): void => {
      const server = this.app.listen(tryPort, () => {
        console.log(`[API] Server running on http://localhost:${tryPort}`);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[API] Port ${tryPort} is already in use`);
          if (maxRetries > 0) {
            const nextPort = tryPort + 100;
            console.log(`[API] Retrying on port ${nextPort}...`);
            setTimeout(() => startServer(nextPort, maxRetries - 1), 500);
          } else {
            console.error(`[API] Failed to find available port after retries`);
            process.exit(1);
          }
        } else {
          console.error(`[API] Server error:`, err.message);
          process.exit(1);
        }
      });

      // Graceful shutdown handler
      process.on('SIGTERM', () => {
        console.log('[API] SIGTERM received, closing server');
        server.close(() => {
          console.log('[API] Server closed gracefully');
          process.exit(0);
        });
      });
    };

    startServer(port);
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(port: number) {
    this.wsService = new WebSocketService(port, this.bridge, this.fileWatcher || undefined);
    console.log(`[WS] Server running on ws://localhost:${port}`);
  }

  /**
   * Setup File Watcher for analytics
   */
  private setupFileWatcher() {
    if (this.fileWatcher) {
      this.fileWatcher.start();
      console.log('[FileWatcher] Started monitoring journal and session files');
    }
  }

  /**
   * Get actual WebSocket port (may differ from config if port was in use)
   */
  getWebSocketPort(): number {
    return this.wsService?.getPort() || WS_PORT;
  }

  /**
   * Close server gracefully
   */
  close() {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
    }
    if (this.wsService) {
      this.wsService.close();
    }
    this.bridge.destroy();
    console.log('[API] Server closed');
  }
}

/**
 * Standalone mode - used for testing without bot
 */
export async function startWebServer(bot: IBotInstance, config?: WebServerConfig): Promise<WebServer> {
  const server = new WebServer(bot, config);
  return server;
}
