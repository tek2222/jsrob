/**
 * Debug Logger
 * A utility class for logging debug messages to both the UI and console
 */

class DebugLogger {
    /**
     * Creates a new DebugLogger instance
     * @param {string} consoleElementId - The ID of the HTML element to use as the debug console
     */
    constructor(consoleElementId = 'debugConsole') {
        this.console = document.getElementById(consoleElementId);
        if (!this.console) {
            console.error(`Debug console element with ID '${consoleElementId}' not found!`);
            throw new Error(`Debug console element with ID '${consoleElementId}' not found`);
        }
        this.log('Debug console initialized', 'success');
    }

    /**
     * Logs a message to both the UI console and browser console
     * @param {string} message - The message to log
     * @param {string} type - The type of message (info, success, warning, error, debug)
     */
    log(message, type = 'info') {
        if (!this.console) {
            console.error('Cannot log, debug console not found:', message);
            return;
        }
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="${type}">${message}</span>`;
        this.console.appendChild(entry);
        this.console.scrollTop = this.console.scrollHeight;
        // Also log to browser console
        console.log(`[${type}] ${message}`);
    }

    /**
     * Logs an info message
     * @param {string} message - The message to log
     */
    info(message) { 
        this.log(message, 'info'); 
    }

    /**
     * Logs a success message
     * @param {string} message - The message to log
     */
    success(message) { 
        this.log(message, 'success'); 
    }

    /**
     * Logs a warning message
     * @param {string} message - The message to log
     */
    warning(message) { 
        this.log(message, 'warning'); 
    }

    /**
     * Logs an error message
     * @param {string} message - The message to log
     */
    error(message) { 
        this.log(message, 'error'); 
    }
    
    /**
     * Logs a debug message (only to browser console by default)
     * @param {string} message - The message to log
     * @param {boolean} showInUI - Whether to show the message in the UI console
     */
    debug(message, showInUI = false) {
        if (showInUI) {
            this.log(message, 'debug');
        } else {
            // Only log to browser console
            console.debug(`[debug] ${message}`);
        }
    }

    /**
     * Clears the debug console
     */
    clear() { 
        this.console.innerHTML = ''; 
    }
} 