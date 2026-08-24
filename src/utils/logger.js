import { EventEmitter } from 'events';

class LiveLogger extends EventEmitter {
  constructor() {
    super();
    this.logsHistory = [];
    this.maxHistory = 100;
  }

  log(level, message, details = null) {
    const timestamp = new Date().toISOString();
    const isTagged = message && typeof message === 'string' && message.startsWith('[');
    const formatted = isTagged
      ? `[${timestamp}] ${message}`
      : `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
      console.error(formatted, details || '');
    } else if (level === 'warn') {
      console.warn(formatted, details || '');
    } else {
      console.log(formatted, details || '');
    }

    const logEntry = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      timestamp,
      level,
      message,
      details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null
    };

    this.logsHistory.push(logEntry);
    if (this.logsHistory.length > this.maxHistory) {
      this.logsHistory.shift();
    }

    this.emit('log', logEntry);
  }

  info(msg, details) { this.log('info', msg, details); }
  warn(msg, details) { this.log('warn', msg, details); }
  error(msg, details) { this.log('error', msg, details); }
  success(msg, details) { this.log('success', msg, details); }
  getHistory() { return this.logsHistory; }
  clearHistory() {
    this.logsHistory = [];
    this.emit('cleared');
  }
}

export const logger = new LiveLogger();
