import machineId from 'node-machine-id';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const { machineIdSync } = machineId;

/**
 * Telemetry Service - Analytics via Kodus API
 *
 * Security:
 * - Does NOT expose PostHog API key to users
 * - Sends events to Kodus API which forwards to PostHog
 * - API key stays secure on the server
 *
 * Features:
 * - User can opt-out via `kodus telemetry disable`
 * - Anonymous user ID (machine ID hash)
 * - No sensitive data (file names, code, etc)
 * - Graceful degradation (never breaks the CLI)
 */
class TelemetryService {
  private userId: string | null = null;
  private enabled: boolean = true;
  private configPath: string;
  private apiUrl: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.kodus', 'telemetry.json');
    this.apiUrl = process.env.KODUS_API_URL || 'https://api.kodus.io';
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Check if telemetry is enabled
      this.enabled = await this.isEnabled();

      if (!this.enabled) {
        return;
      }

      // Get or create anonymous user ID
      this.userId = await this.getUserId();
    } catch (error) {
      // Silent fail - telemetry should never break the CLI
      this.enabled = false;
    }
  }

  /**
   * Get anonymous user ID (machine ID)
   */
  private async getUserId(): Promise<string> {
    try {
      // Use machine ID for consistent anonymous tracking
      const machineId = machineIdSync();
      return `anon_${machineId}`;
    } catch {
      // Fallback to random ID
      return `anon_${Math.random().toString(36).substring(7)}`;
    }
  }

  /**
   * Check if telemetry is enabled
   */
  private async isEnabled(): Promise<boolean> {
    try {
      // Check env var first
      if (process.env.KODUS_TELEMETRY === 'false' || process.env.DO_NOT_TRACK === '1') {
        return false;
      }

      // Check config file
      const config = await this.readConfig();
      return config.enabled !== false; // Enabled by default
    } catch {
      return true; // Default to enabled
    }
  }

  /**
   * Read telemetry config
   */
  private async readConfig(): Promise<{ enabled: boolean }> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { enabled: true };
    }
  }

  /**
   * Write telemetry config
   */
  private async writeConfig(config: { enabled: boolean }): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    } catch {
      // Silent fail
    }
  }

  /**
   * Track an event
   */
  async track(eventName: string, properties?: Record<string, any>): Promise<void> {
    if (!this.enabled || !this.userId) {
      return;
    }

    try {
      // Add common properties
      const enrichedProperties = {
        ...properties,
        cli_version: '0.1.0',
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        timestamp: new Date().toISOString(),
      };

      // Remove any potentially sensitive data
      const sanitized = this.sanitizeProperties(enrichedProperties);

      // Send to Kodus API (which forwards to PostHog securely)
      await this.sendEvent({
        distinctId: this.userId,
        event: eventName,
        properties: sanitized,
      });
    } catch {
      // Silent fail - telemetry should never break the CLI
    }
  }

  /**
   * Send event to Kodus API
   */
  private async sendEvent(payload: {
    distinctId: string;
    event: string;
    properties: Record<string, any>;
  }): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/telemetry/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Don't throw on failure - telemetry is best-effort
      if (!response.ok) {
        if (process.env.KODUS_VERBOSE) {
          console.error('Telemetry event failed:', response.statusText);
        }
      }
    } catch (error) {
      // Silent fail
      if (process.env.KODUS_VERBOSE) {
        console.error('Telemetry error:', error);
      }
    }
  }

  /**
   * Sanitize properties to remove sensitive data
   */
  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip potentially sensitive keys
      if (key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')) {
        continue;
      }

      // Sanitize file paths (keep only basename)
      if (typeof value === 'string' && (value.includes('/') || value.includes('\\'))) {
        sanitized[key] = path.basename(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Enable telemetry
   */
  async enable(): Promise<void> {
    await this.writeConfig({ enabled: true });
    this.enabled = true;
    await this.initialize();
  }

  /**
   * Disable telemetry (opt-out)
   */
  async disable(): Promise<void> {
    await this.writeConfig({ enabled: false });
    this.enabled = false;
  }

  /**
   * Check if telemetry is currently enabled
   */
  async status(): Promise<boolean> {
    return this.enabled;
  }

  /**
   * Identify user (when authenticated)
   */
  async identify(userId: string, traits?: Record<string, any>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.sendEvent({
        distinctId: userId,
        event: '$identify',
        properties: {
          $set: traits,
        },
      });
    } catch {
      // Silent fail
    }
  }

  /**
   * Shutdown (cleanup)
   */
  async shutdown(): Promise<void> {
    // No cleanup needed with HTTP-based telemetry
  }
}

export const telemetryService = new TelemetryService();
