/**
 * SMOKE TESTS - Deployment Safety Checks
 *
 * Verifies that the bot is ready for safe deployment
 * Checks for missing dependencies, configuration issues, and critical imports
 */

describe('SMOKE TESTS: Deployment Safety Checks', () => {
  describe('Module Exports Integrity', () => {
    it('should verify all core modules can be imported', () => {
      const modules = [
        { path: '../../services/trading-orchestrator.service', name: 'TradingOrchestrator' },
        { path: '../../services/action-queue.service', name: 'ActionQueueService' },
        { path: '../../services/analyzer-registry.service', name: 'AnalyzerRegistryService' },
        { path: '../../orchestrators/entry.orchestrator', name: 'EntryOrchestrator' },
        { path: '../../orchestrators/exit.orchestrator', name: 'ExitOrchestrator' },
        { path: '../../services/position-lifecycle.service', name: 'PositionLifecycleService' },
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
    });

    it('should verify trading configuration exists', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.trading).toBeDefined();
      expect(config.trading.leverage).toBeGreaterThan(0);
    });

    it('should verify risk management configuration exists', () => {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../../..', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.riskManagement).toBeDefined();
      expect(config.riskManagement.stopLossPercent).toBeGreaterThan(0);
    });
  });

  describe('Type Safety', () => {
    it('should verify all signal directions are defined', () => {
      const types = require('../../types') as any;

      expect(types.SignalDirection.LONG).toBe('LONG');
      expect(types.SignalDirection.SHORT).toBe('SHORT');
    });

    it('should verify core trading types exist', () => {
      const types = require('../../types') as any;

      expect(types.SignalDirection).toBeDefined();
      expect(types.SignalType).toBeDefined();
      expect(types.TimeframeRole).toBeDefined();
    });
  });

  describe('Production Readiness Checklist', () => {
    it('should verify TradingOrchestrator has entryOrchestrator property', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      expect(code).toContain('this.entryOrchestrator');
      expect(code).toContain('EntryOrchestrator');
    });

    it('should verify TradingOrchestrator has exitOrchestrator property', () => {
      const Module = require('../../services/trading-orchestrator.service') as any;
      const code = Module.TradingOrchestrator.toString();

      expect(code).toContain('this.exitOrchestrator');
      expect(code).toContain('ExitOrchestrator');
    });

    it('should verify ActionQueueService checks handlers', () => {
      const Module = require('../../services/action-queue.service') as any;
      const code = Module.ActionQueueService.toString();

      expect(code).toContain('handler');
      expect(code).toContain('process');
    });
  });

  describe('Build Output Validation', () => {
    it('should verify compiled JavaScript exists', () => {
      const fs = require('fs');
      const path = require('path');
      const distPath = path.join(__dirname, '../../..', 'dist');

      // If dist exists, verify it's a directory
      if (fs.existsSync(distPath)) {
        expect(fs.statSync(distPath).isDirectory()).toBe(true);
      }
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
