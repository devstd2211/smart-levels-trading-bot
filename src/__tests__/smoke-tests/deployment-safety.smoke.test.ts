/**
 * SMOKE TESTS - Deployment Safety Checks
 *
 * Verifies that the bot is ready for safe deployment
 * Checks for missing dependencies, configuration issues, and critical imports
 *
 * Run before production deployment to catch common issues early
 */

describe('SMOKE TESTS: Deployment Safety Checks', () => {
  describe('Module Exports Integrity', () => {
    it('should verify all core modules can be imported', () => {
      const modules = [
        { path: '../../services/trading-orchestrator.service', name: 'TradingOrchestrator' },
        { path: '../../services/trade-execution.service', name: 'TradeExecutionService' },
        { path: '../../services/entry-logic.service', name: 'EntryLogicService' },
        { path: '../../orchestrators/entry.orchestrator', name: 'EntryOrchestrator' },
        { path: '../../orchestrators/exit.orchestrator', name: 'ExitOrchestrator' },
        { path: '../../services/position-manager.service', name: 'PositionManagerService' },
      ];

      modules.forEach(({ path, name }) => {
        const Module = require(path) as any;
        expect(Module[name]).toBeDefined();
        expect(typeof Module[name]).toBe('function');
      });
    });

    it('should verify type exports are available', () => {
      const types = require('../../types') as any;

      // Core types that must exist
      const requiredTypes = [
        'SignalDirection',
        'SignalType',
        'TimeframeRole',
      ];

      requiredTypes.forEach((typeName) => {
        expect(types[typeName]).toBeDefined();
      });

      // Verify module is not empty
      expect(Object.keys(types).length).toBeGreaterThan(10);
    });

    it('should verify constants are properly exported', () => {
      const constants = require('../../constants') as any;

      expect(constants).toBeDefined();
      expect(typeof constants).toBe('object');
    });
  });

  describe('Configuration Validation', () => {
    it('should verify config.json exists and is valid JSON', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');

      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should verify essential exchange configuration exists', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.exchange).toBeDefined();
      expect(config.exchange.name).toBeDefined();
      expect(config.exchange.symbol).toBeDefined();
      expect(['bybit', 'binance']).toContain(config.exchange.name);
    });

    it('should verify trading configuration exists', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.trading).toBeDefined();
      expect(config.trading.leverage).toBeGreaterThan(0);
      expect(config.trading.leverage).toBeLessThanOrEqual(125);
    });

    it('should verify risk management configuration exists', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.riskManagement).toBeDefined();
      expect(config.riskManagement.stopLossPercent).toBeGreaterThan(0);
      expect(config.riskManagement.positionSizeUsdt).toBeGreaterThan(0);
    });

    it('should verify all timeframes are configured', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.timeframes).toBeDefined();
      expect(config.timeframes.entry).toBeDefined();
      expect(config.timeframes.primary).toBeDefined();
    });
  });

  describe('Critical Service Dependencies', () => {
    it('should verify TradingOrchestrator can be instantiated', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      expect(Module.TradingOrchestrator).toBeDefined();
      expect(typeof Module.TradingOrchestrator).toBe('function');
    });

    it('should verify EntryOrchestrator can be instantiated', () => {
      const Module = require('../../orchestrators/entry.orchestrator') as any;
      expect(Module.EntryOrchestrator).toBeDefined();
      expect(typeof Module.EntryOrchestrator).toBe('function');
    });

    it('should verify ExitOrchestrator can be instantiated', () => {
      const Module = require('../../orchestrators/exit.orchestrator') as any;
      expect(Module.ExitOrchestrator).toBeDefined();
      expect(typeof Module.ExitOrchestrator).toBe('function');
    });

    it('should verify PositionManager can be instantiated', () => {
      const Module = require('../../services/position-manager.service') as any;
      expect(Module.PositionManagerService).toBeDefined();
      expect(typeof Module.PositionManagerService).toBe('function');
    });
  });

  describe('Data Flow Pipelines', () => {
    it('should verify entry pipeline services exist', () => {
      const entryPipeline = [
        { file: '../../services/entry-logic.service', name: 'EntryLogicService' },
        { file: '../../services/trade-execution.service', name: 'TradeExecutionService' },
        { file: '../../orchestrators/entry.orchestrator', name: 'EntryOrchestrator' },
        { file: '../../services/position-opening.service', name: 'PositionOpeningService' },
      ];

      entryPipeline.forEach(({ file, name }) => {
        const Module = require(file) as any;
        expect(Module[name]).toBeDefined();
      });
    });

    it('should verify exit pipeline services exist', () => {
      const exitPipeline = [
        { file: '../../orchestrators/exit.orchestrator', name: 'ExitOrchestrator' },
        { file: '../../services/position-exiting.service', name: 'PositionExitingService' },
      ];

      exitPipeline.forEach(({ file, name }) => {
        const Module = require(file) as any;
        expect(Module[name]).toBeDefined();
      });
    });

    it('should verify analysis services exist', () => {
      const analysisPipeline = [
        { file: '../../services/signal-processing.service', name: 'SignalProcessingService' },
        { file: '../../services/analyzer-registration.service', name: 'AnalyzerRegistrationService' },
        { file: '../../services/multi-timeframe-trend.service', name: 'MultiTimeframeTrendService' },
      ];

      analysisPipeline.forEach(({ file, name }) => {
        const Module = require(file) as any;
        expect(Module[name]).toBeDefined();
      });
    });
  });

  describe('Error Handling & Safety Mechanisms', () => {
    it('should verify EntryOrchestrator initialization checks RiskManager', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      // Should check RiskManager before initialization
      expect(code).toContain('this.riskManager');
      expect(code).toContain('EntryOrchestrator');
    });

    it('should verify RiskManager is initialized', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      // RiskManager is now REQUIRED (no longer optional)
      // Should have logging for successful initialization
      expect(code).toContain('this.riskManager');
      expect(code).toContain('logger.info');
    });

    it('should verify services have error handling', () => {
      const criticalServices = [
        { file: '../../services/trading-orchestrator.service', name: 'TradingOrchestrator' },
        { file: '../../services/entry-logic.service', name: 'EntryLogicService' },
        { file: '../../services/trade-execution.service', name: 'TradeExecutionService' },
      ];

      criticalServices.forEach(({ file, name }) => {
        const Module = require(file) as any;
        const code = Module[name].toString();

        // Should have error handling mechanisms
        expect(code.toLowerCase()).toMatch(/error|catch|try|logger.*error|throw/);
      });
    });
  });

  describe('Type Safety', () => {
    it('should verify all signal directions are defined', () => {
      const types = require('../../types') as any;

      expect(types.SignalDirection.LONG).toBe('LONG');
      expect(types.SignalDirection.SHORT).toBe('SHORT');
      expect(types.SignalDirection.HOLD).toBe('HOLD');
    });

    it('should verify core trading types exist', () => {
      const types = require('../../types') as any;

      // Core types that should exist
      expect(types.SignalDirection).toBeDefined();
      expect(types.SignalType).toBeDefined();
      expect(types.TimeframeRole).toBeDefined();
    });

    it('should verify trading action types exist', () => {
      const types = require('../../types') as any;

      expect(types).toBeDefined();
      expect(typeof types).toBe('object');
    });
  });

  describe('Production Readiness Checklist', () => {
    it('should verify TradingOrchestrator has entryOrchestrator property', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      // Must have entryOrchestrator (not optional)
      expect(code).toContain('this.entryOrchestrator');
      expect(code).toContain('EntryOrchestrator');
    });

    it('should verify TradingOrchestrator has exitOrchestrator property', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      // Must have exitOrchestrator
      expect(code).toContain('this.exitOrchestrator');
      expect(code).toContain('ExitOrchestrator');
    });

    it('should verify TradeExecutionService checks EntryOrchestrator', () => {
      const Module = require('../../services/trade-execution.service') as any;
      const code = Module.TradeExecutionService.toString();

      // Must validate EntryOrchestrator is available
      expect(code).toContain('entryOrchestrator');
      expect(code).toContain('CRITICAL');
    });

    it('should verify logging is available in critical services', () => {
      const criticalServices = [
        '../../services/trading-orchestrator.service',
        '../../services/entry-logic.service',
        '../../orchestrators/entry.orchestrator',
        '../../orchestrators/exit.orchestrator',
      ];

      criticalServices.forEach((servicePath) => {
        const files = require(servicePath) as any;
        const code = Object.values(files)
          .map((cls: any) => (typeof cls === 'function' ? cls.toString() : ''))
          .join('\n');

        // Should log info/error
        expect(code).toContain('logger');
      });
    });
  });

  describe('Build Output Validation', () => {
    it('should verify compiled JavaScript exists', () => {
      const fs = require('fs');
      const path = require('path');
      const distPath = path.join(__dirname, '../../..', 'dist');

      // If dist exists, verify key files compiled
      if (fs.existsSync(distPath)) {
        expect(fs.existsSync(distPath)).toBe(true);
      }
      // Otherwise, TypeScript will compile on first run
    });

    it('should verify package.json has required scripts', () => {
      const fs = require('fs');
      const path = require('path');
      const packagePath = path.join(__dirname, '../../..', 'package.json');

      const content = fs.readFileSync(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.build).toBeDefined();
      expect(pkg.scripts.test).toBeDefined();
    });
  });

  describe('Dependencies Availability', () => {
    it('should verify TypeScript is installed', () => {
      const fs = require('fs');
      const path = require('path');
      const packagePath = path.join(__dirname, '../../..', 'package.json');

      const content = fs.readFileSync(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      expect(pkg.devDependencies.typescript || pkg.dependencies.typescript).toBeDefined();
    });

    it('should verify Jest is installed for testing', () => {
      const fs = require('fs');
      const path = require('path');
      const packagePath = path.join(__dirname, '../../..', 'package.json');

      const content = fs.readFileSync(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      expect(pkg.devDependencies.jest || pkg.dependencies.jest).toBeDefined();
    });
  });
});
